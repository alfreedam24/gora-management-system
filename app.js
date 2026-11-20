const $=id=>document.getElementById(id);let db=null,profile=null;
const cash=n=>new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES',maximumFractionDigits:0}).format(Number(n||0));
function connect(){const u=localStorage.getItem('gora_url'),k=localStorage.getItem('gora_key');if(!u||!k||!window.supabase)return false;db=window.supabase.createClient(u,k);return true}
$('save').onclick=()=>{localStorage.setItem('gora_url',$('url').value.trim());localStorage.setItem('gora_key',$('key').value.trim());$('msg').textContent=connect()?'Connection settings saved on this device.':'Enter both settings.'};

async function openWorkspace(user){
  const p = await db.from('profiles')
    .select('full_name,role,active')
    .eq('id', user.id)
    .single();

  if(p.error || !p.data?.active){
    $('msg').textContent = 'Your GORA staff profile is not active. Ask the administrator.';
    await db.auth.signOut();
    return;
  }

  profile = p.data;
  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('who').textContent = profile.full_name || user.email;
  $('topWho').textContent = profile.full_name || user.email;
  $('role').textContent = profile.role || 'Staff';

  await load('Dashboard');
}

$('signin').onclick = async () => {
  if(!connect()){
    $('msg').textContent = 'Save your Supabase project URL and public key first.';
    return;
  }

  const {data,error} = await db.auth.signInWithPassword({
    email: $('email').value.trim(),
    password: $('password').value
  });

  if(error){
    $('msg').textContent = error.message;
    return;
  }

  await openWorkspace(data.user);
};

$('logout').onclick=async()=>{await db.auth.signOut();location.reload()};
$('menuToggle').onclick=()=>$('sidebar').classList.toggle('open');
$('nav').addEventListener('click',e=>{
  const b=e.target.closest('[data-page]');
  if(!b)return;

  const page=b.dataset.page;

  if(page==='Members'){location.href='members-v2.html';return}
  if(page==='Approvals'){location.href='member-approvals-v2.html';return}
  if(page==='Chamas'){location.href='chama-management-v2.html';return}
if(page==='Capital Management'){location.href='capital-management-v2.html';return}
  document.querySelectorAll('#nav .nav-item').forEach(x=>{
    x.classList.toggle('active',x===b);
  });

  $('sidebar').classList.remove('open');

  load(page);
});
const safe=async(q)=>{const r=await q;if(r.error)throw r.error;return r};
function stat(label,value,foot='',kind=''){return `<div class="stat ${kind}"><div class="label">${label}</div><strong>${value}</strong><div class="foot">${foot}</div></div>`}
function table(title,cols,rows){return `<div class="tablebox"><div class="table-head"><h3>${title}</h3></div><table><thead><tr>${cols.map(c=>`<th>${c.replaceAll('_',' ')}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${cols.map(c=>`<td>${String(r[c]??'—')}</td>`).join('')}</tr>`).join(''):`<tr><td class="empty" colspan="${cols.length}">No records found.</td></tr>`}</tbody></table></div>`}

