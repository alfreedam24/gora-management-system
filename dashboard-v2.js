
/* GORA 2.0 — Simple Dashboard
   Uses verified GORA table names from dashboard-v2.js.
   Read-only dashboard. Does not create or change financial records.
*/
(() => {
  'use strict';

  const money = n => new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0
  }).format(Number(n || 0));

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

  const low = v => String(v || '').trim().toLowerCase();

  const sum = (rows, fn = x => x.amount) =>
    rows.reduce((n, x) => n + Number(fn(x) || 0), 0);

  const dayKey = v => {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  };

  const monthKey = v => String(v || '').slice(0, 7);

  const monthLabel = k => new Date(k + '-01T12:00:00')
    .toLocaleDateString('en-KE', {
      month: 'short',
      year: '2-digit'
    });

  const monthsBack = n => {
    const now = new Date();
    const out = [];

    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      );
    }

    return out;
  };

  const card = (label, value, note, page, tone = '') => `
    <button type="button"
      class="gora-simple-card ${tone}"
      data-gora-page="${esc(page)}">
      <span>${esc(label)}</span>
      <strong>${value}</strong>
      <small>${esc(note)}</small>
    </button>
  `;

  const panel = (title, body, note = '') => `
    <section class="gora-simple-panel">
      <header>
        <h3>${esc(title)}</h3>
        <small>${esc(note)}</small>
      </header>
      ${body}
    </section>
  `;

  const metric = (label, value) => `
    <div class="gora-simple-metric">
      <span>${esc(label)}</span>
      <strong>${value}</strong>
    </div>
  `;

  async function optionalRead(table, columns, orderBy, limit = 5000) {
    try {
      let q = db.from(table).select(columns).limit(limit);

      if (orderBy) {
        q = q.order(orderBy, { ascending: false });
      }

      const result = await q;

      if (result.error) {
        return { data: [], error: result.error.message };
      }

      return { data: result.data || [], error: null };
    } catch (e) {
      return { data: [], error: e.message || String(e) };
    }
  }

  function chart(rows, fields, formatter = v => String(v)) {
    const max = Math.max(
      1,
      ...rows.flatMap(row => fields.map(f => Number(row[f.key] || 0)))
    );

    return `
      <div class="gora-simple-chart">
        ${rows.map(row => `
          <div class="gora-simple-chart-row">
            <span class="gora-simple-month">${esc(row.month)}</span>

            <div class="gora-simple-bars">
              ${fields.map(field => {
                const value = Number(row[field.key] || 0);
                const width = value
                  ? Math.max(3, value / max * 100)
                  : 0;

                return `
                  <i class="${field.className}"
                    style="width:${width}%"
                    title="${esc(field.label)}: ${esc(formatter(value))}">
                  </i>
                `;
              }).join('')}
            </div>

            <small>
              ${fields.map(field =>
                `${esc(field.short)}: ${esc(formatter(row[field.key] || 0))}`
              ).join(' · ')}
            </small>
          </div>
        `).join('')}
      </div>
    `;
  }

  async function runDashboard(host) {
    if (!host) return;

    if (!document.getElementById('gora-simple-dashboard-style')) {
      const style = document.createElement('style');
      style.id = 'gora-simple-dashboard-style';

      style.textContent = `
        .gora-simple-heading{
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
          margin:4px 0 18px
        }
        .gora-simple-heading h2{
          margin:0;
          color:#123b56;
          font-size:23px
        }
        .gora-simple-heading p{
          margin:5px 0 0;
          color:#708494;
          font-size:12px
        }
        .gora-simple-refresh{
          border:1px solid #d6e4ed;
          background:#fff;
          border-radius:9px;
          padding:9px 13px;
          color:#075985;
          font-weight:700;
          cursor:pointer
        }
        .gora-simple-cards{
          display:grid;
          grid-template-columns:repeat(3,minmax(0,1fr));
          gap:12px
        }
        .gora-simple-card{
          display:flex;
          flex-direction:column;
          align-items:flex-start;
          text-align:left;
          gap:8px;
          min-width:0;
          border:1px solid #dce7ee;
          border-radius:13px;
          background:#fff;
          padding:16px;
          cursor:pointer;
          color:#173e57
        }
        .gora-simple-card:hover{
          border-color:#1684b5;
          box-shadow:0 3px 12px #0b4d6b12
        }
        .gora-simple-card span{
          font-size:12px;
          color:#6d8292
        }
        .gora-simple-card strong{
          font-size:24px;
          line-height:1.2;
          overflow-wrap:anywhere
        }
        .gora-simple-card small{
          font-size:11px;
          color:#7b8e9b
        }
        .gora-simple-card.unverified strong{
          font-size:17px;
          color:#8b6a26
        }
        .gora-simple-sections{
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:14px;
          margin-top:16px
        }
        .gora-simple-panel{
          min-width:0;
          border:1px solid #dce7ee;
          border-radius:13px;
          background:#fff;
          padding:16px
        }
        .gora-simple-panel header{
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          gap:10px;
          margin-bottom:13px
        }
        .gora-simple-panel h3{
          margin:0;
          color:#075985;
          font-size:15px
        }
        .gora-simple-panel header small{
          color:#7b8e9b;
          font-size:10px;
          text-align:right
        }
        .gora-simple-chart-row{
          display:grid;
          grid-template-columns:42px 1fr;
          gap:8px;
          align-items:center;
          margin:10px 0
        }
        .gora-simple-month{
          font-size:11px;
          color:#718594
        }
        .gora-simple-bars{
          display:flex;
          flex-direction:column;
          gap:4px;
          min-width:0
        }
        .gora-simple-bars i{
          display:block;
          height:9px;
          border-radius:4px;
          background:#1684b5
        }
        .gora-simple-bars i.second{
          background:#7fc4a5
        }
        .gora-simple-chart-row small{
          grid-column:2;
          font-size:10px;
          color:#718594;
          overflow-wrap:anywhere
        }
        .gora-simple-legend{
          display:flex;
          gap:12px;
          flex-wrap:wrap;
          font-size:10px;
          color:#718594;
          margin-bottom:8px
        }
        .gora-simple-legend b{
          display:inline-block;
          width:9px;
          height:9px;
          border-radius:3px;
          background:#1684b5;
          margin-right:4px
        }
        .gora-simple-legend b.second{
          background:#7fc4a5
        }
        .gora-simple-alerts{
          display:grid;
          grid-template-columns:repeat(3,minmax(0,1fr));
          gap:10px;
          margin-top:14px
        }
        .gora-simple-alert{
          border-radius:10px;
          background:#f4f8fb;
          padding:12px;
          color:#294b61;
          font-size:12px
        }
        .gora-simple-alert.warning{
          background:#fff8e9;
          color:#805b17
        }
        .gora-simple-alert strong{
          display:block;
          font-size:17px;
          margin:5px 0
        }
        .gora-simple-alert button{
          margin-top:7px;
          border:0;
          background:transparent;
          padding:0;
          color:#0877a5;
          font-weight:700;
          cursor:pointer
        }
        .gora-simple-note{
          margin-top:12px;
          font-size:11px;
          color:#7b8e9b;
          line-height:1.5
        }
        .gora-simple-error{
          border:1px solid #efcaca;
          background:#fff5f5;
          color:#8a3333;
          border-radius:10px;
          padding:12px;
          margin:10px 0
        }
        @media(max-width:700px){
          .gora-simple-cards{
            grid-template-columns:repeat(2,minmax(0,1fr))
          }
          .gora-simple-sections{
            grid-template-columns:1fr
          }
          .gora-simple-alerts{
            grid-template-columns:1fr
          }
          .gora-simple-heading h2{
            font-size:20px
          }
        }
        @media(max-width:360px){
          .gora-simple-card{padding:12px}
          .gora-simple-card strong{font-size:20px}
        }
      `;

      document.head.appendChild(style);
    }

    host.innerHTML = '<div class="gora-simple-panel">Loading GORA dashboard…</div>';

    try {
      if (typeof db === 'undefined' || !db) {
        throw new Error('Supabase is not connected. Please sign in again.');
      }

      const auth = await db.auth.getUser();

      if (auth.error || !auth.data?.user) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      // These table names and columns are taken from your existing GORA file.
      const specs = [
        ['members', 'members',
          'id,full_name,registration_date,created_at,status',
          'created_at', 3000],

        ['chamas', 'chama_groups',
          'id,group_name,created_at,status',
          'created_at', 1000],

        ['loans', 'loan_accounts',
          'id,principal_amount,total_repayment,disbursed_on,status',
          'created_at', 3000],

        ['repayments', 'loan_repayments',
          'id,loan_account_id,payment_date,amount,status,reversed_at',
          'payment_date', 5000],

        ['applications', 'loan_applications',
          'id,status,created_at,applied_at',
          'created_at', 2000],

        ['installments', 'loan_repayment_schedules',
          'id,loan_account_id,due_date,total_due,status',
          'due_date', 10000],

        ['allocations', 'loan_repayment_allocations',
          'id,repayment_id,schedule_id,amount,created_at',
          'created_at', 10000],

        ['reconciliation', 'daily_reconciliations',
          'id,reconciliation_date,status,cash_variance,mpesa_variance,bank_variance',
          'reconciliation_date', 1000]
      ];

      const loaded = await Promise.all(
        specs.map(s => optionalRead(s[1], s[2], s[3], s[4]))
      );

      const data = {};
      const errors = [];

      specs.forEach((s, i) => {
        data[s[0]] = loaded[i].data;

        if (loaded[i].error) {
          errors.push(`${s[0]}: ${loaded[i].error}`);
        }
      });

      const today = dayKey(new Date());
      const currentMonth = today.slice(0, 7);

      const previousDate = new Date();
      previousDate.setDate(1);
      previousDate.setMonth(previousDate.getMonth() - 1);

      const previousMonth =
        `${previousDate.getFullYear()}-${String(
          previousDate.getMonth() + 1
        ).padStart(2, '0')}`;

      const members = data.members || [];
      const chamas = data.chamas || [];
      const loans = data.loans || [];
      const applications = data.applications || [];

      const repayments = (data.repayments || []).filter(x =>
        low(x.status) === 'posted' && !x.reversed_at
      );

      const installments = data.installments || [];
      const allocations = data.allocations || [];

      const disbursedLoans = loans.filter(x =>
        x.disbursed_on &&
        !['pending','approved','rejected','cancelled','declined']
          .includes(low(x.status))
      );

      const disbursedIds = new Set(disbursedLoans.map(x => x.id));
      const repaymentIds = new Set(repayments.map(x => x.id));

      const paidBySchedule = new Map();

      allocations
        .filter(x => repaymentIds.has(x.repayment_id))
        .forEach(x => {
          const previous = paidBySchedule.get(x.schedule_id) || 0;

          paidBySchedule.set(
            x.schedule_id,
            previous + Number(x.amount || 0)
          );
        });

      const unpaidInstallments = installments
        .filter(x => disbursedIds.has(x.loan_account_id))
        .map(x => {
          const paid = paidBySchedule.get(x.id) || 0;

          const balance = ['paid','waived','cancelled']
            .includes(low(x.status))
            ? 0
            : Math.max(0, Number(x.total_due || 0) - paid);

          return {
            ...x,
            balance
          };
        });

      const outstanding = sum(
        unpaidInstallments,
        x => x.balance
      );

      const overdue = unpaidInstallments.filter(x =>
        x.due_date < today && x.balance > 0
      );

      const arrears = sum(overdue, x => x.balance);

      const pendingApplications = applications.filter(x =>
        ['pending','submitted','recommended'].includes(low(x.status))
      );

      const activeMembers = members.filter(x =>
        low(x.status) === 'active'
      );

      const activeChamas = chamas.filter(x =>
        low(x.status) === 'active'
      );

      const monthDisbursed = sum(
        disbursedLoans.filter(x =>
          monthKey(x.disbursed_on) === currentMonth
        ),
        x => x.principal_amount
      );

      const monthCollections = sum(
        repayments.filter(x =>
          monthKey(x.payment_date) === currentMonth
        )
      );

      const previousDisbursed = sum(
        disbursedLoans.filter(x =>
          monthKey(x.disbursed_on) === previousMonth
        ),
        x => x.principal_amount
      );

      const previousCollections = sum(
        repayments.filter(x =>
          monthKey(x.payment_date) === previousMonth
        )
      );

      const months = monthsBack(6);

      const financialTrend = months.map(k => ({
        month: monthLabel(k),
        disbursed: sum(
          disbursedLoans.filter(x =>
            monthKey(x.disbursed_on) === k
          ),
          x => x.principal_amount
        ),
        collected: sum(
          repayments.filter(x =>
            monthKey(x.payment_date) === k
          )
        )
      }));

      const growthTrend = months.map(k => ({
        month: monthLabel(k),
        members: members.filter(x =>
          monthKey(x.registration_date || x.created_at) === k
        ).length,
        chamas: chamas.filter(x =>
          monthKey(x.created_at) === k
        ).length
      }));

      const lastReconciliation = (data.reconciliation || [])
        .find(x =>
          x.reconciliation_date &&
          x.reconciliation_date <= today
        );

      const variance = lastReconciliation
        ? Number(lastReconciliation.cash_variance || 0) +
          Number(lastReconciliation.mpesa_variance || 0) +
          Number(lastReconciliation.bank_variance || 0)
        : null;

      const balanced = lastReconciliation &&
        low(lastReconciliation.status) === 'balanced' &&
        Math.abs(variance || 0) < 0.01;

      const trend = (current, previous) => {
        if (!current && !previous) return 'No activity yet';
        if (!previous) return 'Started this month';

        const change = ((current - previous) / Math.abs(previous)) * 100;

        return `${change >= 0 ? '↑' : '↓'} ${
          Math.abs(change).toFixed(1)
        }% vs last month`;
      };

      host.innerHTML = `
        <div class="gora-simple-heading">
          <div>
            <h2>GORA Overview</h2>
            <p>Live business summary · ${esc(today)} · Kenya time</p>
          </div>
          <button class="gora-simple-refresh" id="goraSimpleRefresh">
            Refresh
          </button>
        </div>

        <div class="gora-simple-cards">
          ${card(
            'Total Members',
            members.length.toLocaleString('en-KE'),
            `${activeMembers.length} active`,
            'Members'
          )}

          ${card(
            'Total Chamas Opened',
            chamas.length.toLocaleString('en-KE'),
            `${activeChamas.length} active`,
            'Chamas'
          )}

          ${card(
            'Loans Outstanding',
            money(outstanding),
            `${disbursedLoans.length} disbursed loans`,
            'Loans'
          )}

          ${card(
            'Collections This Month',
            money(monthCollections),
            trend(monthCollections, previousCollections),
            'Repayments'
          )}

          ${card(
            'Cash Available',
            'Not verified',
            'Requires cash, bank, M-Pesa and liability reconciliation',
            'Daily Reconciliation',
            'unverified'
          )}

          ${card(
            'Net Profit',
            'Not verified',
            'Requires verified income and expense records',
            'Finance',
            'unverified'
          )}
        </div>

        <div class="gora-simple-sections">
          ${panel(
            'Loans Disbursed vs Collections',
            `
              <div class="gora-simple-legend">
                <span><b></b> Disbursed</span>
                <span><b class="second"></b> Collections</span>
              </div>

              ${chart(
                financialTrend,
                [
                  {
                    key: 'disbursed',
                    label: 'Disbursed',
                    short: 'Issued',
                    className: ''
                  },
                  {
                    key: 'collected',
                    label: 'Collections',
                    short: 'Collected',
                    className: 'second'
                  }
                ],
                money
              )}

              <p class="gora-simple-note">
                This month: disbursed ${money(monthDisbursed)} ·
                collected ${money(monthCollections)}.
                ${esc(trend(monthDisbursed, previousDisbursed))}
              </p>
            `,
            'Monthly movement · last 6 months'
          )}

          ${panel(
            'Member & Chama Growth',
            `
              <div class="gora-simple-legend">
                <span><b></b> Members</span>
                <span><b class="second"></b> Chamas</span>
              </div>

              ${chart(
                growthTrend,
                [
                  {
                    key: 'members',
                    label: 'Members',
                    short: 'Members',
                    className: ''
                  },
                  {
                    key: 'chamas',
                    label: 'Chamas',
                    short: 'Chamas',
                    className: 'second'
                  }
                ]
              )}

              <p class="gora-simple-note">
                Shows new member and chama records created each month.
              </p>
            `,
            'New registrations · last 6 months'
          )}
        </div>

        <div class="gora-simple-alerts">
          <div class="gora-simple-alert warning">
            <span>Overdue loans</span>
            <strong>${overdue.length} installments · ${money(arrears)}</strong>
            <button data-gora-page="Loans">Open Loans →</button>
          </div>

          <div class="gora-simple-alert ${
            pendingApplications.length ? 'warning' : ''
          }">
            <span>Pending approvals</span>
            <strong>${pendingApplications.length}</strong>
            <button data-gora-page="Applications">
              Review applications →
            </button>
          </div>

          <div class="gora-simple-alert ${
            balanced ? '' : 'warning'
          }">
            <span>Daily reconciliation</span>
            <strong>${balanced ? 'Balanced' : 'Check required'}</strong>
            <button data-gora-page="Daily Reconciliation">
              Open reconciliation →
            </button>
          </div>
        </div>

        ${
          errors.length
            ? `<div class="gora-simple-error">
                <strong>Some dashboard data could not load.</strong><br>
                ${errors.map(esc).join('<br>')}
              </div>`
            : ''
        }

        <p class="gora-simple-note">
          Member savings are liabilities, not GORA lending capital.
          Outstanding loans are not cash available.
          Cash Available and Net Profit remain unverified until
          the connected ledgers support safe calculations.
        </p>
      `;

      host.querySelector('#goraSimpleRefresh')
        ?.addEventListener('click', () => runDashboard(host));

      host.querySelectorAll('[data-gora-page]')
        .forEach(button => {
          button.addEventListener('click', () => {
            const page = button.dataset.goraPage;

            const nav = document.querySelector(
              `#nav [data-page="${CSS.escape(page)}"]`
            );

            if (nav) {
              nav.click();
            } else if (typeof window.load === 'function') {
              window.load(page);
            }
          });
        });

    } catch (err) {
      host.innerHTML = `
        <div class="gora-simple-error">
          <strong>Dashboard could not load</strong><br>
          ${esc(err.message || err)}
          <p>Please check your sign-in and Supabase connection.</p>
        </div>
      `;
    }
  }

  window.dashboard = runDashboard;

  // Preserve existing app.js module navigation.
  if (typeof window.load === 'function' &&
      !window.load.__goraSimpleDashboard) {

    const originalLoad = window.load;

    const wrappedLoad = async function(page) {
      if (page === 'Dashboard') {
        const title = document.getElementById('title');
        const content = document.getElementById('content');

        if (title) title.textContent = 'Dashboard';

        if (content) {
          await runDashboard(content);
        }

        return;
      }

      return originalLoad.apply(this, arguments);
    };

    wrappedLoad.__goraSimpleDashboard = true;
    window.load = wrappedLoad;
  }
})();
