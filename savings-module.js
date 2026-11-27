
/* GORA 2.0 — Savings & Shares module
 * File: savings-module.js
 * Uses existing savings_accounts and savings_transactions tables.
 * Secure RPC SQL must be installed before posting transactions.
 */
(() => {
  const $ = id => document.getElementById(id);

  const money = n => new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 2
  }).format(Number(n || 0));

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

  const date = v => v
    ? new Date(v).toLocaleDateString('en-KE', {
        timeZone: 'Africa/Nairobi'
      })
    : '—';

  let accounts = [];
  let members = [];
  let transactions = [];
  let accountBalances = [];
  let search = '';

  async function load(ctx) {
    const { data: a, error: ae } = await ctx.db
      .from('savings_accounts')
      .select(
        'id,organization_id,member_id,account_number,status,opened_at,branch_id'
      )
      .eq('organization_id', ctx.organization.id)
      .order('opened_at', { ascending: false });

    if (ae) throw ae;

    accounts = a || [];
const { data: balancesData, error: balancesError } =
  await ctx.db.rpc('get_savings_account_balances', {
    _organization_id: ctx.organization.id
  });

if (balancesError) throw balancesError;

accountBalances = balancesData || [];
    const memberIds = [
      ...new Set(accounts.map(a => a.member_id))
    ];

    const { data: m, error: me } = memberIds.length
      ? await ctx.db
          .from('members')
          .select('id,member_number,full_name,phone,status')
          .eq('organization_id', ctx.organization.id)
          .in('id', memberIds)
      : { data: [], error: null };

    if (me) throw me;

    members = m || [];

    const accountIds = accounts.map(a => a.id);

    const { data: t, error: te } = accountIds.length
      ? await ctx.db
          .from('savings_transactions')
          .select(
            'id,savings_account_id,transaction_number,transaction_type,amount,payment_method,reference_number,status,description,transaction_date,posted_at'
          )
          .eq('organization_id', ctx.organization.id)
          .in('savings_account_id', accountIds)
          .order('transaction_date', { ascending: false })
          .limit(500)
      : { data: [], error: null };

    if (te) throw te;

    transactions = t || [];
  }

  const member = id =>
    members.find(m => m.id === id) || {};
  const balance = accountId =>
    Number(
      accountBalances.find(
        b => b.savings_account_id === accountId
      )?.posted_balance || 0
    );

  const canPost = ctx =>
    ['SUPER_ADMIN', 'MANAGER', 'ACCOUNTANT', 'CASHIER']
      .includes(ctx.profile?.roleCode);

  function renderPage(ctx) {
    const total = accounts.reduce((s, a) =>
      s + (a.status === 'CLOSED' ? 0 : balance(a.id)), 0);

    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Africa/Nairobi'
    });

    const netToday = transactions
      .filter(t =>
        t.status === 'POSTED' &&
        String(t.transaction_date).slice(0, 10) === today
      )
      .reduce((s, t) =>
        s + (
          t.transaction_type === 'DEPOSIT'
            ? Number(t.amount)
            : t.transaction_type === 'WITHDRAWAL'
              ? -Number(t.amount)
              : 0
        ), 0);

    const active = accounts.filter(
      a => a.status === 'ACTIVE'
    ).length;

    $('pageContent').innerHTML = `
      <div class="page-heading">
        <div>
          <h2>Savings &amp; Shares</h2>
          <p>Member savings accounts, deposits, withdrawals and balances.</p>
        </div>

        <div class="heading-actions">
          <button class="btn btn-soft" id="savRefresh">
            Refresh
          </button>

          ${canPost(ctx)
            ? '<button class="btn btn-primary" id="savNew">＋ Record transaction</button>'
            : ''}
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card stat-blue">
          <div class="stat-top">Savings liabilities</div>
          <strong>${money(total)}</strong>
          <small>Posted member savings</small>
        </div>

        <div class="stat-card stat-teal">
          <div class="stat-top">Open accounts</div>
          <strong>${active}</strong>
          <small>Active savings accounts</small>
        </div>

        <div class="stat-card stat-purple">
          <div class="stat-top">Today's net movement</div>
          <strong>${money(netToday)}</strong>
          <small>Deposits less withdrawals</small>
        </div>

        <div class="stat-card stat-orange">
          <div class="stat-top">Transactions loaded</div>
          <strong>${transactions.length}</strong>
          <small>Latest 500 records</small>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Savings accounts</h3>
            <p>Balances are calculated from posted deposits and withdrawals.</p>
          </div>
        </div>

        <div class="toolbar">
          <input
            id="savSearch"
            type="search"
            placeholder="Search member or account number…"
            value="${esc(search)}"
          >
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Member no.</th>
                <th>Account no.</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Opened</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="savRows"></tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Recent transactions</h3>
            <p>Posted and pending entries.</p>
          </div>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Transaction no.</th>
                <th>Member</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${transactions.slice(0, 40).map(t => `
                <tr>
                  <td>${date(t.transaction_date)}</td>
                  <td>${esc(t.transaction_number)}</td>
                  <td>${esc(
                    member(
                      accounts.find(
                        a => a.id === t.savings_account_id
                      )?.member_id
                    ).full_name || '—'
                  )}</td>
                  <td>${esc(t.transaction_type)}</td>
                  <td>${money(t.amount)}</td>
                  <td>${esc(t.payment_method)}</td>
                  <td>${esc(t.status)}</td>
                </tr>
              `).join('') ||
                '<tr><td colspan="7">No savings transactions yet.</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>
    `;

    drawAccounts(ctx);

    $('savRefresh').onclick = () =>
      render('Savings', ctx);

    if ($('savNew')) {
      $('savNew').onclick = () =>
        transactionModal(ctx);
    }

    $('savSearch').oninput = e => {
      search = e.target.value;
      drawAccounts(ctx);
    };
  }

  function drawAccounts(ctx) {
    const term = search.toLowerCase();

    const list = accounts.filter(a => {
      const m = member(a.member_id);

      return [
        m.full_name,
        m.member_number,
        a.account_number
      ].join(' ').toLowerCase().includes(term);
    });

    $('savRows').innerHTML = list.map(a => {
      const m = member(a.member_id);

      return `
        <tr>
          <td>
            <b>${esc(m.full_name || 'Member')}</b>
            <small>${esc(m.phone || '')}</small>
          </td>
          <td>${esc(m.member_number || '—')}</td>
          <td>${esc(a.account_number)}</td>
          <td><b>${money(balance(a.id))}</b></td>
          <td>${esc(a.status)}</td>
          <td>${date(a.opened_at)}</td>
          <td>
            ${canPost(ctx) && a.status === 'ACTIVE'
              ? `
                <button class="btn btn-soft savDep" data-id="${a.id}">
                  Deposit
                </button>
                <button class="btn btn-soft savWit" data-id="${a.id}">
                  Withdraw
                </button>
              `
              : '—'}
          </td>
        </tr>
      `;
    }).join('') ||
      '<tr><td colspan="7">No savings accounts found.</td></tr>';

    document.querySelectorAll('.savDep').forEach(b => {
      b.onclick = () =>
        transactionModal(ctx, b.dataset.id, 'DEPOSIT');
    });

    document.querySelectorAll('.savWit').forEach(b => {
      b.onclick = () =>
        transactionModal(ctx, b.dataset.id, 'WITHDRAWAL');
    });
  }

  function transactionModal(ctx, accountId = '', type = 'DEPOSIT') {
    const activeMembers = members.filter(
      m => m.status === 'ACTIVE'
    );

    const accountOptions = accounts
      .filter(a => a.status === 'ACTIVE')
      .map(a => `
        <option value="${a.id}" ${a.id === accountId ? 'selected' : ''}>
          ${esc(member(a.member_id).full_name)} — ${esc(a.account_number)}
        </option>
      `).join('');

    const newMemberOptions = activeMembers
      .filter(m =>
        !accounts.some(a => a.member_id === m.id)
      )
      .map(m => `
        <option value="${m.id}">
          ${esc(m.full_name)} (${esc(m.member_number || 'No member number')})
        </option>
      `).join('');

    const body = `
      <form id="savForm" class="form-grid">
        <div class="form-field full-span">
          <label>
            Existing account
            <select name="account_id">
              <option value="">Choose account</option>
              ${accountOptions}
            </select>
          </label>
        </div>

        <div class="form-field full-span">
          <label>
            Or open an account for an active member
            <select name="new_member_id">
              <option value="">Do not open new account</option>
              ${newMemberOptions}
            </select>
          </label>
        </div>

        <div class="form-field">
          <label>
            Transaction type
            <select name="type">
              <option value="DEPOSIT" ${type === 'DEPOSIT' ? 'selected' : ''}>
                Deposit
              </option>
              <option value="WITHDRAWAL" ${type === 'WITHDRAWAL' ? 'selected' : ''}>
                Withdrawal
              </option>
            </select>
          </label>
        </div>

        <div class="form-field">
          <label>
            Amount (KSh)
            <input name="amount" type="number" min="0.01" step="0.01" required>
          </label>
        </div>

        <div class="form-field">
          <label>
            Payment method
            <select name="method" required>
              <option value="CASH">Cash</option>
              <option value="MPESA">M-Pesa</option>
              <option value="BANK">Bank</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
        </div>

        <div class="form-field">
          <label>
            Reference number
            <input name="reference" maxlength="100">
          </label>
        </div>

        <div class="form-field full-span">
          <label>
            Description
            <input name="description" maxlength="250">
          </label>
        </div>

        <div class="form-field full-span">
          <div class="note-box">
            Confirm the member and amount. The database validates permissions
            and available savings before posting.
          </div>
        </div>
      </form>
    `;

    openModal(
      'Savings transaction',
      'Record a member deposit or withdrawal.',
      body,
      '<button class="btn btn-neutral" id="savCancel">Cancel</button><button class="btn btn-primary" id="savSave">Post transaction</button>',
      true
    );

    $('savCancel').onclick = closeModal;

    $('savSave').onclick = async () => {
      const f = $('savForm');
      const v = new FormData(f);
      const amount = Number(v.get('amount'));

      if (!Number.isFinite(amount) || amount <= 0) {
        ctx.toast('Enter a valid amount.', 'error');
        return;
      }

      try {
        let chosenAccount = v.get('account_id');
        const newMember = v.get('new_member_id');

        if (newMember) {
          const { data, error } = await ctx.db.rpc(
            'gora2_savings_open_account',
            {
              p_organization_id: ctx.organization.id,
              p_member_id: newMember,
              p_branch_id: null
            }
          );

          if (error) throw error;

          chosenAccount = Array.isArray(data)
            ? data[0]?.account_id
            : typeof data === 'string'
              ? data
              : data?.account_id;
        }

        if (!chosenAccount) {
          ctx.toast(
            'Choose an account or an active member.',
            'error'
          );
          return;
        }

        const { error } = await ctx.db.rpc(
          'gora2_savings_post_transaction',
          {
            p_organization_id: ctx.organization.id,
            p_account_id: chosenAccount,
            p_transaction_type: v.get('type'),
            p_amount: amount,
            p_payment_method: v.get('method'),
            p_reference_number:
              String(v.get('reference') || '').trim() || null,
            p_description:
              String(v.get('description') || '').trim() || null,
            p_branch_id: null
          }
        );

        if (error) throw error;

        closeModal();
        ctx.toast('Savings transaction posted.');
        await render('Savings', ctx);

      } catch (e) {
        ctx.toast(
          e.message || 'Unable to post savings transaction.',
          'error'
        );
      }
    };
  }

  async function render(name, ctx) {
    $('pageTitle').textContent = 'Savings & Shares';
    $('pageContent').innerHTML =
      '<div class="loading-panel">Loading savings…</div>';

    try {
      await load(ctx);
      renderPage(ctx);

    } catch (e) {
      $('pageContent').innerHTML = `
        <div class="warning-box">
          <b>Savings module could not load.</b><br>
          ${esc(e.message || 'Database request failed')}
        </div>
        <button class="btn btn-soft" id="savRetry">
          Try again
        </button>
      `;

      $('savRetry').onclick = () =>
        render(name, ctx);
    }
  }

  window.GORASavingsModule = {
    handles: name => name === 'Savings',
    render
  };
})();