async function dashboard(c){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const monthKey=d=>String(d||'').slice(0,7), money=n=>cash(Math.max(0,Number(n)||0));
 const [m,ch,l,r,apps,inst]=await Promise.all([
  safe(db.from('members').select('id',{count:'exact',head:true})),
  safe(db.from('chamas').select('id',{count:'exact',head:true}).eq('status','active')),
  safe(db.from('loans').select('id,principal,total_payable,status,disbursement_date')),
  safe(db.from('repayments').select('amount,payment_date')),
  safe(db.from('loan_applications').select('id,status')),
  safe(db.from('installment_balances').select('loan_id,balance,due_date,payment_status'))
 ]);
 const allLoans=l.data||[],reps=r.data||[],ins=inst.data||[];
 const issuedLoans=allLoans.filter(x=>x.disbursement_date&&!['pending','approved','rejected','cancelled'].includes(String(x.status||'').toLowerCase()));
 const issuedIds=new Set(issuedLoans.map(x=>x.id));
 const paid=reps.reduce((s,x)=>s+Number(x.amount||0),0);
 const principal=issuedLoans.reduce((s,x)=>s+Number(x.principal||0),0);
 const portfolioInst=ins.filter(x=>issuedIds.has(x.loan_id));
 const outstanding=portfolioInst.reduce((s,x)=>s+Number(x.balance||0),0);
 const overdue=portfolioInst.filter(x=>x.due_date<today&&Number(x.balance)>0);
 const arrears=overdue.reduce((s,x)=>s+Number(x.balance||0),0);
 const due=portfolioInst.filter(x=>x.due_date===today&&Number(x.balance)>0);
 const dueToday=due.reduce((s,x)=>s+Number(x.balance||0),0);
 const daysLate=d=>Math.floor((Date.parse(today+'T00:00:00Z')-Date.parse(String(d)+'T00:00:00Z'))/86400000);
 const ageing=[['1–7 days',1,7],['8–30 days',8,30],['31–60 days',31,60],['Over 60 days',61,Infinity]];
 const ageRows=ageing.map(([label,from,to])=>{const rows=overdue.filter(x=>daysLate(x.due_date)>=from&&daysLate(x.due_date)<=to);return {label,count:rows.length,amount:rows.reduce((s,x)=>s+Number(x.balance||0),0)}});
 const pending=(apps.data||[]).filter(x=>String(x.status||'').toLowerCase()==='pending').length;
 const activeLoans=issuedLoans.filter(x=>!['completed','closed','defaulted','written_off'].includes(String(x.status||'').toLowerCase())).length;
 const completed=issuedLoans.filter(x=>['completed','closed'].includes(String(x.status||'').toLowerCase())).length;
 const defaulted=issuedLoans.filter(x=>['defaulted','written_off'].includes(String(x.status||'').toLowerCase())).length;
 const now=new Date(),months=[];
 for(let i=5;i>=0;i--){months.push(new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-i,1)).toISOString().slice(0,7));}
 const trend=months.map(k=>({month:k,disbursed:issuedLoans.filter(x=>monthKey(x.disbursement_date)===k).reduce((s,x)=>s+Number(x.principal||0),0),collected:reps.filter(x=>monthKey(x.payment_date)===k).reduce((s,x)=>s+Number(x.amount||0),0)}));
 const fmtMonth=k=>new Date(k+'-01T00:00:00').toLocaleDateString('en-KE',{month:'short',year:'2-digit'});
 c.innerHTML=`<div class="page-heading"><div><h2>Good day, ${esc(profile?.full_name||'GORA team')}</h2><div class="sub">Live portfolio and operations overview · ${today} (Kenya time)</div></div><span class="pill">LIVE DATABASE</span></div>
 <div class="stats">
 ${stat('Registered members',m.count||0,'All member records','blue')}
 ${stat('Active chamas',ch.count||0,'Groups marked active','good')}
 ${stat('Loans disbursed',money(principal),'Principal of disbursed loans','blue')}
 ${stat('Total repayments',money(paid),'All recorded repayments','good')}
 ${stat('Outstanding balance',money(outstanding),'Unpaid installment balances','warn')}
 ${stat('Loan arrears',money(arrears),'Past-due unpaid installments','red')}
 ${stat('Due today',money(dueToday),due.length+' unpaid installments','warn')}
 ${stat('Pending applications',pending,'Awaiting administrator review','blue')}
 </div>
 <div class="notice">Portfolio balances use installment balances for loans with a recorded disbursement date. Repayments shown are all recorded repayments. Confirm database access and payment allocation before using these figures for financial decisions.</div>
 <div class="grid-two"><div class="panel"><h3>Portfolio status</h3>
 <div class="metric-line"><span>Disbursed loans</span><b>${issuedLoans.length}</b></div>
 <div class="metric-line"><span>Active loans</span><b>${activeLoans}</b></div>
 <div class="metric-line"><span>Completed / closed</span><b>${completed}</b></div>
 <div class="metric-line"><span>Defaulted / written off</span><b>${defaulted}</b></div>
 <div class="metric-line"><span>Installments overdue</span><b>${overdue.length}</b></div></div>
 <div class="panel"><h3>Arrears ageing</h3>
 ${ageRows.map(a=>`<div class="metric-line"><span>${a.label} (${a.count})</span><b>${money(a.amount)}</b></div>`).join('')}
 <div class="metric-line"><span><b>Total arrears</b></span><b>${money(arrears)}</b></div></div></div>
 <div class="panel"><h3>Six-month activity</h3><div class="sub">Disbursements are principal issued; collections are repayments recorded in each month.</div>
 ${trend.map(t=>`<div class="metric-line"><span>${fmtMonth(t.month)}</span><span>Issued: <b>${money(t.disbursed)}</b> · Collected: <b>${money(t.collected)}</b></span></div>`).join('')}
 </div>
 <div class="notice">No repayment percentage, attendance score, or chama performance score is shown because those measures require verified targets and complete supporting records. Loan rates and fees remain controlled by loan-product settings.</div>`;
}

const pages={
 'Members':['members',['member_number','full_name','phone','location','status']],
 'Chamas':['chamas',['name','location','meeting_day','status']],
 'Applications':['loan_applications',['member_id','requested_amount','purpose','status','applied_at']],
 'Loans':['loans',['member_id','principal','interest_amount','total_payable','disbursement_date','status']],
 'Installments':['installment_balances',['loan_id','installment_number','due_date','amount_due','amount_paid','balance','payment_status']],
 'Arrears':['installment_balances',['loan_id','installment_number','due_date','amount_due','amount_paid','balance','payment_status']],
 'Repayments':['repayments',['loan_id','installment_id','amount','payment_date','payment_method','receipt_number']],
 'Savings':['savings_transactions',['member_id','chama_id','transaction_type','amount','transaction_date','reference']],
 'Cashbook':['cashbook',['transaction_date','entry_type','amount','description','reference']],
 'Petty Cash':['petty_cash_transactions',['transaction_date','transaction_type','category','amount','description','status']],
 'Expenses':['cashbook',['transaction_date','entry_type','amount','description','reference']],
 'Staff':['profiles',['full_name','role','active']],
 'Performance':['chama_performance',['chama_name','active_members','attendance_percentage','savings_performance','repayment_performance']],
 'Reports':['loan_balances',['loan_id','member_id','principal','interest_amount','total_payable','amount_paid','outstanding_balance','status']]
};

