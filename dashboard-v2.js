/* GORA 2.0 Dashboard — read-only, schema-aligned */
(() => {
  const money = n => new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES',maximumFractionDigits:0}).format(Number(n||0));
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateKE = v => v ? new Date(v).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'}) : '—';
  const stat = (label,value,foot='',tone='blue') => `<article class="stat ${tone}"><div class="label">${label}</div><strong>${value}</strong><div class="foot">${foot}</div></article>`;
  const panel = (title,body) => `<section class="panel"><h3>${title}</h3>${body}</section>`;
  const miniBars = (items, key, formatter = v => String(v)) => {
    const max = Math.max(1, ...items.map(x => Number(x[key] || 0)));
    return items.map(x => {
      const value = Number(x[key] || 0);
      return `<div class="gora-chart-row"><span>${esc(x.month)}</span><div class="gora-bars ${value===0?'is-zero':''}"><i style="width:${value===0?0:Math.max(4,value/max*100)}%" title="${esc(formatter(value))}"></i></div><small>${esc(formatter(value))}</small></div>`;
    }).join('');
  };
  async function runDashboard(host, branchId = '') {
    host.innerHTML='<div class="panel">Loading verified GORA dashboard data…</div>';
    try {
      const auth = await db.auth.getUser();
      if(auth.error || !auth.data.user) throw new Error('Your sign-in session has expired. Sign in again.');
      const uid=auth.data.user.id;
      const roleRes=await db.from('user_roles').select('organization_id,role_id,roles(role_code,role_name)').eq('user_id',uid).eq('is_active',true);
      if(roleRes.error) throw roleRes.error;
      const assignments=roleRes.data||[];
      const orgIds=[...new Set(assignments.map(x=>x.organization_id).filter(Boolean))];
      if(!orgIds.length) throw new Error('No active GORA organisation role is assigned to this account.');
      if(orgIds.length>1) throw new Error('This account has more than one active organisation. Dashboard organisation selection must be configured before showing totals.');
      const orgId=orgIds[0];
      const orgRes=await db.from('organizations').select('name,currency_code,timezone').eq('id',orgId).single();
      if(orgRes.error) throw orgRes.error;
      const org=orgRes.data;
      const [members,groups,memberships,accounts,transactions,applications,audit,branches]=await Promise.all([
        db.from('members').select('id,full_name,member_number,status,registration_date,created_at,branch_id').eq('organization_id',orgId).order('created_at',{ascending:false}).limit(1000),
        db.from('chama_groups').select('id,group_name,group_code,status,created_at,branch_id').eq('organization_id',orgId).order('created_at',{ascending:false}).limit(1000),
        db.from('chama_memberships').select('id,group_id,member_id,status,joined_at').eq('organization_id',orgId).limit(5000),
        db.from('savings_accounts').select('id,member_id,status,opened_at,branch_id').eq('organization_id',orgId).order('created_at',{ascending:false}).limit(2000),
        db.from('savings_transactions').select('id,transaction_number,transaction_type,amount,payment_method,status,transaction_date,posted_at,created_at,branch_id').eq('organization_id',orgId).order('created_at',{ascending:false}).limit(5000),
        db.from('loan_applications').select('id,application_number,requested_amount,status,applied_at,created_at,branch_id').eq('organization_id',orgId).order('created_at',{ascending:false}).limit(1000),
        db.from('audit_logs').select('id,action,entity_table,entity_id,created_at,actor_user_id,branch_id').eq('organization_id',orgId).order('created_at',{ascending:false}).limit(30),
        db.from('branches').select('id,branch_name,status').eq('organization_id',orgId).order('branch_name')
      ]);
      for(const r of [members,groups,memberships,accounts,transactions,applications,audit,branches]) if(r.error) throw r.error;
      const branchRows = rows => branchId ? rows.filter(x=>x.branch_id===branchId) : rows;
      const M=branchRows(members.data||[]),G=branchRows(groups.data||[]),CM=memberships.data||[],A=branchRows(accounts.data||[]),T=branchRows(transactions.data||[]),L=branchRows(applications.data||[]),LOG=branchRows(audit.data||[]),B=branches.data||[];
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:org.timezone||'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const posted=T.filter(t=>t.status==='posted' && t.posted_at);
      const todayTx=posted.filter(t=>new Intl.DateTimeFormat('en-CA',{timeZone:org.timezone||'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t.transaction_date))===today);
      const isDeposit=t=>['deposit','contribution','savings_deposit'].includes(String(t.transaction_type).toLowerCase());
      const isWithdrawal=t=>['withdrawal','savings_withdrawal'].includes(String(t.transaction_type).toLowerCase());
      const sum=(rows,fn)=>rows.reduce((n,x)=>n+Number(fn(x)||0),0);
      const pendingTx=T.filter(t=>['pending','submitted'].includes(String(t.status).toLowerCase()));
      const pendingApps=L.filter(x=>String(x.status).toLowerCase()==='pending');
      const activeMembers=M.filter(x=>String(x.status).toLowerCase()==='active').length;
      const activeGroups=G.filter(x=>String(x.status).toLowerCase()==='active').length;
      const activeAccounts=A.filter(x=>String(x.status).toLowerCase()==='active').length;
      const deposits=sum(posted.filter(isDeposit),t=>t.amount);
      const withdrawals=sum(posted.filter(isWithdrawal),t=>t.amount);
      const todayDeposits=sum(todayTx.filter(isDeposit),t=>t.amount);
      const todayWithdrawals=sum(todayTx.filter(isWithdrawal),t=>t.amount);
      const todayRepayments=sum(todayTx.filter(t=>String(t.transaction_type).toLowerCase().includes('repay')),t=>t.amount);
      const recentMembers=M.slice(0,6);
      const recentGroups=G.slice(0,6).map(g=>({...g,current_members:CM.filter(x=>x.group_id===g.id&&x.status==='active').length}));
      const recentTx=T.slice(0,8);
      const recentApps=L.slice(0,6);
      const monthKeys=[];
      for(let i=5;i>=0;i--){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);monthKeys.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);}
      const trend=monthKeys.map(k=>{
        const rows=posted.filter(t=>String(t.transaction_date).slice(0,7)===k);
        return {month:new Date(k+'-01T12:00:00').toLocaleDateString('en-KE',{month:'short'}),deposits:sum(rows.filter(isDeposit),t=>t.amount),withdrawals:sum(rows.filter(isWithdrawal),t=>t.amount)};
      });
      const countTrend = (rows, dateField) => monthKeys.map(k => ({
        month:new Date(k+'-01T12:00:00').toLocaleDateString('en-KE',{month:'short'}),
        count:rows.filter(x=>String(x[dateField]||'').slice(0,7)===k).length
      }));
      const groupTrend=countTrend(G,'created_at');
      const memberTrend=countTrend(M,'registration_date');
      const applicationTrend=countTrend(L,'applied_at');
      const max=Math.max(1,...trend.flatMap(x=>[x.deposits,x.withdrawals]));
      const bars=trend.map(x=>`<div class="gora-chart-row"><span>${x.month}</span><div class="gora-bars ${x.deposits===0&&x.withdrawals===0?'is-zero':''}"><i title="Deposits ${money(x.deposits)}" style="width:${x.deposits===0?0:Math.max(4,x.deposits/max*100)}%"></i><b title="Withdrawals ${money(x.withdrawals)}" style="width:${x.withdrawals===0?0:Math.max(4,x.withdrawals/max*100)}%"></b></div><small>${money(x.deposits)}</small></div>`).join('');
      const branchOptions=B.map(x=>`<option value="${x.id}">${esc(x.branch_name)}</option>`).join('');
      const table=(headers,rows)=>`<div class="tablebox"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.join(''):`<tr><td colspan="${headers.length}" class="empty">No records yet.</td></tr>`}</tbody></table></div>`;
      host.innerHTML=`
      <div class="page-heading"><div><h2>${esc(org.name||'GORA')} overview</h2><div class="sub">Verified live records · ${esc(today)} · ${esc(org.timezone||'Africa/Nairobi')}</div></div><div class="gora-filters"><label>Branch <select id="goraBranch"><option value="">All branches</option>${branchOptions}</select></label><button class="secondary" id="goraRefresh">Refresh</button></div></div>
      <div class="stats">
        ${stat('Registered members',M.length,`${activeMembers} active`)}
        ${stat('Active chama groups',activeGroups,`${G.length} total groups`,'good')}
        ${stat('Savings accounts',A.length,`${activeAccounts} active accounts`)}
        ${stat('Pending loan applications',pendingApps.length,`${L.length} applications total`,'warn')}
        ${stat('Posted deposits',money(deposits),'All-time posted savings deposits','good')}
        ${stat('Posted withdrawals',money(withdrawals),'All-time posted savings withdrawals','warn')}
        ${stat('Today’s deposits',money(todayDeposits),'Approved and posted today','good')}
        ${stat('Today’s withdrawals',money(todayWithdrawals),'Approved and posted today','warn')}
        ${stat('Loan disbursements','—','Not yet available · loan ledger pending','muted')}
        ${stat('Loans in arrears','—','Not yet available · instalment ledger pending','muted')}
      </div>
      <div class="notice">Member savings are liabilities, not GORA lending capital. These savings figures are posted transaction totals, not the current member savings liability. Loan disbursements, outstanding principal, repayments, arrears, profit, available lending capital and cash/bank/M-Pesa balances are not displayed because the required verified loan and accounting ledgers are not yet present.</div>
      <div class="grid-two">
        ${panel('Chama group growth — new groups per month',miniBars(groupTrend,'count'))}
        ${panel('Member growth — new registrations per month',miniBars(memberTrend,'count'))}
      </div>
      <div class="grid-two">
        ${panel('Loan application activity — applications per month',miniBars(applicationTrend,'count'))}
        ${panel('Loan disbursement and arrears trends',`<div class="loan-status-grid"><div class="loan-status-card"><span class="loan-status-icon">↗</span><div><strong>Loan disbursements</strong><b>Not yet available</b><small>Waiting for the verified disbursement ledger</small></div></div><div class="loan-status-card"><span class="loan-status-icon">!</span><div><strong>Loans in arrears</strong><b>Not yet available</b><small>Waiting for repayment schedules and instalment balances</small></div></div></div><p class="chart-note">Applications are not counted as disbursements. These figures will become live when the loan ledger module is completed.</p>`)}
      </div>
      <div class="grid-two">
        ${panel('Savings activity — last six months',`<div class="gora-legend"><span><i></i> Deposits</span><span><b></b> Withdrawals</span></div>${bars||'<p>No posted transactions yet.</p>'}`)}
        ${panel('Today’s operations',`<div class="metric-line"><span>Deposits posted</span><b>${money(todayDeposits)}</b></div><div class="metric-line"><span>Withdrawals posted</span><b>${money(todayWithdrawals)}</b></div><div class="metric-line"><span>Repayment-type transactions</span><b>${money(todayRepayments)}</b></div><div class="metric-line"><span>Transactions awaiting approval</span><b>${pendingTx.length}</b></div><div class="metric-line"><span>Applications awaiting review</span><b>${pendingApps.length}</b></div>`)}
      </div>
      <div class="grid-two">
        ${panel('Recently registered members',table(['Member','Member number','Status','Registered'],recentMembers.map(x=>`<tr><td>${esc(x.full_name)}</td><td>${esc(x.member_number||'—')}</td><td>${esc(x.status)}</td><td>${esc(x.registration_date||'—')}</td></tr>`)))}
        ${panel('Recently opened chama groups',table(['Group','Code','Members','Status'],recentGroups.map(x=>`<tr><td>${esc(x.group_name)}</td><td>${esc(x.group_code)}</td><td>${x.current_members}</td><td>${esc(x.status)}</td></tr>`)))}
      </div>
      <div class="grid-two">
        ${panel('Recent savings transactions',table(['Transaction','Type','Amount','Status','Date'],recentTx.map(x=>`<tr><td>${esc(x.transaction_number)}</td><td>${esc(x.transaction_type)}</td><td>${money(x.amount)}</td><td>${esc(x.status)}</td><td>${esc(dateKE(x.transaction_date))}</td></tr>`)))}
        ${panel('Recent loan applications',table(['Application','Requested','Status','Applied'],recentApps.map(x=>`<tr><td>${esc(x.application_number)}</td><td>${money(x.requested_amount)}</td><td>${esc(x.status)}</td><td>${esc(dateKE(x.applied_at))}</td></tr>`)))}
      </div>
      ${panel('Recent audit activity',table(['Action','Record type','Record ID','When'],LOG.slice(0,10).map(x=>`<tr><td>${esc(x.action)}</td><td>${esc(x.entity_table)}</td><td>${esc(x.entity_id||'—')}</td><td>${esc(dateKE(x.created_at))}</td></tr>`)))}
      <div class="notice">Branch selector is provided for the next step of branch-scoped reporting. Current totals are organisation-wide and remain subject to Supabase row-level security. The refresh button reloads all figures from Supabase.</div>`;
      document.getElementById('goraRefresh').onclick=()=>runDashboard(host,branchId);
      document.getElementById('goraBranch').value=branchId;
      document.getElementById('goraBranch').onchange=e=>runDashboard(host,e.target.value);
    } catch(err) {
      host.innerHTML=`<div class="panel error"><h3>Dashboard could not load</h3><p>${esc(err.message||err)}</p><p>Nothing has been changed. Check the signed-in user's organisation role and read policies, then refresh.</p></div>`;
    }
  }
  window.dashboard = runDashboard;
  if (typeof window.load === 'function') {
    const originalLoad = window.load;
    window.load = async function(page) {
      if (page === 'Dashboard') {
        const title = document.getElementById('title');
        const content = document.getElementById('content');
        if (title) title.textContent = 'Dashboard';
        if (content) await runDashboard(content);
        return;
      }
      return originalLoad(page);
    };
  }
})();
