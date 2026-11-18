
/* GORA 2.0 — LOAN MODULE
   Read-only module using the existing Supabase database.
   Financial posting must be implemented through secure RPCs.
*/
(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);

  const money = n => new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 2
  }).format(Number(n || 0));

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;'
  })[c]);

  const date = v => {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d) ? esc(v) :
      d.toLocaleDateString('en-KE', {
        timeZone: 'Africa/Nairobi',
        dateStyle: 'medium'
      });
  };

  const sections = [
    ['overview', 'Overview'],
    ['products', 'Loan products'],
    ['applications', 'Applications'],
    ['fees', 'Processing fees'],
    ['accounts', 'Loan accounts'],
    ['schedules', 'Repayment schedules'],
    ['repayments', 'Repayments'],
    ['accounting', 'Loan accounting'],
    ['reports', 'Loan reports']
  ];

  let currentSection = 'overview';

  function context() {
    return {
      database: typeof db !== 'undefined' ? db : null,
      org: typeof organizationId !== 'undefined'
        ? organizationId : null
    };
  }

  async function records(table, order = 'created_at') {
    const { database, org } = context();

    if (!database || !org) {
      throw new Error('Please sign in again.');
    }

    let query = database
      .from(table)
      .select('*')
      .eq('organization_id', org)
      .limit(500);

    if (order) {
      query = query.order(order, { ascending: false });
    }

    const { data, error } = await query;

    if (error) throw error;

    return data || [];
  }

  function status(value) {
    return `<span class="pill">${esc(value || 'UNKNOWN')}</span>`;
  }

  function table(headers, rows) {
    return `
      <div class="tablebox">
        <table>
          <thead>
            <tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.length ? rows.join('') : `
              <tr>
                <td colspan="${headers.length}" class="empty">
                  No records found.
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    `;
  }

  function cell(value) {
    return `<td>${esc(value ?? '—')}</td>`;
  }

  function cash(value) {
    return `<td>${money(value)}</td>`;
  }

  function panel(title, content) {
    return `
      <section class="panel">
        <h3>${esc(title)}</h3>
        ${content}
      </section>
    `;
  }

  function metric(title, value) {
    return `
      <article class="stat">
        <small>${esc(title)}</small>
        <strong>${esc(value)}</strong>
      </article>
    `;
  }

  function layout() {
    const tabs = sections.map(([id, name]) => `
      <button
        type="button"
        class="secondary"
        data-loan-tab="${id}"
        ${currentSection === id ? 'aria-current="page"' : ''}
      >${name}</button>
    `).join('');

    $('#pageTitle').textContent = 'Loan Module';

    const crumb = $('#crumb');
    if (crumb) crumb.textContent = 'CREDIT OPERATIONS';

    $('#content').innerHTML = `
      <div class="page-head">
        <div>
          <h2>Loan management</h2>
          <p>Manage and monitor GORA loan records.</p>
        </div>
      </div>

      <div class="loan-tabs">${tabs}</div>

      <div id="loan-content">
        <div class="loading">Loading loan records...</div>
      </div>

      <div class="hint">
        Financial transactions are protected. This version is read-only.
        It does not disburse loans or post repayments.
      </div>
    `;

    $('#content').querySelectorAll('[data-loan-tab]')
      .forEach(button => {
        button.addEventListener('click', () => {
          currentSection = button.dataset.loanTab;
          layout();
          render();
        });
      });
  }

  function showError(error) {
    $('#loan-content').innerHTML = panel(
      'Unable to load records',
      `
        <p>${esc(error.message || error)}</p>
        <button class="secondary" id="loan-retry">
          Try again
        </button>
      `
    );

    $('#loan-retry')?.addEventListener('click', render);
  }

  async function render() {
    const host = $('#loan-content');
    if (!host) return;

    host.innerHTML = '<div class="loading">Loading...</div>';

    try {
      let html = '';

      if (currentSection === 'overview') {
        const [products, apps, accounts, repayments] =
          await Promise.all([
            records('loan_products'),
            records('loan_applications', 'applied_at'),
            records('loan_accounts'),
            records('loan_repayments', 'payment_date')
          ]);

        const pending = apps.filter(x =>
          ['PENDING', 'SUBMITTED', 'PENDING_REVIEW']
            .includes(String(x.status).toUpperCase())
        );

        html = `
          <div class="stats">
            ${metric('Loan products', products.length)}
            ${metric('Applications', apps.length)}
            ${metric('Pending applications', pending.length)}
            ${metric('Loan accounts', accounts.length)}
            ${metric('Repayments recorded', repayments.length)}
          </div>

          ${panel('Recent applications', table(
            ['Application', 'Borrower', 'Requested', 'Status', 'Date'],
            apps.slice(0, 10).map(x => `
              <tr>
                ${cell(x.application_number)}
                ${cell(x.borrower_type)}
                ${cash(x.requested_amount)}
                <td>${status(x.status)}</td>
                ${cell(date(x.applied_at))}
              </tr>
            `)
          ))}

          ${panel('Important financial safeguards', `
            <ul>
              <li>Member savings are liabilities, not lending capital.</li>
              <li>Approved loans are not automatically disbursed loans.</li>
              <li>Repayments must be allocated against schedules.</li>
              <li>All financial postings must be traceable.</li>
            </ul>
          `)}
        `;
      }

      if (currentSection === 'products') {
        const rows = await records('loan_products');

        html = panel('Loan products', table(
          ['Code', 'Product', 'Minimum', 'Maximum', 'Rate', 'Method', 'Status'],
          rows.map(x => `
            <tr>
              ${cell(x.product_code)}
              ${cell(x.product_name)}
              ${cash(x.minimum_amount)}
              ${cash(x.maximum_amount)}
              ${cell(x.interest_rate)}
              ${cell(x.interest_method)}
              <td>${status(x.status)}</td>
            </tr>
          `)
        ));
      }

      if (currentSection === 'applications') {
        const rows = await records(
          'loan_applications', 'applied_at'
        );

        html = panel('Loan applications', table(
          ['Application', 'Borrower', 'Requested', 'Approved', 'Status', 'Date'],
          rows.map(x => `
            <tr>
              ${cell(x.application_number)}
              ${cell(x.borrower_type)}
              ${cash(x.requested_amount)}
              ${cash(x.approved_amount)}
              <td>${status(x.status)}</td>
              ${cell(date(x.applied_at))}
            </tr>
          `)
        ));
      }

      if (currentSection === 'fees') {
        let rows;

        try {
          rows = await records(
            'loan_processing_fee_payments'
          );
        } catch (error) {
          html = panel('Processing fees', `
            <p>The processing-fee register is not installed yet.</p>
            <p>Fees must be entered manually for each application.</p>
          `);
        }

        if (rows) {
          html = panel('Processing fee payments', table(
            ['Application', 'Amount', 'Method', 'Reference', 'Date', 'Status'],
            rows.map(x => `
              <tr>
                ${cell(x.application_id)}
                ${cash(x.amount)}
                ${cell(x.payment_method)}
                ${cell(x.reference_number)}
                ${cell(date(x.payment_date))}
                <td>${status(x.status)}</td>
              </tr>
            `)
          ));
        }
      }

      if (currentSection === 'accounts') {
        const rows = await records('loan_accounts');

        html = panel('Loan accounts', table(
          ['Account', 'Application', 'Principal', 'Interest', 'Total repayment', 'Status'],
          rows.map(x => `
            <tr>
              ${cell(x.loan_number || x.id)}
              ${cell(x.application_id)}
              ${cash(x.principal_amount)}
              ${cash(x.total_interest)}
              ${cash(x.total_repayment)}
              <td>${status(x.status)}</td>
            </tr>
          `)
        ));
      }

      if (currentSection === 'schedules') {
        const rows = await records(
          'loan_repayment_schedules', 'due_date'
        );

        html = panel('Repayment schedules', table(
          ['Loan account', 'Installment', 'Due date', 'Principal', 'Interest', 'Total', 'Status'],
          rows.map(x => `
            <tr>
              ${cell(x.loan_account_id)}
              ${cell(x.installment_number)}
              ${cell(date(x.due_date))}
              ${cash(x.principal_due)}
              ${cash(x.interest_due)}
              ${cash(x.total_due)}
              <td>${status(x.status)}</td>
            </tr>
          `)
        ));
      }

      if (currentSection === 'repayments') {
        const rows = await records(
          'loan_repayments', 'payment_date'
        );

        html = panel('Repayments', table(
          ['Loan account', 'Payment date', 'Amount', 'Method', 'Reference', 'Status'],
          rows.map(x => `
            <tr>
              ${cell(x.loan_account_id)}
              ${cell(date(x.payment_date))}
              ${cash(x.amount)}
              ${cell(x.payment_method)}
              ${cell(x.reference_number)}
              <td>${status(x.status)}</td>
            </tr>
          `)
        ));
      }

      if (currentSection === 'accounting') {
        const rows = await records(
          'journal_entries', 'entry_date'
        );

        const loanRows = rows.filter(x =>
          String(x.source_type || '')
            .toLowerCase().includes('loan')
        );

        html = panel('Loan journal entries', table(
          ['Entry number', 'Date', 'Description', 'Source', 'Status'],
          loanRows.map(x => `
            <tr>
              ${cell(x.entry_number)}
              ${cell(date(x.entry_date))}
              ${cell(x.description)}
              ${cell(x.source_type)}
              <td>${status(x.status)}</td>
            </tr>
          `)
        ));
      }

      if (currentSection === 'reports') {
        const [accounts, schedules, repayments] =
          await Promise.all([
            records('loan_accounts'),
            records('loan_repayment_schedules', 'due_date'),
            records('loan_repayments', 'payment_date')
          ]);

        const today = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Africa/Nairobi'
        }).format(new Date());

        const overdue = schedules.filter(x =>
          x.due_date < today &&
          !['PAID', 'SETTLED', 'CLOSED']
            .includes(String(x.status).toUpperCase())
        );

        const overdueAmount = overdue.reduce(
          (sum, x) => sum + Number(x.total_due || 0), 0
        );

        const collected = repayments
          .filter(x => String(x.status).toUpperCase() === 'POSTED')
          .reduce((sum, x) => sum + Number(x.amount || 0), 0);

        html = `
          <div class="stats">
            ${metric('Loan accounts', accounts.length)}
            ${metric('Overdue instalments', overdue.length)}
            ${metric('Gross overdue scheduled', money(overdueAmount))}
            ${metric('Posted repayments', money(collected))}
          </div>

          ${panel('Portfolio risk', `
            <p>
              These are preliminary schedule figures.
              Accurate arrears and PAR require posted repayment
              allocations to be deducted from each schedule.
            </p>
            <p>No verified PAR percentage is reported here.
            </p>
          `)}
        `;
      }

      host.innerHTML = html;

    } catch (error) {
      showError(error);
    }
  }

  function open() {
    currentSection = 'overview';
    layout();
    render();
  }

  function installNavigation() {
    const nav = $('#nav');
    if (!nav || nav.querySelector('[data-page="Loan Module"]')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-item';
    button.dataset.page = 'Loan Module';
    button.innerHTML = '<span>▣</span>Loan Module';

    const credit = [...nav.querySelectorAll('.nav-label')]
      .find(x => x.textContent.trim().toUpperCase() === 'CREDIT');

    if (credit) {
      credit.insertAdjacentElement('afterend', button);
    } else {
      nav.appendChild(button);
    }

    nav.addEventListener('click', event => {
      const target = event.target.closest(
        '[data-page="Loan Module"]'
      );

      if (!target) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      nav.querySelectorAll('.nav-item').forEach(x =>
        x.classList.toggle('active', x === target)
      );

      $('#sidebar')?.classList.remove('open');
      open();
    }, true);
  }

  function installStyles() {
    if ($('#loan-module-style')) return;

    const style = document.createElement('style');
    style.id = 'loan-module-style';

    style.textContent = `
      .loan-tabs {
        display:flex;
        flex-wrap:wrap;
        gap:8px;
        margin-bottom:16px;
      }
      .loan-tabs button {
        font-size:12px;
        padding:9px 12px;
      }
      .loan-tabs button[aria-current="page"] {
        background:#075985;
        color:white;
      }
      #loan-content .panel { overflow:auto; }
      #loan-content ul {
        padding-left:22px;
        line-height:1.9;
        font-size:13px;
      }
    `;

    document.head.appendChild(style);
  }

  window.GoraLoanModule = { open, refresh: render };

  installStyles();
  installNavigation();
  document.addEventListener('DOMContentLoaded', installNavigation);
})();