async function financePage(page,c){
  if(page==='Transactions' || page==='Capital Management'){
    const r=await safe(
      db.from('capital_transactions')
        .select('transaction_date,transaction_type,amount,payment_method,reference,description')
        .order('transaction_date',{ascending:false})
        .limit(100)
    );
    const rows=r.data||[];
    c.innerHTML=`
      <div class="page-heading">
        <div><h2>${page}</h2><div class="sub">Capital movements recorded in GORA.</div></div>
      </div>
      <div class="notice">These are capital transactions, not a complete list of all income, expenses or loan repayments.</div>
      ${table('Capital transaction records',['transaction_date','transaction_type','amount','payment_method','reference','description'],rows)}
    `;
    return;
  }

  if(page==='Daily Reconciliation'){
    const r=await safe(
      db.from('daily_reconciliations')
        .select('reconciliation_date,opening_cash,opening_mpesa,opening_bank,actual_closing_cash,actual_closing_mpesa,actual_closing_bank,cash_variance,mpesa_variance,bank_variance,status,notes')
        .order('reconciliation_date',{ascending:false})
        .limit(100)
    );
    c.innerHTML=`
      <div class="page-heading"><div><h2>Daily Reconciliation</h2><div class="sub">Compare expected and actual balances.</div></div></div>
      ${table('Reconciliation records',['reconciliation_date','opening_cash','opening_mpesa','opening_bank','actual_closing_cash','actual_closing_mpesa','actual_closing_bank','cash_variance','mpesa_variance','bank_variance','status','notes'],r.data||[])}
    `;
    return;
  }

  const descriptions={
    'Finance Overview':'A consolidated view of GORA financial performance.',
    'Income':'Income will be calculated from verified posted accounting entries.',
    'Expenses':'Expenses will be calculated from verified posted accounting entries.',
    'Petty Cash':'Petty cash records require a dedicated, secure transaction workflow.',
    'Accounting':'The accounting ledger will use controlled double-entry journal records.',
    'Financial Reports':'Financial reports will use verified posted accounting entries.'
  };

  c.innerHTML=`
    <div class="page-heading"><div><h2>${page}</h2><div class="sub">${descriptions[page]||'Finance workspace'}</div></div></div>
    <div class="notice">This section is being prepared. No figures will be invented or treated as official profit before the required accounting records and controls are available.</div>
  `;
}
async function chamaPage(c){
  const [groups,members]=await Promise.all([
  safe(db.from('chamas').select('id,name,location,meeting_day,meeting_frequency,weekly_savings_target,status,created_at').order('created_at',{ascending:false})),
  safe(db.from('members').select('id,member_number,full_name,phone,status').order('full_name'))
 ]);
 const groupRows=groups.data||[], memberRows=members.data||[];
 c.innerHTML=`<div class="page-heading"><div><h2>Chama management</h2><div class="sub">Create groups and organise registered GORA members.</div></div><button class="primary" id="newChama">＋ Add new chama</button></div>
 <div class="grid-two"><div class="panel"><h3>Register a chama</h3><form id="chamaForm">
 <label>Chama name<input name="name" required maxlength="100" placeholder="e.g. Mtondia Women Group"></label>
 <label>Location<input name="location" required maxlength="120" placeholder="e.g. Mtondia, Kilifi"></label>
 <label>Meeting day<input name="meeting_day" placeholder="e.g. Friday"></label>
 <label>Meeting frequency<select name="meeting_frequency"><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="monthly">Monthly</option></select></label>
 <label>Weekly savings target per member (KSh)<input name="weekly_savings_target" type="number" min="1" step="1" value="100" required></label>
 <label>Group status<select name="status"><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
 <button class="primary" type="submit">Save chama</button><p id="chamaMsg" class="message"></p></form></div>
 <div class="panel"><h3>Add registered member to a chama</h3><form id="joinForm">
 <label>Select chama<select name="chama_id" required><option value="">Choose chama</option>${groupRows.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></label>
 <label>Select registered member<select name="member_id" required><option value="">Choose member</option>${memberRows.filter(m=>m.status==='active').map(m=>`<option value="${m.id}">${esc(m.full_name)} — ${esc(m.member_number||m.phone||'')}</option>`).join('')}</select></label>
 <label>Date joined<input name="date_joined" type="date" value="${new Date().toISOString().slice(0,10)}" required></label>
 <button class="primary" type="submit">Add member to chama</button><p id="joinMsg" class="message"></p></form>
 <p class="hint">Only active members already registered in the GORA Members Registry appear here.</p></div></div>
 ${table('Registered chamas',['name','location','meeting_day','meeting_frequency','weekly_savings_target','status'],groupRows.map(g=>({...g,weekly_savings_target:cash(g.weekly_savings_target??100),status:g.status||'active'})))}
 <div class="notice">Creating chamas and assigning members requires the correct Supabase row-level security policies. If saving is denied, no record has been added; the database administrator must apply the accompanying policy script.</div>`;
 $('newChama').onclick=()=>$('chamaForm').scrollIntoView({behavior:'smooth',block:'center'});
 $('chamaForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const row={name:f.get('name').trim(),location:f.get('location').trim(),meeting_day:f.get('meeting_day').trim()||null,meeting_frequency:f.get('meeting_frequency'),weekly_savings_target:Number(f.get('weekly_savings_target')||100),status:f.get('status')};const msg=$('chamaMsg');try{await safe(db.from('chamas').insert(row));msg.textContent='Chama saved successfully.';await chamaPage(c)}catch(err){msg.textContent='Could not save: '+(err.message||err);}};
 $('joinForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const row={chama_id:f.get('chama_id'),member_id:f.get('member_id'),date_joined:f.get('date_joined'),status:'active'};const msg=$('joinMsg');try{await safe(db.from('chama_members').insert(row));msg.textContent='Member added to chama successfully.';await chamaPage(c)}catch(err){msg.textContent='Could not add member: '+(err.message||err);}};
}

async function membersPage(c){
 const res=await safe(db.from('members').select('id,member_number,full_name,phone,national_id,location,date_joined,status').order('created_at',{ascending:false}).limit(200));
 const groups=await safe(db.from('chamas').select('id,name').eq('status','active').order('name'));
 const rows=res.data||[];
 c.innerHTML=`<div class="page-heading"><div><h2>Member registration</h2><div class="sub">Register a member and optionally assign them to a chama.</div></div></div>
 <div class="panel"><h3>Register new member</h3><form id="memberForm" class="grid-two">
 <label>Member number<input name="member_number" maxlength="30" placeholder="e.g. GORA-0001"></label>
 <label>Full name<input name="full_name" required maxlength="120"></label>
 <label>Phone number<input name="phone" required maxlength="30" placeholder="07XXXXXXXX"></label>
 <label>National ID<input name="national_id" maxlength="30"></label>
 <label>Location<input name="location" required maxlength="120"></label>
 <label>Date joined<input name="date_joined" type="date" value="${new Date().toISOString().slice(0,10)}" required></label>
 <label>Membership status<select name="status"><option value="pending_verification">Pending verification</option><option value="active">Active</option></select></label>
 <label>Assign to chama (optional)<select name="chama_id"><option value="">Do not assign now</option>${(groups.data||[]).map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></label>
 <div><button class="primary" type="submit">Register member</button><p id="memberMsg" class="message"></p></div></form></div>
 ${table('Member registry',['member_number','full_name','phone','national_id','location','date_joined','status'],rows)}`;
 $('memberForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const msg=$('memberMsg');const memberNo=f.get('member_number').trim()||('GORA-'+Date.now().toString().slice(-8));try{
 const payload={member_number:memberNo,full_name:f.get('full_name').trim(),phone:f.get('phone').trim(),national_id:f.get('national_id').trim()||null,location:f.get('location').trim(),date_joined:f.get('date_joined'),status:f.get('status')};
 const added=await safe(db.from('members').insert(payload).select('id').single());
 const chamaId=f.get('chama_id');if(chamaId)await safe(db.from('chama_members').insert({member_id:added.data.id,chama_id:chamaId,date_joined:f.get('date_joined'),status:'active'}));
 alert('Member registered. Verify their details and membership payment before activating access.');await membersPage(c);
 }catch(err){msg.textContent='Could not register member: '+(err.message||err)}};
}



async function applicationsPage(c) {
  try {
    const { data: authData, error: authError } = await db.auth.getUser();

    if (authError || !authData?.user) {
      throw new Error('Please sign in again.');
    }

    const user = authData.user;

    const assignments = await safe(
      db.from('user_roles')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
    );

    const orgIds = [...new Set(
      (assignments.data || [])
        .map(x => x.organization_id)
        .filter(Boolean)
    )];

    if (orgIds.length !== 1) {
      throw new Error(
        'Your staff account must have exactly one active organisation assignment.'
      );
    }

    const orgId = orgIds[0];

    const [membersResult, individualsResult, productsResult,
      membershipsResult, groupsResult, appsResult] = await Promise.all([
      safe(db.from('members')
        .select('id,organization_id,member_number,full_name,phone,status')
        .eq('organization_id', orgId)
        .eq('status', 'ACTIVE')
        .order('full_name')),

      safe(db.from('individual_borrowers')
        .select('id,organization_id,borrower_number,full_name,phone,status')
        .eq('organization_id', orgId)
        .eq('status', 'ACTIVE')
        .order('full_name')),

      safe(db.from('loan_products')
        .select('id,organization_id,product_name,product_code,application_type,minimum_amount,maximum_amount,interest_rate,duration_min,duration_max,duration_unit,processing_fee_type,processing_fee_value,status')
        .eq('organization_id', orgId)
        .eq('status', 'ACTIVE')
        .order('product_name')),

      safe(db.from('chama_memberships')
        .select('id,group_id,member_id,status')
        .eq('organization_id', orgId)
        .eq('status', 'ACTIVE')),

      safe(db.from('chama_groups')
        .select('id,group_name,status')
        .eq('organization_id', orgId)
        .eq('status', 'ACTIVE')),

      safe(db.from('loan_applications')
        .select('id,application_number,borrower_type,member_id,individual_borrower_id,loan_product_id,requested_amount,requested_duration,requested_duration_unit,purpose,status,applied_at')
        .eq('organization_id', orgId)
        .order('applied_at', { ascending: false })
        .limit(100))
    ]);

    const members = membersResult.data || [];
    const individuals = individualsResult.data || [];
    const products = productsResult.data || [];
    const memberships = membershipsResult.data || [];
    const groups = groupsResult.data || [];
    const applications = appsResult.data || [];

    const activeGroupIds = new Set(
      groups.map(g => g.id)
    );

    const activeMemberships = memberships.filter(
      m => activeGroupIds.has(m.group_id)
    );

    const memberNames = Object.fromEntries(
      members.map(m => [m.id, m.full_name])
    );

    const individualNames = Object.fromEntries(
      individuals.map(m => [m.id, m.full_name])
    );

    const productNames = Object.fromEntries(
      products.map(p => [p.id, p.product_name])
    );

    const fullAssessmentTypes = [
      'BUSINESS',
      'SCHOOL_FEES',
      'HOSPITAL'
    ];

    c.innerHTML = `
      <div class="page-heading">
        <div>
          <h2>Loan applications</h2>
          <div class="sub">
            Register applications, record assessment information,
            guarantor consent and fee payments.
          </div>
        </div>
      </div>

      <div class="panel">
        <h3>New loan application</h3>

        <form id="applicationForm" class="grid-two">

          <label>Borrower category
            <select name="borrower_type" id="borrowerType" required>
              <option value="MEMBER">GORA chama member</option>
              <option value="INDIVIDUAL">Individual borrower</option>
            </select>
          </label>

          <label id="borrowerLabel">Select member
            <select name="member_id" id="borrowerSelect" required>
              <option value="">Select member</option>
              ${members.map(m => `
                <option value="${m.id}">
                  ${esc(m.full_name)} — ${esc(m.member_number || m.phone || '')}
                </option>
              `).join('')}
            </select>
          </label>

          <label>Loan product
            <select name="loan_product_id" id="applicationProduct" required>
              <option value="">Select loan product</option>
              ${products.map(p => `
                <option value="${p.id}">
                  ${esc(p.product_name)} — ${esc(p.application_type)}
                  (${cash(p.minimum_amount)}–${cash(p.maximum_amount)})
                </option>
              `).join('')}
            </select>
          </label>

          <label>Requested amount (KSh)
            <input name="requested_amount" type="number"
              min="1" step="1" required>
          </label>

          <label>Repayment duration
            <input name="requested_duration" type="number"
              min="1" step="1" required>
          </label>

          <label>Duration unit
            <select name="requested_duration_unit" id="durationUnit" required>
              <option value="DAYS">Days</option>
              <option value="WEEKS">Weeks</option>
              <option value="MONTHS">Months</option>
            </select>
          </label>

          <label class="full">Loan purpose
            <textarea name="purpose" required maxlength="1000"></textarea>
          </label>

          <div id="assessmentSection" class="full hidden">
            <h3>Financial assessment</h3>

            <label>Monthly income (KSh)
              <input name="assessment_monthly_income"
                type="number" min="0" step="0.01">
            </label>

            <label>Monthly expenses (KSh)
              <input name="assessment_monthly_expenses"
                type="number" min="0" step="0.01">
            </label>

            <label>Existing monthly loan repayments (KSh)
              <input name="assessment_existing_monthly_debt"
                type="number" min="0" step="0.01">
            </label>

            <label>Assessment notes
              <textarea name="assessment_notes"
                maxlength="2000"></textarea>
            </label>
          </div>

          <div id="guarantorSection" class="full hidden">
            <h3>Guarantor details</h3>

            <label>Select active GORA member
              <select name="guarantor_member_id" id="guarantorSelect">
                <option value="">Select guarantor</option>
                ${members.map(m => `
                  <option value="${m.id}">
                    ${esc(m.full_name)} — ${esc(m.member_number || m.phone || '')}
                  </option>
                `).join('')}
              </select>
            </label>

            <label>
              <input type="checkbox" name="guarantorConsent"
                id="guarantorConsent">
              I confirm that the selected guarantor has given consent.
            </label>

            <p class="hint">
              The guarantor must be an active GORA chama member.
              Chama borrowers must use a guarantor from their own chama.
            </p>
          </div>

          <div class="full">
            <h3>Application fee payment</h3>

            <p class="hint">
              Enter the amount actually received. The system does not
              calculate the fee or automatically verify payment.
            </p>

            <label>Amount received (KSh)
              <input name="fee_amount" type="number"
                min="0" step="0.01" required>
            </label>

            <label>Payment method
              <select name="fee_payment_method" required>
                <option value="">Select payment method</option>
                <option value="CASH">Cash</option>
                <option value="MPESA">M-Pesa</option>
                <option value="BANK">Bank</option>
              </select>
            </label>

            <label>Payment reference
              <input name="fee_reference" maxlength="100"
                placeholder="M-Pesa code or receipt number">
            </label>
          </div>

          <div class="full">
            <button class="primary" type="submit">
              Submit loan application
            </button>
            <p id="applicationMsg" class="message"></p>
          </div>

        </form>
      </div>

      <div class="panel">
        <h3>Application register</h3>
        ${table(
          'Recent applications',
          ['application_number','borrower','product','requested_amount','status','applied_at'],
          applications.map(a => ({
            application_number: a.application_number,
            borrower: a.borrower_type === 'INDIVIDUAL'
              ? individualNames[a.individual_borrower_id] || 'Individual'
              : memberNames[a.member_id] || 'Member',
            product: productNames[a.loan_product_id] || '—',
            requested_amount: cash(a.requested_amount),
            status: a.status,
            applied_at: a.applied_at
              ? new Date(a.applied_at).toLocaleString()
              : '—'
          }))
        )}
      </div>

      <div class="notice">
        Applications are submitted as PENDING. Fee verification,
        assessment review, approval and disbursement remain separate
        authorised actions.
      </div>
    `;

    const form = $('applicationForm');
    const borrowerType = $('borrowerType');
    let borrowerSelect = $('borrowerSelect');
    const borrowerLabel = $('borrowerLabel');
    const productSelect = $('applicationProduct');
    const durationUnit = $('durationUnit');
    const assessmentSection = $('assessmentSection');
    const guarantorSection = $('guarantorSection');
    const guarantorSelect = $('guarantorSelect');
    const consent = $('guarantorConsent');

    function updateBorrowerOptions() {
      const individual = borrowerType.value === 'INDIVIDUAL';
      const list = individual ? individuals : members;

      borrowerLabel.innerHTML = `
        <label>${individual ? 'Select individual borrower' : 'Select member'}
          <select name="${individual ? 'individual_borrower_id' : 'member_id'}"
            id="borrowerSelect" required>
            <option value="">Select borrower</option>
            ${list.map(m => `
              <option value="${m.id}">
                ${esc(m.full_name)} —
                ${esc(m.borrower_number || m.member_number || m.phone || '')}
              </option>
            `).join('')}
          </select>
        </label>
      `;

      borrowerSelect = $('borrowerSelect');
      updateGuarantors();
      updateProductRequirements();
    }

    function updateGuarantors() {
      const individual = borrowerType.value === 'INDIVIDUAL';
      const borrowerId = borrowerSelect.value;

      let eligible = members.filter(m => {
        if (m.id === borrowerId) return false;

        const memberGroups = activeMemberships
          .filter(x => x.member_id === m.id)
          .map(x => x.group_id);

        return memberGroups.length > 0;
      });

      if (!individual && borrowerId) {
        const borrowerGroups = activeMemberships
          .filter(x => x.member_id === borrowerId)
          .map(x => x.group_id);

        eligible = eligible.filter(m => {
          const guarantorGroups = activeMemberships
            .filter(x => x.member_id === m.id)
            .map(x => x.group_id);

          return guarantorGroups.some(id => borrowerGroups.includes(id));
        });
      }

      guarantorSelect.innerHTML = `
        <option value="">Select guarantor</option>
        ${eligible.map(m => `
          <option value="${m.id}">
            ${esc(m.full_name)} — ${esc(m.member_number || m.phone || '')}
          </option>
        `).join('')}
      `;
    }

    function updateProductRequirements() {
      const p = products.find(x => x.id === productSelect.value);
      const individual = borrowerType.value === 'INDIVIDUAL';

      const needsFullAssessment = individual ||
        (p && fullAssessmentTypes.includes(p.application_type));

      assessmentSection.classList.toggle(
        'hidden',
        !needsFullAssessment
      );

      guarantorSection.classList.toggle(
        'hidden',
        !needsFullAssessment
      );

      const assessmentFields = [
        'assessment_monthly_income',
        'assessment_monthly_expenses',
        'assessment_existing_monthly_debt'
      ];

      assessmentFields.forEach(name => {
        const field = form.elements[name];
        if (field) field.required = needsFullAssessment;
      });

      guarantorSelect.required = needsFullAssessment;
      consent.required = needsFullAssessment;
    }

    borrowerType.onchange = updateBorrowerOptions;
    borrowerSelect.onchange = updateGuarantors;
    productSelect.onchange = () => {
      const p = products.find(x => x.id === productSelect.value);
      if (p) durationUnit.value = p.duration_unit;
      updateProductRequirements();
    };

    updateBorrowerOptions();
    updateProductRequirements();

    form.onsubmit = async e => {
      e.preventDefault();

      const msg = $('applicationMsg');
      msg.textContent = 'Submitting application…';

      try {
        const f = new FormData(form);
        const type = f.get('borrower_type');
        const individual = type === 'INDIVIDUAL';

        const borrowerId = individual
          ? f.get('individual_borrower_id')
          : f.get('member_id');

        const borrower = individual
          ? individuals.find(x => x.id === borrowerId)
          : members.find(x => x.id === borrowerId);

        const product = products.find(
          x => x.id === f.get('loan_product_id')
        );

        const amount = Number(f.get('requested_amount'));
        const duration = Number(f.get('requested_duration'));
        const unit = f.get('requested_duration_unit');
        const feeAmount = Number(f.get('fee_amount'));

        if (!borrower || !product) {
          throw new Error('Select a valid borrower and loan product.');
        }

        if (borrower.organization_id !== orgId ||
            product.organization_id !== orgId) {
          throw new Error('Borrower and product must belong to this organisation.');
        }

        if (amount < Number(product.minimum_amount) ||
            amount > Number(product.maximum_amount)) {
          throw new Error(
            `Amount must be between ${cash(product.minimum_amount)} and ${cash(product.maximum_amount)}.`
          );
        }

        if (unit !== product.duration_unit ||
            duration < Number(product.duration_min) ||
            duration > Number(product.duration_max)) {
          throw new Error(
            `Duration must be ${product.duration_min}–${product.duration_max} ${product.duration_unit}.`
          );
        }

        if (!Number.isFinite(feeAmount) || feeAmount <= 0) {
          throw new Error('Enter the actual application fee payment received.');
        }

        const paymentMethod = f.get('fee_payment_method');
        if (!paymentMethod) {
          throw new Error('Select the fee payment method.');
        }

        const needsFullAssessment = individual ||
          fullAssessmentTypes.includes(product.application_type);

        let guarantorId = null;

        if (needsFullAssessment) {
          const income = Number(f.get('assessment_monthly_income'));
          const expenses = Number(f.get('assessment_monthly_expenses'));
          const debt = Number(f.get('assessment_existing_monthly_debt'));

          if ([income, expenses, debt].some(
            x => !Number.isFinite(x) || x < 0
          )) {
            throw new Error('Enter valid non-negative assessment figures.');
          }

          guarantorId = f.get('guarantor_member_id');

          if (!guarantorId || guarantorId === borrowerId) {
            throw new Error('Select a valid guarantor. Self-guaranteeing is not allowed.');
          }

          if (!consent.checked) {
            throw new Error('Confirm that the guarantor has given consent.');
          }

          const guarantor = members.find(x => x.id === guarantorId);

          if (!guarantor) {
            throw new Error('The selected guarantor is not an active GORA member.');
          }

          const guarantorMembership = activeMemberships.filter(
            x => x.member_id === guarantorId
          );

          if (!guarantorMembership.length) {
            throw new Error('The guarantor must have active chama membership.');
          }

          if (!individual) {
            const borrowerGroups = activeMemberships
              .filter(x => x.member_id === borrowerId)
              .map(x => x.group_id);

            if (!guarantorMembership.some(
              x => borrowerGroups.includes(x.group_id)
            )) {
              throw new Error('A chama borrower must use a guarantor from the same chama.');
            }
          }
        }

        const applicationNumber = 'GORA-' + Date.now();

        const applicationPayload = {
          organization_id: orgId,
          application_number: applicationNumber,
          loan_product_id: product.id,
          borrower_type: type,
          member_id: individual ? null : borrowerId,
          individual_borrower_id: individual ? borrowerId : null,
          requested_amount: amount,
          requested_duration: duration,
          requested_duration_unit: unit,
          purpose: String(f.get('purpose') || '').trim(),
          applied_by: user.id,
          status: 'PENDING'
        };

        if (needsFullAssessment) {
          applicationPayload.assessment_monthly_income =
            Number(f.get('assessment_monthly_income'));

          applicationPayload.assessment_monthly_expenses =
            Number(f.get('assessment_monthly_expenses'));

          applicationPayload.assessment_existing_monthly_debt =
            Number(f.get('assessment_existing_monthly_debt'));

          applicationPayload.assessment_notes =
            String(f.get('assessment_notes') || '').trim();

          applicationPayload.assessment_completed_by = user.id;
          applicationPayload.assessment_completed_at = new Date().toISOString();
        }

        const inserted = await safe(
          db.from('loan_applications')
            .insert(applicationPayload)
            .select('id')
            .single()
        );

        const applicationId = inserted.data.id;

        try {
          await safe(
            db.from('loan_application_fee_payments').insert({
              organization_id: orgId,
              application_id: applicationId,
              amount: feeAmount,
              payment_method: paymentMethod,
              reference_number: String(f.get('fee_reference') || '').trim() || null,
              status: 'PENDING',
              recorded_by: user.id
            })
          );
        } catch (feeError) {
          throw new Error(
            'Application was created, but the fee receipt could not be recorded. ' +
            'Application reference: ' + applicationNumber +
            '. Fee error: ' + (feeError.message || feeError)
          );
        }

        if (guarantorId) {
          try {
            await safe(
              db.from('loan_application_guarantors').insert({
                organization_id: orgId,
                application_id: applicationId,
                guarantor_member_id: guarantorId,
                consent_status: 'CONSENTED',
                consent_recorded_by: user.id,
                consent_recorded_at: new Date().toISOString()
              })
            );
          } catch (guarantorError) {
            throw new Error(
              'Application and fee receipt were recorded, but guarantor recording failed. ' +
              'Application reference: ' + applicationNumber +
              '. Guarantor error: ' + (guarantorError.message || guarantorError)
            );
          }
        }

        msg.textContent =
          'Application ' + applicationNumber +
          ' submitted as PENDING. Fee verification and loan approval are still required.';

        await applicationsPage(c);

      } catch (err) {
        msg.textContent = 'Could not complete submission: ' +
          (err.message || err);
      }
    };

  } catch (err) {
    c.innerHTML = `
      <div class="panel">
        <h3>Could not load loan applications</h3>
        <p>${esc(err.message || err)}</p>
      </div>
    `;
  }
}

async function performancePage(c){
 const [groups,links,savings,repays,loans]=await Promise.all([
 safe(db.from('chamas').select('id,name,weekly_savings_target,status').eq('status','active')),
 safe(db.from('chama_members').select('chama_id,member_id,status').eq('status','active')),
 safe(db.from('savings_transactions').select('chama_id,transaction_type,amount,transaction_date')),
 safe(db.from('repayments').select('amount,payment_date,loan_id')),
 safe(db.from('loans').select('id,member_id,total_payable'))
 ]);
 const gs=groups.data||[],ls=links.data||[],sv=savings.data||[],rp=repays.data||[],ln=loans.data||[];
 const today=new Date().toISOString().slice(0,10),weekStart=new Date();weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));const ws=weekStart.toISOString().slice(0,10);
 const memberChama={};ls.forEach(x=>memberChama[x.member_id]=x.chama_id);
 const dailySaved=sv.filter(x=>x.transaction_date===today&&x.transaction_type==='deposit').reduce((a,x)=>a+Number(x.amount),0);
 const dailyPaid=rp.filter(x=>x.payment_date?.slice(0,10)===today).reduce((a,x)=>a+Number(x.amount),0);
 const dailyTarget=gs.reduce((a,g)=>a+ls.filter(x=>x.chama_id===g.id).length*Number(g.weekly_savings_target||100)/5,0);
 const dailyScore=dailyTarget?Math.min(100,(dailySaved/dailyTarget)*100):0;
 const groupData=gs.map(g=>{const members=ls.filter(x=>x.chama_id===g.id).length;const target=members*Number(g.weekly_savings_target||100);const actual=sv.filter(x=>x.chama_id===g.id&&x.transaction_date>=ws&&x.transaction_type==='deposit').reduce((a,x)=>a+Number(x.amount),0);const sav=target?Math.min(100,actual/target*100):0;const groupMemberIds=ls.filter(x=>x.chama_id===g.id).map(x=>x.member_id);const groupLoanIds=ln.filter(x=>groupMemberIds.includes(x.member_id)).map(x=>x.id);const paid=rp.filter(x=>groupLoanIds.includes(x.loan_id)&&x.payment_date?.slice(0,10)>=ws).reduce((a,x)=>a+Number(x.amount),0);const repayment=100;const score=sav*.3+repayment*.4+0*.2+0*.1;return {name:g.name,members,target:cash(target),actual:cash(actual),savings:`${sav.toFixed(1)}%`,repayments:'Not yet measured',attendance:'Not yet recorded',score:`${score.toFixed(1)}%`}});
 c.innerHTML=`<div class="page-heading"><div><h2>Daily & chama performance</h2><div class="sub">Daily collection indicators and weekly savings target tracking.</div></div></div>
 <div class="stats">${stat('Savings collected today',cash(dailySaved),'Recorded deposits','good')}${stat('Loan repayments today',cash(dailyPaid),'Recorded repayments','blue')}${stat('Indicative daily savings target',cash(dailyTarget),'Weekly target ÷ 5 working days','blue')}${stat('Daily savings target achieved',`${dailyScore.toFixed(1)}%`,'Capped at 100%','warn')}</div>
 ${table('Chama weekly performance',['name','members','target','actual','savings','repayments','attendance','score'],groupData)}
 <div class="notice">Important: the savings percentage is measured against each chama's weekly target (KSh 100 per active member by default). Repayment performance, attendance and participation are not yet fully measurable because the current database has no attendance register or defined repayment targets. The displayed overall score is provisional and must not be treated as a complete chama score.</div>`;
}

