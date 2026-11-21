/* GORA 2.0 Dashboard — extended existing dashboard, compatible with app.js tables.
   Read-only: this file does not create, update, or delete financial records. */
(() => {
  'use strict';

  const money = n => new Intl.NumberFormat('en-KE', { style:'currency', currency:'KES', maximumFractionDigits:0 }).format(Number(n || 0));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dayKey = (v, tz='Africa/Nairobi') => {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v).slice(0,10);
    return new Intl.DateTimeFormat('en-CA', { timeZone:tz, year:'numeric', month:'2-digit', day:'2-digit' }).format(d);
  };
  const dateLabel = v => v ? new Date(v).toLocaleString('en-KE', { timeZone:'Africa/Nairobi', dateStyle:'medium', timeStyle:'short' }) : '—';
  const sum = (rows, fn = x => x.amount) => rows.reduce((n, x) => n + Number(fn(x) || 0), 0);
  const low = v => String(v || '').trim().toLowerCase();
  const stat = (label, value, foot='', tone='blue') => `<article class="stat ${tone}"><div class="label">${label}</div><strong>${value}</strong><div class="foot">${foot}</div></article>`;
  const panel = (title, body, id='') => `<section class="panel"${id ? ` id="${id}"` : ''}><h3>${title}</h3>${body}</section>`;
  const table = (headers, rows) => `<div class="tablebox"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}" class="empty">No records found.</td></tr>`}</tbody></table></div>`;
  const metric = (label, value, note='') => `<div class="metric-line"><span>${label}${note ? `<small class="gora-muted"> ${note}</small>` : ''}</span><b>${value}</b></div>`;
  const monthLabel = k => new Date(k+'-01T12:00:00').toLocaleDateString('en-KE', {month:'short', year:'2-digit'});
  const monthsBack = n => { const now=new Date(), out=[]; for(let i=n-1;i>=0;i--){ const d=new Date(now.getFullYear(),now.getMonth()-i,1); out.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); } return out; };
  const miniBars = (items, key, formatter=v=>String(v)) => {
    const max=Math.max(1,...items.map(x=>Number(x[key]||0)));
    return items.map(x=>{ const v=Number(x[key]||0); return `<div class="gora-chart-row"><span>${esc(x.month)}</span><div class="gora-bars ${v===0?'is-zero':''}"><i style="width:${v===0?0:Math.max(4,v/max*100)}%" title="${esc(formatter(v))}"></i></div><small>${esc(formatter(v))}</small></div>`; }).join('');
  };
  const optionalRead = async (tableName, columns, orderBy, limit=5000) => {
    try {
      let q = db.from(tableName).select(columns).limit(limit);
      if (orderBy) q=q.order(orderBy,{ascending:false});
      const r=await q;
      if(r.error) return {data:[], error:r.error.message};
      return {data:r.data||[], error:null};
    } catch(e) { return {data:[], error:e.message||String(e)}; }
  };

  async function runDashboard(host) {
    if (!host) return;
    if (!document.getElementById('gora-dashboard-extra-style')) {
      const style=document.createElement('style'); style.id='gora-dashboard-extra-style'; style.textContent=`
        .gora-section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:26px 0 12px;padding-bottom:9px;border-bottom:1px solid var(--line,#dbe5ec)}
        .gora-section-heading h3{margin:0;color:#075985;font-size:16px}.gora-section-heading span,.gora-muted,.chart-note{font-size:11px;color:var(--muted,#647b8c)}
        .gora-quick-actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin:12px 0 8px}
        .gora-action{display:flex;align-items:center;gap:10px;padding:13px;border:1px solid #d8e5ed;border-radius:11px;background:#fff;color:#17445e;font-weight:650;text-align:left;cursor:pointer}
        .gora-action:hover{border-color:#0780b2;background:#f1f8fc}.gora-action span{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:#e4f2f8;color:#075985;font-size:18px}
        .gora-status-warning{padding:12px;border:1px solid #f0d8a7;border-radius:10px;background:#fff9eb;color:#78520a;margin:8px 0 12px}.gora-status-warning p{margin:6px 0 0;font-size:12px;line-height:1.5}
        .gora-data-note{overflow-wrap:anywhere}.gora-filters select{min-width:130px}.gora-custom-dates{display:flex;gap:8px;align-items:end}.gora-custom-dates[hidden]{display:none}.gora-custom-dates label{font-size:11px}.gora-custom-dates input{display:block;max-width:145px;padding:7px;border:1px solid var(--line,#dbe5ec);border-radius:8px}
        @media(max-width:520px){.gora-section-heading{align-items:flex-start;flex-direction:column}.gora-quick-actions{grid-template-columns:repeat(2,minmax(0,1fr))}.gora-action{padding:10px;font-size:12px}}`; document.head.appendChild(style);
    }
    host.innerHTML='<div class="panel">Loading GORA dashboard…</div>';
    try {
      if (typeof db === 'undefined' || !db) throw new Error('Supabase connection is not ready. Refresh the page or check connection settings.');
      const auth=await db.auth.getUser();
      if(auth.error || !auth.data?.user) throw new Error('Your sign-in session has expired. Please sign in again.');

      // Existing GORA tables and their verified columns. Each read fails independently
      // so an unfinished optional module cannot hide the rest of the dashboard.
      
const specs = [
  ['members','members','id,organization_id,chama_group_id,member_number,full_name,phone,registration_date,status,created_at,registration_fee_amount,registration_fee_status,branch_id','created_at',3000],
  ['chamas','chama_groups','id,organization_id,group_code,group_name,status,created_at,meeting_frequency,meeting_day,target_weekly_savings,location,meeting_time,meeting_venue','created_at',1000],
  ['loans','loan_accounts','id,organization_id,borrower_type,member_id,individual_borrower_id,group_id,principal_amount,total_interest,total_repayment,disbursed_on,first_due_date,status,loan_account_number','created_at',3000],
  ['repayments','loan_repayments','id,organization_id,loan_account_id,payment_date,amount,payment_method,reference_number,status,reversed_at','payment_date',5000],
['loan_applications','loan_applications','id,organization_id,member_id,individual_borrower_id,requested_amount,approved_amount,status,applied_at,created_at','created_at',2000],
  ['installments','loan_repayment_schedules','id,organization_id,loan_account_id,installment_number,due_date,principal_due,interest_due,total_due,status','due_date',10000],
  ['allocations','loan_repayment_allocations','id,organization_id,repayment_id,schedule_id,amount,created_at','created_at',10000],
  ['savings_accounts','savings_accounts','id,organization_id,member_id,account_number,status','created_at',5000],
  ['savings_transactions','savings_transactions','id,organization_id,savings_account_id,transaction_number,transaction_type,amount,payment_method,reference_number,status,reversed_transaction_id,transaction_date,posted_at','transaction_date',10000],
  ['reconciliations','daily_reconciliations','id,organization_id,reconciliation_date,opening_cash,opening_mpesa,opening_bank,expected_closing_cash,expected_closing_mpesa,expected_closing_bank,actual_closing_cash,actual_closing_mpesa,actual_closing_bank,cash_variance,mpesa_variance,bank_variance,status,notes,recorded_by','reconciliation_date',1000],
  ['capital','capital_transactions','id,organization_id,transaction_type,amount,transaction_date,payment_method,reference,description,status,reversed_by,reversed_at','transaction_date',3000],
  ['petty_cash','petty_cash_transactions','id,organization_id,transaction_date,transaction_type,category,amount,description,reference,payment_method,status','transaction_date',5000]
];

      const loaded = await Promise.all(
  specs.map(s => optionalRead(s[1], s[2], s[3], s[4]))
);
      const data={}; const errors=[];
      specs.forEach((s,i)=>{data[s[0]]=loaded[i].data; if(loaded[i].error) errors.push(`${s[0]}: ${loaded[i].error}`);});

      const members = data.members || [];
const chamas = data.chamas || [];
const loans = data.loans || [];
const repayments = data.repayments || [];
const apps = data.loan_applications || [];

const installments = data.installments || [];
const allocations = data.allocations || [];

const savingsAccounts = data.savings_accounts || [];
const savingsRaw = data.savings_transactions || [];
const savingsAccountById = new Map(
  savingsAccounts.map(a => [a.id, a])
);

const reversedSavingsIds = new Set(
  savingsRaw
    .filter(x => x.reversed_transaction_id)
    .map(x => x.reversed_transaction_id)
);

const savings = savingsRaw
  .filter(x =>
    low(x.status) === 'posted' &&
    !x.reversed_transaction_id &&
    !reversedSavingsIds.has(x.id)
  )
  .map(x => {
    const account = savingsAccountById.get(x.savings_account_id);

    return {
      ...x,
      member_id: account?.member_id || null
    };
  });
const reconciliations = data.reconciliations || [];
const capital = data.capital || [];
const petty = data.petty_cash || [];

// These legacy sources do not exist in the verified schema.
const cashbook = [];
const membershipPayments = [];
const fines = [];
const finePayments = [];
      const today=dayKey(new Date());
      const startWeek=(()=>{const d=new Date(); d.setHours(0,0,0,0); const offset=(d.getDay()+6)%7; d.setDate(d.getDate()-offset); return dayKey(d);})();
      const startMonth=today.slice(0,7)+'-01';
      const dateOf=(x,field)=>dayKey(x[field]);
      const inPeriod=(x,field,period)=>{const k=dateOf(x,field); if(!k)return false; if(period==='today')return k===today; if(period==='week')return k>=startWeek&&k<=today; if(period==='month')return k>=startMonth&&k<=today; if(period==='custom'){const a=host.dataset.goraStart||today,b=host.dataset.goraEnd||today;return k>=a&&k<=b;} return true;};
      const postedRepayments = repayments.filter(
  x => low(x.status) === 'posted' && !x.reversed_at
);

const postedRepaymentIds = new Set(
  postedRepayments.map(x => x.id)
);

const disbursedLoans = loans.filter(
  x => x.disbursed_on &&
    !['pending', 'approved', 'rejected', 'cancelled', 'declined']
      .includes(low(x.status))
);

const disbursedIds = new Set(
  disbursedLoans.map(x => x.id)
);

// Sum only allocations belonging to posted, non-reversed repayments.
const allocatedBySchedule = new Map();

allocations
  .filter(x => postedRepaymentIds.has(x.repayment_id))
  .forEach(x => {
    const current = allocatedBySchedule.get(x.schedule_id) || 0;
    allocatedBySchedule.set(
      x.schedule_id,
      current + Number(x.amount || 0)
    );
  });

// Calculate each installment's remaining balance.
const loanInst = installments
  .filter(x => disbursedIds.has(x.loan_account_id))
  .map(x => {
    const totalDue = Number(x.total_due || 0);
    const allocated = allocatedBySchedule.get(x.id) || 0;

    const balance = ['paid', 'waived', 'cancelled']
      .includes(low(x.status))
      ? 0
      : Math.max(0, totalDue - allocated);

    return {
      ...x,
      loan_id: x.loan_account_id,
      balance
    };
  });

const outstanding = sum(loanInst, x => x.balance);

const overdueInst = loanInst.filter(
  x => x.due_date < today && x.balance > 0
);

const arrears = sum(overdueInst, x => x.balance);

const activeLoans = disbursedLoans.filter(
  x => !['completed', 'closed', 'defaulted', 'written_off']
    .includes(low(x.status))
);
      const activeMembers=members.filter(x=>low(x.status)==='active');
      const activeChamas=chamas.filter(x=>low(x.status)==='active');
      const pendingApps=apps.filter(x=>['pending','submitted','recommended'].includes(low(x.status)));
      const approvedAwaiting=apps.filter(x=>['approved','awaiting_disbursement','ready_for_disbursement'].includes(low(x.status)));
      const unpaidFines=fines.filter(x=>!['paid','waived','cancelled'].includes(low(x.status)));
      const paidFineIds=new Set(finePayments.map(x=>x.fine_id));
      const fineDue=sum(unpaidFines,x=>x.amount);

      const period=host.dataset.goraPeriod || 'today';
      const periodText=period==='today'?'Today':period==='week'?'This week':period==='month'?'This month':'All time';
      const todaySavings=savings.filter(x=>inPeriod(x,'transaction_date',period));
      const todayRepayments=postedRepayments.filter(x=>inPeriod(x,'payment_date',period));
      const todayDisbursements = disbursedLoans.filter(
  x => inPeriod(x, 'disbursed_on', period)
);
      const todayCashbook=cashbook.filter(x=>inPeriod(x,'transaction_date',period));
      const todayPetty=petty.filter(x=>inPeriod(x,'transaction_date',period));
      const todayMembership=membershipPayments.filter(x=>inPeriod(x,'payment_date',period));
      const todayFinePayments=finePayments.filter(x=>inPeriod(x,'payment_date',period));
      const deposits=savings.filter(x=>['deposit','contribution','savings_deposit'].includes(low(x.transaction_type)));
      const withdrawals=savings.filter(x=>['withdrawal','savings_withdrawal'].includes(low(x.transaction_type)));
      const todayDeposits=todaySavings.filter(x=>['deposit','contribution','savings_deposit'].includes(low(x.transaction_type)));
      const todayWithdrawals=todaySavings.filter(x=>['withdrawal','savings_withdrawal'].includes(low(x.transaction_type)));
      const collectedToday=sum(todayRepayments);
      const disbursedToday = sum(
  todayDisbursements,
  x => x.principal_amount
);
      const expenseRows=todayCashbook.filter(x=>['expense','payment','outflow'].includes(low(x.entry_type)));
      const expensesToday=sum(expenseRows);
      const pettyOut=todayPetty.filter(x=>['expense','payment','out','withdrawal'].includes(low(x.transaction_type)) && ['approved','posted','paid','completed'].includes(low(x.status)));
      const pettyIn=todayPetty.filter(x=>['topup','top_up','income','deposit','in'].includes(low(x.transaction_type)) && ['approved','posted','paid','completed'].includes(low(x.status)));
      const pettyBalance=sum(petty,x=>['topup','top_up','income','deposit','in'].includes(low(x.transaction_type))?Number(x.amount):(['expense','payment','out','withdrawal'].includes(low(x.transaction_type))?-Number(x.amount):0));
      const membershipToday=sum(todayMembership);
      const finesCollectedToday=sum(todayFinePayments);
      const registrationsToday = members.filter(
  x => inPeriod(x, 'registration_date', period) ||
       inPeriod(x, 'created_at', period)
).length;
      const recentMembers=members.slice(0,6), recentChamas=chamas.slice(0,6), recentRepayments=repayments.slice(0,8), recentApps=apps.slice(0,6), recentSavings=savings.slice(0,8);
      const memberName=id=>{const m=members.find(x=>x.id===id); return m?.full_name || 'Member record';};

      // Upcoming Chama meetings for the signed-in user's organisations
      let upcomingMeetings = [];
      try {
        const { data: roleRows, error: roleError } = await db
          .from('user_roles')
          .select('organization_id')
          .eq('user_id', auth.data.user.id)
          .eq('is_active', true);

        if (roleError) throw roleError;

        const orgIds = [...new Set(
          (roleRows || []).map(r => r.organization_id).filter(Boolean)
        )];

        if (orgIds.length) {
          const { data: meetingRows, error: meetingError } = await db
            .from('chama_meetings')
            .select('id,organization_id,group_id,meeting_date,meeting_time,venue')
            .in('organization_id', orgIds)
            .gte('meeting_date', today)
            .order('meeting_date', { ascending: true })
            .order('meeting_time', { ascending: true })
            .limit(100);

          if (meetingError) throw meetingError;

          const groupIds = [...new Set(
            (meetingRows || []).map(m => m.group_id).filter(Boolean)
          )];

          let groupMap = {};

          if (groupIds.length) {
            const { data: groupRows, error: groupError } = await db
              .from('chama_groups')
              .select('id,group_name')
              .in('id', groupIds)
              .in('organization_id', orgIds);

            if (groupError) throw groupError;

            groupMap = Object.fromEntries(
              (groupRows || []).map(g => [g.id, g.group_name])
            );
          }

          upcomingMeetings = (meetingRows || []).map(m => ({
            ...m,
            group_name: groupMap[m.group_id] || 'Chama group'
          }));
        }
      } catch (e) {
        errors.push('Upcoming meetings: ' + (e.message || String(e)));
                                          }
       
      const tomorrowDate = new Date(`${today}T12:00:00`);
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrowKey = dayKey(tomorrowDate);

      const upcomingMeetingPanel = panel(
        'Upcoming Chama Meetings',
        upcomingMeetings.length
          ? `<div class="list">${upcomingMeetings.slice(0,8).map(m=>{
              const meetingDay = m.meeting_date === today
                ? 'Today'
                : m.meeting_date === tomorrowKey
                  ? 'Tomorrow'
                  : new Date(m.meeting_date+'T12:00:00')
                      .toLocaleDateString('en-KE',{
                        timeZone:'Africa/Nairobi',
                        day:'numeric',
                        month:'short',
                        year:'numeric'
                      });

              const meetingTime = m.meeting_time
                ? String(m.meeting_time).slice(0,5)
                : 'Time not set';

              return `<div class="item">
                <div class="itemhead">
                  <strong>${esc(m.group_name)}</strong>
                  <span class="pill">${esc(meetingDay)}</span>
                </div>
                <p class="small">${esc(m.meeting_date)} · ${esc(meetingTime)}</p>
                <p class="muted small">${esc(m.venue || 'Venue not set')}</p>
              </div>`;
            }).join('')}</div>`
          : '<p class="muted">No upcoming Chama meetings scheduled.</p>'
      );
       
      // Existing six-month chart history retained, now using the main GORA tables.
      const monthKeys=monthsBack(6);
      const savingsTrend=monthKeys.map(k=>{
        const rows=savings.filter(x=>String(x.transaction_date||'').slice(0,7)===k);
        return {month:monthLabel(k), deposits:sum(rows.filter(x=>['deposit','contribution','savings_deposit'].includes(low(x.transaction_type)))), withdrawals:sum(rows.filter(x=>['withdrawal','savings_withdrawal'].includes(low(x.transaction_type))))};
      });
      const memberTrend=monthKeys.map(k=>({month:monthLabel(k),count:members.filter(x=>String(x.date_joined||x.created_at||'').slice(0,7)===k).length}));
      const chamaTrend=monthKeys.map(k=>({month:monthLabel(k),count:chamas.filter(x=>String(x.created_at||'').slice(0,7)===k).length}));
      const applicationTrend=monthKeys.map(k=>({month:monthLabel(k),count:apps.filter(x=>String(x.applied_at||x.requested_at||'').slice(0,7)===k).length}));
      const maxSavings=Math.max(1,...savingsTrend.flatMap(x=>[x.deposits,x.withdrawals]));
      const savingsBars=savingsTrend.map(x=>`<div class="gora-chart-row"><span>${esc(x.month)}</span><div class="gora-bars ${x.deposits===0&&x.withdrawals===0?'is-zero':''}"><i style="width:${x.deposits===0?0:Math.max(4,x.deposits/maxSavings*100)}%" title="Deposits ${money(x.deposits)}"></i><b style="width:${x.withdrawals===0?0:Math.max(4,x.withdrawals/maxSavings*100)}%" title="Withdrawals ${money(x.withdrawals)}"></b></div><small>${money(x.deposits)}</small></div>`).join('');

      host.innerHTML=`
        <div class="page-heading"><div><h2>Good day, ${esc(typeof profile!=='undefined'&&profile?.full_name||'GORA team')}</h2><div class="sub">GORA live business overview · ${esc(today)} · Kenya time</div></div><div class="gora-filters"><label>Reporting period<select id="goraPeriod"><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option><option value="custom">Custom period</option><option value="all">All time</option></select></label><div id="goraCustomDates" class="gora-custom-dates" hidden><label>From<input type="date" id="goraStartDate"></label><label>To<input type="date" id="goraEndDate"></label></div><button class="secondary" id="goraRefresh">Refresh</button></div></div>

        <div class="gora-section-heading"><h3>1. Daily business summary</h3><span>${esc(periodText)} · ${esc(today)}</span></div>
        <div class="stats">
          ${stat('Recorded receipts — separate ledgers',money(collectedToday+sum(todayDeposits)+membershipToday+finesCollectedToday),'Ledger totals may overlap; reconcile before relying on total','good')}
          ${stat('Recorded payments — separate ledgers',money(disbursedToday+expensesToday+sum(todayWithdrawals)),'Ledger totals may overlap; reconcile before relying on total','warn')}
          ${stat('New member registrations',registrationsToday,`Members joined ${periodText.toLowerCase()}`)}
          ${stat('Transactions awaiting attention',apps.filter(x=>['pending','submitted'].includes(low(x.status))).length+unpaidFines.filter(x=>x.due_date&&x.due_date<today).length,'Pending applications and overdue fines','warn')}
        </div>
        <div class="grid-two">
          ${panel('Daily cash movement (recorded items)',`${metric('Loan repayments received',money(collectedToday))}${metric('Savings deposits received',money(sum(todayDeposits)))}${metric('Membership payments received',money(membershipToday))}${metric('Fine payments received',money(finesCollectedToday))}${metric('Loans disbursed',money(disbursedToday))}${metric('Cashbook expenses',money(expensesToday))}`)}
          ${panel('Daily reconciliation status',`<div class="gora-status-warning"><strong>Not yet reconciled</strong><p>The current database tables do not provide verified opening balances and closing balances by cash, M-Pesa and bank. Daily reconciliation cannot be confirmed from transaction totals alone.</p></div>${metric('Cashbook entries today',todayCashbook.length)}${metric('Savings transactions today',todaySavings.length)}${metric('Repayments recorded today',todayRepayments.length)}${metric('Petty cash balance (ledger estimate)',money(pettyBalance),'Based on approved/posted petty-cash entries only')}`)}
        </div>

        <div class="gora-section-heading"><h3>2. Financial position</h3><span>Separate liabilities from GORA funds</span></div>
        <div class="stats">
          ${stat('Outstanding loan balance',money(outstanding),'From unpaid installment balances','blue')}
          ${stat('Member savings liability','Not verified','Savings balance needs member-by-member ledger calculation','muted')}
          ${stat('Available lending capital','Not available','Cash and committed liabilities are not yet fully reconciled','muted')}
          ${stat('Owner capital / owner loan','Not tracked yet','Capital management ledger is not yet connected','muted')}
        </div>
        <div class="grid-two">
          ${panel('Financial position breakdown',`${metric('Total principal disbursed',money(sum(disbursedLoans,x=>x.principal)))}${metric('Outstanding loan instalments',money(outstanding))}${metric('Past-due instalment balances',money(arrears))}${metric('Savings deposits recorded (all time)',money(sum(deposits)))}${metric('Savings withdrawals recorded (all time)',money(sum(withdrawals)))}<p class="chart-note">Deposit totals are not the same as current member savings balances. Outstanding loans are not cash available to lend.</p>`)}
          ${panel('Cash, bank and M-Pesa balances',`<div class="gora-status-warning"><strong>Balances not yet connected</strong><p>There is no verified cash/bank/M-Pesa account balance ledger available to this Dashboard. These balances will remain blank until the cashbook and reconciliation modules record opening balances, movements and closing balances.</p></div>${metric('Physical cash','Not verified')}${metric('M-Pesa','Not verified')}${metric('Bank','Not verified')}${metric('Total GORA income / expenses','Not verified','Requires classified income and expense accounts')}`)}
        </div>

        <div class="gora-section-heading"><h3>3. Alerts and reminders</h3><span>Items requiring attention</span></div>
                ${upcomingMeetingPanel}
        <div class="grid-two">
          ${panel('Loan and chama alerts',`${metric('Loan applications awaiting review',pendingApps.length)}${metric('Approved applications awaiting disbursement',approvedAwaiting.length)}${metric('Individual overdue instalments',overdueInst.length)}${metric('Total loan arrears',money(arrears))}${metric('Chamas marked active',activeChamas.length)}<p class="chart-note">Chama meeting due dates/default alerts are not calculated because the current chama table has meeting day/frequency but no verified member contribution schedule.</p>`)}
          ${panel('Fines and payment alerts',`${metric('Unpaid / unresolved fines',unpaidFines.length)}${metric('Value of unresolved fines',money(fineDue))}${metric('Overdue fines',unpaidFines.filter(x=>x.due_date&&x.due_date<today).length)}${metric('Fine payments received today',money(finesCollectedToday))}${metric('Petty cash transactions awaiting approval',petty.filter(x=>['pending','submitted'].includes(low(x.status))).length)}`)}
        </div>

        <div class="gora-section-heading"><h3>4. Quick actions</h3><span>Open an existing GORA module</span></div>
        <div class="gora-quick-actions">
          ${[['Members','＋','Register member'],['Chamas','♧','Register chama'],['Savings','◈','Record savings'],['Repayments','↙','Record repayment'],['Expenses','−','Record expense'],['Cashbook','▧','Daily reconciliation'],['Petty Cash','◉','Petty cash'],['Applications','✓','Review loan applications'],['Loans','▣','View loans'],['Arrears','⚠','View arrears']].map(([page,icon,label])=>`<button type="button" class="gora-action" data-gora-page="${esc(page)}"><span>${icon}</span>${esc(label)}</button>`).join('')}
        </div>
        <p class="chart-note">These shortcuts open existing workspace pages. Fine recording and capital introduction are not shown as active shortcuts until their dedicated secure entry workflows are connected.</p>

        <div class="gora-section-heading"><h3>5. Daily operations</h3><span>Recorded today</span></div>
        <div class="grid-two">
          ${panel('Collections and payments',`${metric('Loan repayments',money(collectedToday))}${metric('Savings deposits',money(sum(todayDeposits)))}${metric('Registration / membership fees',money(membershipToday))}${metric('Fines collected',money(finesCollectedToday))}${metric('Loans disbursed',money(disbursedToday))}${metric('Expenses paid (cashbook)',money(expensesToday))}`)}
          ${panel('Petty cash and fee categories',`${metric('Petty cash balance (ledger estimate)',money(pettyBalance))}${metric('Petty cash inflows today',money(sum(pettyIn)))}${metric('Petty cash outflows today',money(sum(pettyOut)))}${metric('Registration fees',money(membershipToday))}${metric('Passbook fees','Not separately identified','No verified passbook fee category in current payment schema')}${metric('Fines collected',money(finesCollectedToday))}`)}
        </div>

        <div class="gora-section-heading"><h3>6. Business performance</h3><span>Portfolio and growth indicators</span></div>
        <div class="stats">
          ${stat('Registered members',members.length,`${activeMembers.length} active`)}
          ${stat('Active chamas',activeChamas.length,`${chamas.length} total groups`,'good')}
          ${stat('Active loans',activeLoans.length,`${disbursedLoans.length} disbursed loans`)}
          ${stat('Loan portfolio outstanding',money(outstanding),'Unpaid installment balances','blue')}
          ${stat('Loan arrears',money(arrears),`${overdueInst.length} overdue instalments`,'warn')}
          ${stat('Repayments recorded (all time)',money(sum(repayments)),'Repayment ledger total','good')}
        </div>
        <div class="grid-two">
          ${panel('Chama group growth — new groups per month',miniBars(chamaTrend,'count'))}
          ${panel('Member growth — new registrations per month',miniBars(memberTrend,'count'))}
        </div>
        <div class="grid-two">
          ${panel('Loan application activity — applications per month',miniBars(applicationTrend,'count'))}
          ${panel('Loan portfolio status',`${metric('Disbursed loans',disbursedLoans.length)}${metric('Active loans',activeLoans.length)}${metric('Completed / closed',disbursedLoans.filter(x=>['completed','closed'].includes(low(x.status))).length)}${metric('Defaulted / written off',disbursedLoans.filter(x=>['defaulted','written_off'].includes(low(x.status))).length)}${metric('Overdue instalments',overdueInst.length)}${metric('Portfolio at risk (PAR)',money(arrears),'Overdue installment balance; PAR ratio requires a confirmed denominator')}`)}
        </div>
        ${panel('Savings activity — last six months',`<div class="gora-legend"><span><i></i> Deposits</span><span><b></b> Withdrawals</span></div>${savingsBars||'<p>No posted savings transactions yet.</p>'}`)}

        <div class="gora-section-heading"><h3>Existing dashboard records</h3><span>Recent activity retained</span></div>
        <div class="grid-two">
          ${panel('Recently registered members',table(['Member','Member number','Status','Joined'],recentMembers.map(x=>`<tr><td>${esc(x.full_name)}</td><td>${esc(x.member_number||'—')}</td><td>${esc(x.status||'—')}</td><td>${esc(x.date_joined||'—')}</td></tr>`)))}
          ${panel('Recently opened chama groups',table(['Group','Location','Meeting day','Status'],recentChamas.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.location||'—')}</td><td>${esc(x.meeting_day||'—')}</td><td>${esc(x.status||'—')}</td></tr>`)))}
        </div>
        <div class="grid-two">
          ${panel('Recent savings transactions',table(['Type','Amount','Method','Date'],recentSavings.map(x=>`<tr><td>${esc(x.transaction_type)}</td><td>${money(x.amount)}</td><td>${esc(x.payment_method||'—')}</td><td>${esc(dateLabel(x.transaction_date))}</td></tr>`)))}
          ${panel('Recent loan applications',table(['Member','Requested','Status','Applied'],recentApps.map(x=>`<tr><td>${esc(memberName(x.member_id))}</td><td>${money(x.requested_amount)}</td><td>${esc(x.status||'—')}</td><td>${esc(dateLabel(x.applied_at||x.requested_at))}</td></tr>`)))}
        </div>
        ${panel('Recent loan repayments',table(['Member','Amount','Payment method','Receipt','Date'],recentRepayments.map(x=>{const loan=loans.find(l=>l.id===x.loan_id); return `<tr><td>${esc(memberName(loan?.member_id))}</td><td>${money(x.amount)}</td><td>${esc(x.payment_method||'—')}</td><td>${esc(x.receipt_number||'—')}</td><td>${esc(dateLabel(x.payment_date))}</td></tr>`;})))}

        ${errors.length ? `<div class="notice gora-data-note"><strong>Some optional data sources could not be read.</strong><br>${errors.map(esc).join('<br>')}<br>Other sections are still displayed using the data that was available.</div>` : ''}
        <div class="notice">Financial safeguards: member savings are liabilities, not GORA lending capital. Outstanding loans are not cash. Figures labelled “not verified” are intentionally withheld until the relevant ledger or reconciliation workflow exists. This Dashboard is read-only.</div>
      `;

      // Reporting filter affects the summary and operations cards without changing stored data.
      const periodSelect=host.querySelector('#goraPeriod');
      if(periodSelect){ periodSelect.value=period; const custom=host.querySelector('#goraCustomDates'); const from=host.querySelector('#goraStartDate'); const to=host.querySelector('#goraEndDate'); if(from)from.value=host.dataset.goraStart||today; if(to)to.value=host.dataset.goraEnd||today; if(custom)custom.hidden=period!=='custom'; periodSelect.addEventListener('change',()=>{ host.dataset.goraPeriod=periodSelect.value; runDashboard(host); }); const applyDates=()=>{ if(from&&to&&from.value&&to.value&&from.value<=to.value){host.dataset.goraStart=from.value;host.dataset.goraEnd=to.value;runDashboard(host);} }; from?.addEventListener('change',applyDates); to?.addEventListener('change',applyDates); }
      host.querySelector('#goraRefresh')?.addEventListener('click',()=>runDashboard(host));
      host.querySelectorAll('[data-gora-page]').forEach(btn=>btn.addEventListener('click',()=>{
        const page=btn.getAttribute('data-gora-page');
        const nav=document.querySelector(`#nav [data-page="${CSS.escape(page)}"]`);
        if(nav) nav.click(); else if(typeof window.load==='function') window.load(page);
      }));
    } catch(err) {
      host.innerHTML=`<div class="panel error"><h3>Dashboard could not load</h3><p>${esc(err.message||err)}</p><p>No records have been changed. Check your sign-in session and Supabase read permissions, then refresh.</p></div>`;
    }
  }

  window.dashboard = runDashboard;
  // Preserve app.js routing; only replace the Dashboard rendering branch.
  if (typeof window.load === 'function' && !window.load.__goraDashboardV2) {
    const originalLoad=window.load;
    const wrappedLoad=async function(page){
      if(page==='Dashboard'){
        const title=document.getElementById('title');
        const content=document.getElementById('content');
        if(title) title.textContent='Dashboard';
        if(content) await runDashboard(content);
        return;
      }
      return originalLoad.apply(this,arguments);
    };
    wrappedLoad.__goraDashboardV2=true;
    window.load=wrappedLoad;
  }
})();