function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
async function load(page){$('title').textContent=page;const c=$('content');c.innerHTML='<div class="panel">Loading records…</div>';try{if(page==='Dashboard'){await dashboard(c);return}if(['Finance Overview','Transactions','Income','Expenses','Petty Cash','Capital Management','Daily Reconciliation','Accounting','Financial Reports'].includes(page)){await financePage(page,c);return}if(page==='Chamas'){await chamaPage(c);return}if(page==='Members'){await membersPage(c);return}if(page==='Applications'){await applicationsPage(c);return}if(page==='Performance'){await performancePage(c);return}if(page==='Settings'){c.innerHTML='<div class="panel"><h3>System settings</h3><p>Loan product rates and fees must be administered by the GORA admin only. Configuration controls will be enabled after permission policies are verified.</p></div>';return}
const [tbl,cols]=pages[page]||['audit_logs',['action','table_name','record_id','created_at']];let q=db.from(tbl).select('*').limit(100);if(page==='Arrears')q=q.lt('due_date',new Date().toISOString().slice(0,10)).gt('balance',0);const res=await safe(q);let rows=res.data||[];if(page==='Expenses')rows=rows.filter(x=>x.entry_type==='expense');c.innerHTML=`<div class="page-heading"><div><h2>${page}</h2><div class="sub">Showing up to 100 records from the connected GORA database.</div></div></div><div class="notice">This section is currently connected for viewing. Data-entry, approval and payment actions will be enabled only after their database security and audit controls are completed.</div>${table(page,cols,rows)}`;}
catch(e){c.innerHTML=`<div class="panel"><h3>Could not load ${page}</h3><p>${String(e.message||e)}</p><p>Database access policies or the required view may not yet be configured. No data has been changed.</p></div>`}}
(function(){const u=localStorage.getItem('gora_url')||'',k=localStorage.getItem('gora_key')||'';$('url').value=u;$('key').value=k;connect();})();
if(db){
  db.auth.getSession().then(({data,error})=>{
    if(!error && data.session){
      openWorkspace(data.session.user);
    }
  });
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-page="Savings"]');if(b){e.preventDefault();e.stopImmediatePropagation();location.href='savings-management-v2.html'}},true);
document.addEventListener('click',e=>{const b=e.target.closest('[data-page="Savings"]');if(b){e.preventDefault();e.stopImmediatePropagation();location.href='savings-management-v2.html'}},true);
