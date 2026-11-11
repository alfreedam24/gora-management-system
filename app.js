const $=id=>document.getElementById(id);let db=null,profile=null;
const cash=n=>new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES',maximumFractionDigits:0}).format(Number(n||0));
function connect(){const u=localStorage.getItem('gora_url'),k=localStorage.getItem('gora_key');if(!u||!k||!window.supabase)return false;db=window.supabase.createClient(u,k);return true}
$('save').onclick=()=>{const u=$('url').value.trim(),k=$('key').value.trim();if(!u||!k){$('msg').textContent='Enter both settings.';return}try{localStorage.setItem('gora_url',u);localStorage.setItem('gora_key',k);const saved=localStorage.getItem('gora_url')===u&&localStorage.getItem('gora_key')===k;$('msg').textContent=saved?'Connection settings saved on this device.':'Browser did not retain the settings.';connect()}catch(err){$('msg').textContent='Could not save settings: '+(err.message||String(err))}};
$('signin').onclick=async()=>{if(!connect()){$('msg').textContent='Save the Supabase project URL and public key first.';return}const {data,error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error){$('msg').textContent=error.message;return}const p=await db.from('profiles').select('full_name,role,active').eq('id',data.user.id).single();if(p.error||!p.data?.active){$('msg').textContent='Your GORA staff profile is not active. Ask the administrator.';await db.auth.signOut();return}profile=p.data;$('login').classList.add('hidden');$('app').classList.remove('hidden');$('who').textContent=profile.full_name||data.user.email;$('topWho').textContent=profile.full_name||data.user.email;$('role').textContent=profile.role||'Staff';await load('Dashboard')};
$('logout').onclick=async()=>{await db.auth.signOut();location.reload()};
$('menuToggle').onclick=()=>$('sidebar').classList.toggle('open');
$('nav').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(!b)return;document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x===b));$('sidebar').classList.remove('open');load(b.dataset.page)});
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
async function chamaPage(c){
 const [groups,links,savings,loans]=await Promise.all([
  safe(db.from('chamas').select('id,name,location,meeting_day,meeting_frequency,weekly_savings_target,status,created_at').order('created_at',{ascending:false})),
  safe(db.from('chama_members').select('chama_id,member_id,status')),
  safe(db.from('savings_transactions').select('chama_id,transaction_type,amount,transaction_date')),
  safe(db.from('loans').select('id,member_id,principal,total_payable,status,disbursement_date'))
 ]);

 const gs=groups.data||[];
 const ls=links.data||[];
 const sv=savings.data||[];
 const ln=loans.data||[];

 const activeLinks=ls.filter(x=>x.status==='active');
 const totalMembers=new Set(activeLinks.map(x=>x.member_id)).size;
 const totalSavings=sv.reduce((sum,x)=>{
  const type=String(x.transaction_type||'').toLowerCase();
  const amount=Number(x.amount||0);
  return sum+(type.includes('withdraw')?-amount:amount);
 },0);

 const activeLoans=ln.filter(x=>x.disbursement_date&&
  !['completed','closed','defaulted','written_off'].includes(String(x.status||'').toLowerCase())
 );

 c.innerHTML=`
 <div class="page-heading">
  <div>
   <h2>Chama Portfolio</h2>
   <div class="sub">Institutional overview of GORA groups and their financial activity.</div>
  </div>
  <button class="primary" id="newChama">＋ Add new chama</button>
 </div>

 <div class="stats">
  ${stat('Total chamas',gs.length,'All registered groups','blue')}
  ${stat('Active chamas',gs.filter(g=>g.status==='active').length,'Currently active','good')}
  ${stat('Group members',totalMembers,'Active chama memberships','blue')}
  ${stat('Recorded savings',cash(totalSavings),'Net recorded transactions','good')}
  ${stat('Active loans',activeLoans.length,'Loans linked to members','warn')}
 </div>

 <div class="notice">
  Savings are calculated from recorded chama transactions. Member savings remain separate from GORA operational funds. Figures depend on complete and correctly classified records.
 </div>

 <div class="panel">
  <h3>Registered chama groups</h3>
  <div class="sub">Select a group to inspect its members and financial records.</div>
  <div class="chama-portfolio-list">
   ${gs.length?gs.map(g=>{
    const members=activeLinks.filter(x=>x.chama_id===g.id);
    const memberIds=members.map(x=>x.member_id);
    const groupSavings=sv.filter(x=>x.chama_id===g.id).reduce((sum,x)=>{
     const type=String(x.transaction_type||'').toLowerCase();
     const amount=Number(x.amount||0);
     return sum+(type.includes('withdraw')?-amount:amount);
    },0);
    const groupLoans=ln.filter(x=>memberIds.includes(x.member_id)&&x.disbursement_date);
    return `
     <div class="panel chama-card">
      <div class="page-heading">
       <div>
        <h3>${esc(g.name)}</h3>
        <div class="sub">${esc(g.location||'Location not recorded')}</div>
       </div>
       <span class="pill">${esc(g.status||'Unknown')}</span>
      </div>
      <div class="metric-line"><span>Active members</span><b>${members.length}</b></div>
      <div class="metric-line"><span>Recorded net savings</span><b>${cash(groupSavings)}</b></div>
      <div class="metric-line"><span>Disbursed loans linked to members</span><b>${groupLoans.length}</b></div>
      <div class="metric-line"><span>Meeting day</span><b>${esc(g.meeting_day||'Not set')}</b></div>
      <button class="primary openChama" data-id="${g.id}">Open chama profile →</button>
     </div>`;
   }).join(''):'<p class="empty">No chamas registered yet.</p>'}
  </div>
 </div>

 <div class="grid-two">
  <div class="panel">
   <h3>Register a chama</h3>
   <form id="chamaForm">
    <label>Chama name<input name="name" required maxlength="100"></label>
    <label>Location<input name="location" required maxlength="120"></label>
    <label>Meeting day<input name="meeting_day" placeholder="e.g. Friday"></label>
    <label>Meeting frequency
     <select name="meeting_frequency">
      <option value="weekly">Weekly</option>
      <option value="biweekly">Every two weeks</option>
      <option value="monthly">Monthly</option>
     </select>
    </label>
    <label>Weekly savings target per member (KSh)
     <input name="weekly_savings_target" type="number" min="1" value="100" required>
    </label>
    <label>Status
     <select name="status">
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
     </select>
    </label>
    <button class="primary" type="submit">Save chama</button>
    <p id="chamaMsg" class="message"></p>
   </form>
  </div>

  <div class="panel">
   <h3>Add member to a chama</h3>
   <form id="joinForm">
    <label>Select chama
     <select name="chama_id" required>
      <option value="">Choose chama</option>
      ${gs.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('')}
     </select>
    </label>
    <label>Select member
     <select name="member_id" required>
      <option value="">Choose member</option>
     </select>
    </label>
    <label>Date joined
     <input name="date_joined" type="date" value="${new Date().toISOString().slice(0,10)}" required>
    </label>
    <button class="primary" type="submit">Add member</button>
    <p id="joinMsg" class="message"></p>
   </form>
  </div>
 </div>`;

 $('newChama').onclick=()=>$('chamaForm').scrollIntoView({behavior:'smooth'});

 const memberOptions=await safe(
  db.from('members').select('id,full_name,member_number,status').order('full_name')
 );

 const availableMembers=(memberOptions.data||[]).filter(m=>m.status==='active');

 $('joinForm').elements.member_id.innerHTML=
  '<option value="">Choose member</option>'+
  availableMembers.map(m=>
   `<option value="${m.id}">${esc(m.full_name)} — ${esc(m.member_number||'')}</option>`
  ).join('');

 $('chamaForm').onsubmit=async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  const msg=$('chamaMsg');
  try{
   await safe(db.from('chamas').insert({
    name:f.get('name').trim(),
    location:f.get('location').trim(),
    meeting_day:f.get('meeting_day').trim()||null,
    meeting_frequency:f.get('meeting_frequency'),
    weekly_savings_target:Number(f.get('weekly_savings_target')),
    status:f.get('status')
   }));
   alert('Chama registered successfully.');
   await chamaPage(c);
  }catch(err){
   msg.textContent='Could not save chama: '+(err.message||err);
  }
 };

 $('joinForm').onsubmit=async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  const msg=$('joinMsg');
  try{
   await safe(db.from('chama_members').insert({
    chama_id:f.get('chama_id'),
    member_id:f.get('member_id'),
    date_joined:f.get('date_joined'),
    status:'active'
   }));
   alert('Member added to chama successfully.');
   await chamaPage(c);
  }catch(err){
   msg.textContent='Could not add member: '+(err.message||err);
  }
 };

 document.querySelectorAll('.openChama').forEach(btn=>{
  btn.onclick=async()=>{
   const id=btn.dataset.id;
   const group=gs.find(g=>g.id===id);
   const memberIds=activeLinks.filter(x=>x.chama_id===id).map(x=>x.member_id);

   const [memberData,savingData]=await Promise.all([
    memberIds.length?
     safe(db.from('members').select('id,member_number,full_name,phone,status').in('id',memberIds)):
     Promise.resolve({data:[]}),
    safe(db.from('savings_transactions').select('transaction_type,amount,transaction_date,reference').eq('chama_id',id).order('transaction_date',{ascending:false}))
   ]);

   const groupLoans=ln.filter(x=>memberIds.includes(x.member_id)&&x.disbursement_date);

   c.innerHTML=`
    <div class="page-heading">
     <div>
      <h2>${esc(group.name)}</h2>
      <div class="sub">${esc(group.location||'Location not recorded')}</div>
     </div>
     <button class="primary" id="backChamas">← Back to portfolio</button>
    </div>

    <div class="stats">
     ${stat('Active members',memberIds.length,'Current group membership','blue')}
     ${stat('Savings transactions',savingData.data.length,'Recorded entries','good')}
     ${stat('Disbursed loans',groupLoans.length,'Linked to group members','warn')}
    </div>

    <div class="panel">
     <h3>Group information</h3>
     <div class="metric-line"><span>Meeting day</span><b>${esc(group.meeting_day||'Not set')}</b></div>
     <div class="metric-line"><span>Meeting frequency</span><b>${esc(group.meeting_frequency||'Not set')}</b></div>
     <div class="metric-line"><span>Weekly savings target per member</span><b>${cash(group.weekly_savings_target)}</b></div>
     <div class="metric-line"><span>Group status</span><b>${esc(group.status)}</b></div>
    </div>

    ${table('Chama members',['member_number','full_name','phone','status'],memberData.data||[])}
    ${table('Group savings transactions',['transaction_type','amount','transaction_date','reference'],
     (savingData.data||[]).map(x=>({...x,amount:cash(x.amount),transaction_date:x.transaction_date?new Date(x.transaction_date).toLocaleDateString():'—'}))
    )}
    ${table('Loans linked to group members',['member_id','principal','total_payable','status'],
     groupLoans.map(x=>({...x,principal:cash(x.principal),total_payable:cash(x.total_payable)}))
    )}
   `;

   $('backChamas').onclick=()=>chamaPage(c);
  };
 });
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
async function applicationsPage(c){
 const [members,products,apps]=await Promise.all([
 safe(db.from('members').select('id,member_number,full_name,phone').order('full_name')),
 safe(db.from('loan_products').select('id,name,minimum_amount,maximum_amount,interest_rate,duration_days,application_fee_rate').eq('active',true).order('name')),
 safe(db.from('loan_applications').select('id,member_id,product_id,requested_amount,purpose,status,applied_at,proposed_duration_days').order('applied_at',{ascending:false}).limit(100))
 ]);
 const mem=members.data||[],prod=products.data||[];
 const names=Object.fromEntries(mem.map(m=>[m.id,m.full_name]));
 c.innerHTML=`<div class="page-heading"><div><h2>Loan applications</h2><div class="sub">Record a member's application. Submission does not approve or disburse a loan.</div></div></div>
 <div class="panel"><h3>New loan application</h3><form id="applicationForm" class="grid-two">
 <label>Member<select name="member_id" required><option value="">Select member</option>${mem.map(m=>`<option value="${m.id}">${esc(m.full_name)} — ${esc(m.member_number||m.phone||'')}</option>`).join('')}</select></label>
 <label>Loan product<select name="product_id" required><option value="">Select loan type</option>${prod.map(p=>`<option value="${p.id}" data-min="${p.minimum_amount}" data-max="${p.maximum_amount}" data-days="${p.duration_days}" data-rate="${p.interest_rate}">${esc(p.name)} (${cash(p.minimum_amount)}–${cash(p.maximum_amount)})</option>`).join('')}</select></label>
 <label>Requested amount (KSh)<input name="requested_amount" type="number" min="1" step="1" required></label>
 <label>Repayment period (days)<input name="proposed_duration_days" type="number" min="1" step="1" required></label>
 <label class="full">Loan purpose<textarea name="purpose" required maxlength="1000"></textarea></label>
 <div><button class="primary" type="submit">Submit application</button><p id="applicationMsg" class="message"></p></div></form></div>
 ${table('Application register',['member','requested_amount','purpose','status','applied_at'],(apps.data||[]).map(a=>({member:names[a.member_id]||a.member_id,requested_amount:cash(a.requested_amount),purpose:a.purpose,status:a.status,applied_at:a.applied_at?new Date(a.applied_at).toLocaleString():'—'})))}
 <div class="notice">Applications remain pending for review. Only an authorised GORA administrator may approve or reject them. Product limits and rates must be checked by the administrator before approval.</div>`;
 $('applicationForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),p=prod.find(x=>x.id===f.get('product_id')),amt=Number(f.get('requested_amount')),days=Number(f.get('proposed_duration_days')),msg=$('applicationMsg');if(!p){msg.textContent='Select a loan product.';return}if(amt<Number(p.minimum_amount)||amt>Number(p.maximum_amount)){msg.textContent=`Amount must be between ${cash(p.minimum_amount)} and ${cash(p.maximum_amount)}.`;return}try{await safe(db.from('loan_applications').insert({member_id:f.get('member_id'),product_id:p.id,requested_amount:amt,proposed_interest_rate:p.interest_rate,proposed_duration_days:days,purpose:f.get('purpose').trim(),status:'pending'}));msg.textContent='Application submitted and marked pending. It has not been approved.';await applicationsPage(c)}catch(err){msg.textContent='Could not submit application: '+(err.message||err)}};
}

async function collectionsPage(c){
  const [loansRes,membersRes,paymentsRes,savingsRes,linksRes,chamasRes]=await Promise.all([
  safe(db.from('loans').select('id,member_id,status,disbursement_date,principal,total_payable').not('disbursement_date','is',null).in('status',['approved','active'])),
  safe(db.from('members').select('id,full_name,member_number,phone')),
  safe(db.from('repayments').select('id,loan_id,amount,payment_date,payment_method,receipt_number,notes').order('payment_date',{ascending:false}).limit(100)),
  safe(db.from('savings_transactions').select('id,member_id,chama_id,amount,transaction_date,payment_method,reference,receipt_number,notes').order('transaction_date',{ascending:false}).limit(100)),
  safe(db.from('chama_members').select('member_id,chama_id,status')),
  safe(db.from('chamas').select('id,name').eq('status','active'))
 ]);

 const loans=loansRes.data||[];
 const members=membersRes.data||[];
 const payments=paymentsRes.data||[];
 const savings=savingsRes.data||[];
const chamaLinks=linksRes.data||[];
const activeChamas=chamasRes.data||[];
const chamaMap=Object.fromEntries(activeChamas.map(x=>[x.id,x.name]));
 const memberMap=Object.fromEntries(members.map(m=>[m.id,m]));
 const money=n=>cash(n);

 c.innerHTML=`
 <div class="page-heading">
  <div>
   <h2>Collections Management</h2>
   <div class="sub">Record and monitor loan repayments securely.</div>
  </div>
 </div>

 <div class="stats">
  ${stat('Total collections',cash(payments.reduce((s,p)=>s+Number(p.amount||0),0)),'Recorded repayments','good')}
  ${stat('Payment records',payments.length,'Recent records','blue')}
  ${stat('Active loans',loans.length,'Eligible disbursed loans','warn')}
 </div>

 <div class="notice">
  Every payment must be linked to the correct loan and installment.
  A successful payment generates a unique GORA receipt.
 </div>

 <div class="panel">
  <h3>Record a loan repayment</h3>
  <form id="collectionForm" class="grid-two">

   <label>Borrower
    <select name="member_id" id="collectionMember" required>
     <option value="">Select borrower</option>
     ${members.map(m=>`<option value="${m.id}">${esc(m.full_name)} — ${esc(m.member_number||'')}</option>`).join('')}
    </select>
   </label>

   <label>Loan
    <select name="loan_id" id="collectionLoan" required>
     <option value="">Select loan</option>
    </select>
   </label>

   <label>Installment
    <select name="installment_id" id="collectionInstallment" required>
     <option value="">Select installment</option>
    </select>
   </label>

   <label>Outstanding installment balance
    <input id="collectionBalance" readonly placeholder="Select installment">
   </label>

   <label>Amount received (KSh)
    <input name="amount" id="collectionAmount" type="number" min="1" step="0.01" required>
   </label>

   <label>Payment method
    <select name="payment_method" required>
     <option value="">Select method</option>
     <option value="M-Pesa">M-Pesa</option>
     <option value="Cash">Cash</option>
     <option value="Bank Transfer">Bank transfer</option>
    </select>
   </label>

   <label>Payment date and time
    <input name="payment_date" type="datetime-local" required>
   </label>

   <label>Notes / M-Pesa reference
    <input name="notes" maxlength="500" placeholder="Optional reference or notes">
   </label>

   <div>
    <button class="primary" type="submit">Record payment</button>
    <p id="collectionMsg" class="message"></p>
   </div>
  </form>
 </div>
<div class="panel">
 <h3>Record a savings deposit</h3>
 <form id="savingsForm" class="grid-two">

  <label>Member name
   <select name="member_id" id="savingsMember" required>
    <option value="">Select member</option>
    ${members.map(m=>`<option value="${m.id}">${esc(m.full_name)} — ${esc(m.member_number||'')}</option>`).join('')}
   </select>
  </label>

  <label>Chama (optional)
   <select name="chama_id" id="savingsChama">
    <option value="">No chama</option>
    ${activeChamas.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('')}
   </select>
  </label>

  <label>Amount (KSh)
   <input name="amount" type="number" min="1" step="1" required>
  </label>

  <label>Payment method
   <select name="payment_method" required>
    <option value="Cash">Cash</option>
    <option value="M-Pesa">M-Pesa</option>
    <option value="Bank Transfer">Bank Transfer</option>
   </select>
  </label>

  <label>Date and time received
   <input name="transaction_date" type="datetime-local" required>
  </label>

  <label>M-Pesa reference
   <input name="reference" maxlength="100" placeholder="Optional">
  </label>

  <label class="full">Notes
   <textarea name="notes" maxlength="500"></textarea>
  </label>

  <div>
   <button class="primary" type="submit">Record savings</button>
   <p id="savingsMsg" class="message"></p>
  </div>
 </form>
</div>
 <div id="collectionReceipt"></div>

 ${table('Recent collections',
 ['receipt_number','borrower','amount','payment_method','payment_date','recorded_by'],
 payments.map(p=>({
  receipt_number:esc(p.receipt_number||'—'),
  borrower:esc(memberMap[loans.find(l=>l.id===p.loan_id)?.member_id]?.full_name||'Borrower'),
  amount:money(p.amount),
  payment_method:esc(p.payment_method||'—'),
  payment_date:p.payment_date?new Date(p.payment_date).toLocaleString('en-KE'):'—',
  recorded_by:'GORA staff'
 }))
 )}
 `;

 const form=$('collectionForm');
 const memberSelect=$('collectionMember');
 const loanSelect=$('collectionLoan');
 const installmentSelect=$('collectionInstallment');
 const balanceInput=$('collectionBalance');
 const amountInput=$('collectionAmount');
const savingsForm=$('savingsForm');
const savingsMember=$('savingsMember');
const savingsChama=$('savingsChama');
const savingsMsg=$('savingsMsg');
 savingsMember.onchange=()=>{
 const memberId=savingsMember.value;
 const links=chamaLinks.filter(x=>x.member_id===memberId&&x.status==='active');
 const chamaIds=[...new Set(links.map(x=>x.chama_id))];
 savingsChama.innerHTML='<option value="">Select chama (optional)</option>'+
  chamaIds.map(id=>`<option value="${id}">${esc(chamaMap[id]||'Chama')}</option>`).join('');
};
 const savingsDateInput=savingsForm.elements.transaction_date;
const localNow=new Date();
savingsDateInput.value=new Date(localNow.getTime()-localNow.getTimezoneOffset()*60000).toISOString().slice(0,16);
 form.elements.payment_date.value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);

 memberSelect.onchange=()=>{
  const memberId=memberSelect.value;
  const memberLoans=loans.filter(l=>l.member_id===memberId);

  loanSelect.innerHTML='<option value="">Select loan</option>'+
   memberLoans.map(l=>`<option value="${l.id}">${esc(l.status)} — ${money(l.principal)}</option>`).join('');

  installmentSelect.innerHTML='<option value="">Select installment</option>';
  balanceInput.value='';
  amountInput.value='';
 };

 loanSelect.onchange=async()=>{
  installmentSelect.innerHTML='<option value="">Loading installments...</option>';
  balanceInput.value='';
  amountInput.value='';

  try{
   const result=await safe(
    db.from('installment_balances')
    .select('installment_id,installment_number,due_date,amount_due,amount_paid,balance,payment_status')
    .eq('loan_id',loanSelect.value)
    .gt('balance',0)
    .order('installment_number')
   );

   const rows=result.data||[];

   installmentSelect.innerHTML='<option value="">Select installment</option>'+
    rows.map(i=>`<option value="${i.installment_id}" data-balance="${i.balance}">Installment ${i.installment_number} — Due ${i.due_date} — Balance ${money(i.balance)}</option>`).join('');

   if(!rows.length){
    installmentSelect.innerHTML='<option value="">No unpaid installments</option>';
   }
  }catch(err){
   installmentSelect.innerHTML='<option value="">Could not load installments</option>';
   $('collectionMsg').textContent=err.message||String(err);
  }
 };

 installmentSelect.onchange=()=>{
  const option=installmentSelect.selectedOptions[0];
  const balance=Number(option?.dataset.balance||0);
  balanceInput.value=money(balance);
  amountInput.max=balance||'';
  amountInput.value='';
 };

 form.onsubmit=async e=>{
  e.preventDefault();

  const f=new FormData(form);
  const amount=Number(f.get('amount'));
  const balance=Number(installmentSelect.selectedOptions[0]?.dataset.balance||0);

  if(!f.get('loan_id')||!f.get('installment_id')){
   $('collectionMsg').textContent='Select a loan and installment.';
   return;
  }

  if(amount<=0||amount>balance){
   $('collectionMsg').textContent='Enter an amount within the outstanding installment balance.';
   return;
  }

  if(!confirm('Confirm that GORA has received KSh '+amount.toLocaleString('en-KE')+' from this borrower?')){
   return;
  }

  const msg=$('collectionMsg');
  msg.textContent='Recording payment...';

  try{
   const result=await safe(db.rpc('gora_record_repayment',{
    p_loan_id:f.get('loan_id'),
    p_installment_id:f.get('installment_id'),
    p_amount:amount,
    p_payment_method:f.get('payment_method'),
    p_payment_date:new Date(f.get('payment_date')).toISOString(),
    p_notes:f.get('notes').trim()||null
   }));

   const receipt=Array.isArray(result.data)?result.data[0]:result.data;

   if(!receipt?.receipt_number){
    throw new Error('Payment response did not contain a receipt number. Contact the administrator before retrying.');
   }

   $('collectionReceipt').innerHTML=`
    <div class="panel">
     <h3>GORA payment receipt</h3>
     <h2>${esc(receipt.receipt_number)}</h2>
     <div class="metric-line"><span>Borrower</span><b>${esc(memberMap[f.get('member_id')]?.full_name||'')}</b></div>
     <div class="metric-line"><span>Amount received</span><b>${money(amount)}</b></div>
     <div class="metric-line"><span>Payment method</span><b>${esc(f.get('payment_method'))}</b></div>
     <div class="metric-line"><span>Remaining installment balance</span><b>${money(receipt.remaining_balance)}</b></div>
     <p>Thank you for paying GORA Savings & Credit Group.</p>
     <button class="secondary" onclick="window.print()">Print receipt</button>
    </div>`;

   alert('Payment recorded successfully. Receipt: '+receipt.receipt_number);
const savedReceipt=$('collectionReceipt').innerHTML;
await collectionsPage(c);
$('collectionReceipt').innerHTML=savedReceipt;

  }catch(err){
   msg.textContent='Payment not confirmed: '+(err.message||String(err));
  }
 };savingsForm.onsubmit=async e=>{
 e.preventDefault();
 const f=new FormData(savingsForm);
 const memberId=f.get('member_id');
 const amount=Number(f.get('amount'));
 const method=f.get('payment_method');
 const msg=savingsMsg;

 if(!memberId||!Number.isFinite(amount)||amount<=0){
  msg.textContent='Select a member and enter a valid amount.';
  return;
 }

 if(method==='M-Pesa'&&!String(f.get('reference')||'').trim()){
  msg.textContent='Enter the M-Pesa reference.';
  return;
 }

 if(!confirm('Confirm receipt of KSh '+amount.toLocaleString('en-KE')+' as member savings?'))return;

 msg.textContent='Recording savings...';

 try{
  const {data:{user},error:authError}=await db.auth.getUser();
  if(authError||!user)throw new Error('Your staff session has expired. Sign in again.');

  const payload={
   member_id:memberId,
   chama_id:f.get('chama_id')||null,
   transaction_type:'deposit',
   amount,
   transaction_date:new Date(f.get('transaction_date')).toISOString(),
   payment_method:method,
   reference:String(f.get('reference')||'').trim()||null,
   notes:String(f.get('notes')||'').trim()||null,
   recorded_by:user.id
  };

  const result=await safe(
   db.from('savings_transactions').insert(payload)
    .select('receipt_number,amount,transaction_date,payment_method')
    .single()
  );

  const receipt=result.data;
  if(!receipt?.receipt_number)throw new Error('Savings receipt was not returned.');

  msg.textContent='Savings recorded successfully. Receipt: '+receipt.receipt_number;

  const savedReceipt=$('collectionReceipt').innerHTML;
  await collectionsPage(c);
  $('collectionReceipt').innerHTML=`
   <div class="panel">
    <h3>GORA Savings Receipt</h3>
    <h2>${esc(receipt.receipt_number)}</h2>
    <p>Member: ${esc(memberMap[memberId]?.full_name||'Member')}</p>
    <p>Amount received: <b>${cash(receipt.amount)}</b></p>
    <p>Payment method: ${esc(receipt.payment_method)}</p>
    <p>Thank you for saving with GORA Savings & Credit Group.</p>
    <button class="secondary" onclick="window.print()">Print receipt</button>
   </div>`;

  savingsMsg.textContent='Savings recorded successfully. Receipt: '+receipt.receipt_number;
 }catch(err){
  msg.textContent='Savings not confirmed: '+(err.message||String(err));
 }
};
}

async function collectionPlannerPage(c){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const d=new Date(today+'T00:00:00');
 d.setDate(d.getDate()+1);
 const tomorrow=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);

 try{
  const [ir,lr,mr,cr,tr]=await Promise.all([
   safe(db.from('installment_balances').select('installment_id,loan_id,installment_number,due_date,balance').gt('balance',0).lte('due_date',tomorrow).order('due_date')),
   safe(db.from('loans').select('id,member_id,principal').not('disbursement_date','is',null)),
   safe(db.from('members').select('id,full_name,phone,member_number')),
   safe(db.from('chamas').select('id,name').eq('status','active')),
   safe(db.from('collection_tasks').select('*').order('due_date').limit(300))
  ]);

  const loans=lr.data||[];
  const members=mr.data||[];
  const chamas=cr.data||[];
  const loanMap=Object.fromEntries(loans.map(x=>[x.id,x]));
  const memberMap=Object.fromEntries(members.map(x=>[x.id,x]));
  const chamaMap=Object.fromEntries(chamas.map(x=>[x.id,x]));
  const valid=(ir.data||[]).filter(x=>loanMap[x.loan_id]);
  const todayRows=valid.filter(x=>x.due_date===today);
  const tomorrowRows=valid.filter(x=>x.due_date===tomorrow);
  const overdue=valid.filter(x=>x.due_date<today);
  const total=rows=>rows.reduce((a,x)=>a+Number(x.balance||0),0);
  const tasks=tr.data||[];
  const admin=profile?.role==='admin';
  let officers=[];

  if(admin){
   const staff=await safe(db.from('profiles').select('id,full_name').eq('active',true).eq('role','loan_officer').order('full_name'));
   officers=staff.data||[];
  }

  const target=t=>t.member_id?(memberMap[t.member_id]?.full_name||'Member'):(chamaMap[t.chama_id]?.name||'Chama');

  c.innerHTML=`
  <div class="page-heading"><div><h2>Collections Planner</h2><div class="sub">Kenya date: ${today}</div></div></div>
  <div class="stats">
   ${stat('Due today',cash(total(todayRows)),todayRows.length+' installments','warn')}
   ${stat('Due tomorrow',cash(total(tomorrowRows)),tomorrowRows.length+' installments','blue')}
   ${stat('Arrears',cash(total(overdue)),overdue.length+' overdue installments','red')}
   ${stat('Assigned tasks',tasks.length,'Collection and visit tasks','good')}
  </div>
  ${table('Due today',['Borrower','Phone','Due date','Balance'],todayRows.map(x=>({Borrower:esc(memberMap[loanMap[x.loan_id].member_id]?.full_name||'Unknown'),Phone:esc(memberMap[loanMap[x.loan_id].member_id]?.phone||'—'),'Due date':x.due_date,Balance:cash(x.balance)})))}
  ${table('Due tomorrow',['Borrower','Phone','Due date','Balance'],tomorrowRows.map(x=>({Borrower:esc(memberMap[loanMap[x.loan_id].member_id]?.full_name||'Unknown'),Phone:esc(memberMap[loanMap[x.loan_id].member_id]?.phone||'—'),'Due date':x.due_date,Balance:cash(x.balance)})))}
  ${table('Overdue installments',['Borrower','Phone','Due date','Installment','Balance'],overdue.map(x=>({Borrower:esc(memberMap[loanMap[x.loan_id].member_id]?.full_name||'Unknown'),Phone:esc(memberMap[loanMap[x.loan_id].member_id]?.phone||'—'),'Due date':x.due_date,Installment:x.installment_number,Balance:cash(x.balance)})))}

  ${admin?`
  <div class="panel"><h3>Assign a task to an officer</h3>
  <form id="taskAssignForm" class="grid-two">
   <label>Task type<select name="task_type">
    <option value="installment_collection">Installment collection</option>
    <option value="arrears_follow_up">Arrears follow-up</option>
    <option value="chama_visit">Chama visit</option>
   </select></label>
   <label>Officer<select name="assigned_to" required>
    <option value="">Choose officer</option>
    ${officers.map(o=>`<option value="${o.id}">${esc(o.full_name)}</option>`).join('')}
   </select></label>
   <label>Member<select name="member_id">
    <option value="">Choose member</option>
    ${members.map(m=>`<option value="${m.id}">${esc(m.full_name)}</option>`).join('')}
   </select></label>
   <label>Chama<select name="chama_id">
    <option value="">Choose chama</option>
    ${chamas.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('')}
   </select></label>
   <label>Due date<input type="date" name="due_date" value="${today}" required></label>
   <label>Expected amount<input type="number" name="expected_amount" min="0" value="0" required></label>
   <label class="full">Instructions / location<input name="outcome_notes" maxlength="500"></label>
   <div><button class="primary" type="submit">Assign task</button><p id="taskAssignMsg" class="message"></p></div>
  </form></div>`:''}

  <div class="panel"><h3>${admin?'Officer task register':'My assigned tasks'}</h3>
  ${tasks.length?tasks.map(t=>`
   <div class="panel">
    <b>${esc(t.task_type.replaceAll('_',' '))} — ${esc(target(t))}</b>
    <p>Due: ${esc(t.due_date)} · Status: ${esc(t.status)}</p>
    <p>Expected: ${cash(t.expected_amount)} · Collected: ${cash(t.collected_amount)}</p>
    <form class="taskUpdateForm grid-two" data-id="${t.id}">
     <label>Status<select name="status">
      ${['pending','in_progress','completed','partially_collected','not_visited'].map(v=>`<option value="${v}" ${t.status===v?'selected':''}>${v.replaceAll('_',' ')}</option>`).join('')}
     </select></label>
     <label>Amount collected<input name="collected_amount" type="number" min="0" step="0.01" value="${Number(t.collected_amount||0)}"></label>
     <label class="full">Outcome notes<textarea name="outcome_notes">${esc(t.outcome_notes||'')}</textarea></label>
     <label>Next follow-up date<input name="next_follow_up_date" type="date" value="${t.next_follow_up_date||''}"></label>
     <div><button class="secondary" type="submit">Save outcome</button><span class="message taskMsg"></span></div>
    </form>
   </div>`).join(''):'<p class="empty">No tasks assigned yet.</p>'}
  </div>
  <div class="notice">Task outcomes do not mark loans as paid. Record actual money received through Collections & Repayments to generate an official receipt.</div>`;

  const assign=document.getElementById('taskAssignForm');
  if(assign)assign.onsubmit=async e=>{
   e.preventDefault();
   const f=new FormData(assign),type=f.get('task_type'),msg=document.getElementById('taskAssignMsg');
   const memberId=f.get('member_id'),chamaId=f.get('chama_id');
   if(type==='chama_visit'&&!chamaId){msg.textContent='Choose a chama.';return}
   if(type!=='chama_visit'&&!memberId){msg.textContent='Choose a member.';return}
   try{
    const {data:{user}}=await db.auth.getUser();
    if(!user)throw new Error('Please sign in again.');
    await safe(db.from('collection_tasks').insert({
     task_type:type,assigned_to:f.get('assigned_to'),
     member_id:type==='chama_visit'?null:memberId,
     chama_id:type==='chama_visit'?chamaId:null,
     due_date:f.get('due_date'),
     expected_amount:Number(f.get('expected_amount')),
     outcome_notes:f.get('outcome_notes').trim()||null,
     created_by:user.id
    }));
    await collectionPlannerPage(c);
   }catch(err){msg.textContent='Could not assign task: '+(err.message||err)}
  };

  document.querySelectorAll('.taskUpdateForm').forEach(form=>{
   form.onsubmit=async e=>{
    e.preventDefault();
    const f=new FormData(form),msg=form.querySelector('.taskMsg');
    try{
     await safe(db.from('collection_tasks').update({
      status:f.get('status'),
      collected_amount:Number(f.get('collected_amount')||0),
      outcome_notes:f.get('outcome_notes').trim()||null,
      next_follow_up_date:f.get('next_follow_up_date')||null,
      updated_at:new Date().toISOString()
     }).eq('id',form.dataset.id));
     msg.textContent='Saved.';
    }catch(err){msg.textContent='Not saved: '+(err.message||err)}
   };
  });
 }catch(err){
  c.innerHTML='<div class="panel"><h3>Collections Planner could not load</h3><p>'+esc(err.message||err)+'</p></div>';
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
async function load(page){$('title').textContent=page;const c=$('content');c.innerHTML='<div class="panel">Loading records…</div>';try{if(page==='Dashboard'){await dashboard(c);return}if(page==='Chamas'){await chamaPage(c);return}if(page==='Members'){await (window.membersPage||membersPage)(c);return};if(page==='Applications'){await applicationsPage(c);return}if(page==='Performance'){await performancePage(c);return}if(page==='Repayments'){await collectionsPage(c);return}if(page==='Collection Planner'){await collectionPlannerPage(c);return}if(page==='Settings'){c.innerHTML='<div class="panel"><h3>System settings</h3><p>Loan product rates and fees must be administered by the GORA admin only. Configuration controls will be enabled after permission policies are verified.</p></div>';return}
const [tbl,cols]=pages[page]||['audit_logs',['action','table_name','record_id','created_at']];let q=db.from(tbl).select('*').limit(100);if(page==='Arrears')q=q.lt('due_date',new Date().toISOString().slice(0,10)).gt('balance',0);const res=await safe(q);let rows=res.data||[];if(page==='Expenses')rows=rows.filter(x=>x.entry_type==='expense');c.innerHTML=`<div class="page-heading"><div><h2>${page}</h2><div class="sub">Showing up to 100 records from the connected GORA database.</div></div></div><div class="notice">This section is currently connected for viewing. Data-entry, approval and payment actions will be enabled only after their database security and audit controls are completed.</div>${table(page,cols,rows)}`;}
catch(e){c.innerHTML=`<div class="panel"><h3>Could not load ${page}</h3><p>${String(e.message||e)}</p><p>Database access policies or the required view may not yet be configured. No data has been changed.</p></div>`}}
(function(){const u=localStorage.getItem('gora_url')||'',k=localStorage.getItem('gora_key')||'';$('url').value=u;$('key').value=k;connect();})();


/* GORA LOAN WORKFLOW */
const goraOldLoad = load;

async function goraLoanApplications(c) {
  try {
    const [apps, members, products] = await Promise.all([
      safe(db.from('loan_applications').select('*').order('applied_at', {ascending:false})),
      safe(db.from('members').select('id,full_name')),
      safe(db.from('loan_products').select('id,name,minimum_amount,maximum_amount,interest_rate').eq('active',true))
    ]);

    const names = Object.fromEntries(members.data.map(x => [x.id,x.full_name]));
    const productMap = Object.fromEntries(products.data.map(x => [x.id,x]));

    c.innerHTML = `<h2>Loan Applications</h2>
      <div class="notice">Loan officers recommend. The administrator makes the final approval.</div>
      ${(apps.data || []).map(a => {
        const p = productMap[a.product_id] || {};
        return `<div class="panel">
          <h3>${esc(names[a.member_id] || 'Member')} — ${esc(p.name || 'Loan')}</h3>
          <p>Requested: ${cash(a.requested_amount)}</p>
          <p>Product rate: ${Number(p.interest_rate || 0)}% flat</p>
          <p>Status: ${esc(a.status)} | Recommendation: ${esc(a.recommendation_status || 'awaiting_review')}</p>
          ${['admin','loan_officer'].includes(profile.role) && a.status === 'pending' ? `
            <form class="goraRecommend" data-id="${a.id}">
              <label>Recommended amount
                <input name="amount" type="number" min="${p.minimum_amount || 1}" max="${p.maximum_amount || 0}" value="${a.recommended_amount || a.requested_amount}" required>
              </label>
              <label>Notes<input name="notes"></label>
              <button class="primary">Submit recommendation</button>
              <p class="message"></p>
            </form>` : ''}
          ${profile.role === 'admin' && a.status === 'pending' && a.recommendation_status === 'recommended' ? `
            <form class="goraApprove" data-id="${a.id}">
              <label>Approved amount
                <input name="amount" type="number" min="${p.minimum_amount || 1}" max="${p.maximum_amount || 0}" value="${a.recommended_amount}" required>
              </label>
              <label>Decision notes<input name="notes"></label>
              <button class="primary">Approve loan</button>
              <p class="message"></p>
            </form>` : ''}
        </div>`;
      }).join('') || '<p>No applications found.</p>'}`;

    c.querySelectorAll('.goraRecommend').forEach(f => f.onsubmit = async e => {
      e.preventDefault();
      const d = new FormData(f);
      const msg = f.querySelector('.message');
      try {
        const r = await db.rpc('gora_recommend_loan', {
          p_application_id:f.dataset.id,
          p_recommended_amount:Number(d.get('amount')),
          p_recommendation_notes:d.get('notes') || null,
          p_recommend:true
        });
        if (r.error) throw r.error;
        await goraLoanApplications(c);
      } catch (err) { msg.textContent = err.message; }
    });

    c.querySelectorAll('.goraApprove').forEach(f => f.onsubmit = async e => {
      e.preventDefault();
      const d = new FormData(f);
      const msg = f.querySelector('.message');
      if (!confirm('Approve this loan? It will not yet be disbursed.')) return;
      try {
        const r = await db.rpc('gora_admin_approve_loan', {
          p_application_id:f.dataset.id,
          p_approved_amount:Number(d.get('amount')),
          p_decision_notes:d.get('notes') || null
        });
        if (r.error) throw r.error;
        alert('Loan approved. Awaiting disbursement.');
        await goraLoanApplications(c);
      } catch (err) { msg.textContent = err.message; }
    });
  } catch (err) {
    c.innerHTML = `<div class="panel">Could not load applications: ${esc(err.message)}</div>`;
  }
}

async function goraLoans(c) {
  try {
    const [loans, members] = await Promise.all([
      safe(db.from('loans').select('*').order('created_at',{ascending:false})),
      safe(db.from('members').select('id,full_name'))
    ]);
    const names = Object.fromEntries(members.data.map(x => [x.id,x.full_name]));

    c.innerHTML = `<h2>Loans & Disbursement</h2>
      <div class="notice">First repayment is automatically set seven days after disbursement. Confirm only after the money has actually been transferred.</div>
      ${(loans.data || []).map(l => `<div class="panel">
        <h3>${esc(names[l.member_id] || 'Member')}</h3>
        <p>Principal: ${cash(l.principal)}</p>
        <p>Total payable: ${cash(l.total_payable)}</p>
        <p>Status: ${esc(l.status)}</p>
        <p>Disbursement: ${esc(l.disbursement_date || 'Not yet disbursed')}</p>
        <p>First repayment: ${esc(l.first_due_date || 'Not set')}</p>
        ${profile.role === 'admin' && l.status === 'approved' && !l.disbursement_date ? `
          <form class="goraDisburse" data-id="${l.id}">
            <label>Actual disbursement date
              <input name="date" type="date" value="${new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Nairobi'})}" required>
            </label>
            <label>Payment channel
              <select name="provider">
                <option value="manual">Verified manual transfer</option>
                <option value="mpesa">M-Pesa</option>
                <option value="bank">Bank</option>
                <option value="cash">Cash</option>
              </select>
            </label>
            <label>Transfer reference<input name="reference" required></label>
            <label>Notes<input name="notes"></label>
            <button class="primary">Confirm actual disbursement</button>
            <p class="message"></p>
          </form>` : ''}
      </div>`).join('') || '<p>No loans found.</p>'}`;

    c.querySelectorAll('.goraDisburse').forEach(f => f.onsubmit = async e => {
      e.preventDefault();
      const d = new FormData(f);
      const msg = f.querySelector('.message');
      if (!confirm('Have you verified that the money was actually transferred?')) return;
      try {
        const r = await db.rpc('gora_confirm_loan_disbursement', {
          p_loan_id:f.dataset.id,
          p_disbursement_date:d.get('date'),
          p_payment_provider:d.get('provider'),
          p_provider_reference:d.get('reference'),
          p_notes:d.get('notes') || null
        });
        if (r.error) throw r.error;
        alert('Disbursement confirmed and installments generated.');
        await goraLoans(c);
      } catch (err) { msg.textContent = err.message; }
    });
  } catch (err) {
    c.innerHTML = `<div class="panel">Could not load loans: ${esc(err.message)}</div>`;
  }
}

/* GORA ONLINE LOAN SIGNING */
async function goraSigningManagerPage(c) {
  try {
    const [apps, members, products, chamas, guarantors, signatures] =
      await Promise.all([
        safe(db.from('loan_applications').select('*')
          .order('applied_at', {ascending:false}).limit(100)),
                safe(db.from('members')
          .select('id,member_number,full_name,phone,national_id,status')
          .order('full_name')),
        safe(db.from('loan_products')
          .select('id,name,minimum_amount,maximum_amount,interest_rate,duration_days,application_fee_rate')
          .eq('active',true).order('name')),
        safe(db.from('chamas').select('id,name')
          .eq('status','active').order('name')),
        safe(db.from('loan_guarantors').select('*')),
        safe(db.from('loan_signature_events').select('*'))
      ]);

    const memberMap = Object.fromEntries(
      members.data.map(m => [m.id,m])
    );
    const productMap = Object.fromEntries(
      products.data.map(p => [p.id,p])
    );

    c.innerHTML = `
      <div class="page-heading">
        <div>
          <h2>GORA Loan Applications</h2>
          <div class="sub">
  Manual applications, online applications and loan signing
</div>
        </div>
      </div>
<div class="notice">
  Every active chama member except the borrower
  must be included as a proposed guarantor.
  Each guarantor must agree to their own guarantee amount.
  Verify all guarantors before issuing signing links.
</div>

      ${apps.data.map(a => {
        const borrower = memberMap[a.member_id] || {};
        const product = productMap[a.product_id] || {};
        const gs = guarantors.data.filter(
          g => g.application_id === a.id
        );
        const signed = signatures.data.filter(
          s => s.application_id === a.id
        );

        return `
          <div class="panel" style="margin-bottom:16px">
            <h3>${esc(borrower.full_name || 'Borrower')}</h3>
            <p>Loan: ${esc(product.name || 'Loan')}</p>
            <p>Amount: ${cash(a.approved_amount || a.requested_amount)}</p>
            <p>Status: ${esc(a.status)}</p>
            <p>Guarantors: ${gs.length}</p>
            <p>Signatures received: ${signed.length}</p>

            <label>Select chama
              <select class="signChama" data-id="${a.id}">
                <option value="">Choose chama</option>
                ${chamas.data.map(g =>
                  `<option value="${g.id}"
                    ${a.chama_id === g.id ? 'selected' : ''}>
                    ${esc(g.name)}
                  </option>`
                ).join('')}
              </select>
            </label>

            <button class="secondary prepareSigners"
              data-id="${a.id}">
              Load chama members
            </button>

            <div id="signReview-${a.id}"></div>

            <button class="primary issueSignLinks"
              data-id="${a.id}" ${gs.length ? '' : 'disabled'}>
              Issue signing links
            </button>

            <div id="signLinks-${a.id}"></div>
          </div>
        `;
      }).join('') || '<p>No applications found.</p>'}
    `;

    c.querySelectorAll('.prepareSigners').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const chamaId = c.querySelector(
          `.signChama[data-id="${id}"]`
        ).value;

        if (!chamaId) {
          alert('Please select a chama first.');
          return;
        }

        btn.disabled = true;

        try {
          const app = apps.data.find(x => x.id === id);

          const [roster, existing] = await Promise.all([
            safe(db.from('chama_members')
              .select('member_id')
              .eq('chama_id', chamaId)
              .eq('status', 'active')),
            safe(db.from('loan_guarantors')
              .select('guarantor_member_id')
              .eq('application_id', id))
          ]);

          const existingIds = new Set(
            existing.data.map(x => x.guarantor_member_id)
          );

          const eligibleIds = [
            ...new Set(roster.data.map(x => x.member_id))
          ].filter(x => x && x !== app.member_id);

          const eligible = eligibleIds
            .map(x => memberMap[x])
            .filter(m => m && m.status === 'active' && m.phone);

          if (!eligible.length) {
            throw new Error(
              'No eligible active chama members with phone numbers found.'
            );
          }

          const newRows = eligible
            .filter(m => !existingIds.has(m.id))
            .map(m => ({
              application_id: id,
              guarantor_member_id: m.id,
              full_name: m.full_name,
              phone: m.phone,
              national_id: m.national_id || null,
              relationship: 'chama member',
              guarantee_amount: 0,
              consent_status: 'pending'
            }));

          if (newRows.length) {
            await safe(db.from('loan_guarantors').insert(newRows));
          }

          await safe(db.from('loan_applications')
            .update({chama_id: chamaId})
            .eq('id', id));

          const result = await safe(db.from('loan_guarantors')
            .select('full_name,phone,guarantee_amount,consent_status')
            .eq('application_id', id));

          const amount = Number(
            app.approved_amount || app.requested_amount
          );

          const share = amount / result.data.length;

          const review = document.getElementById(
            'signReview-' + id
          );

          review.innerHTML = `
            <h3>Review guarantors</h3>
            <p>Number of guarantors: ${result.data.length}</p>
            <p>Equal share per guarantor: ${cash(share)}</p>
            ${result.data.map(g => `
              <div class="metric-line">
                <span>${esc(g.full_name)} · ${esc(g.phone)}</span>
                <b>${cash(share)}</b>
              </div>
            `).join('')}
          `;
c.querySelector('.issueSignLinks[data-id="' + id + '"]').disabled = false;
          alert('Guarantors loaded. Review the names and shares.');

        } catch (err) {
          alert('Could not load guarantors: ' + err.message);
        } finally {
          btn.disabled = false;
        }
      };
    });

    c.querySelectorAll('.issueSignLinks').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;

        if (!confirm(
          'Issue signing links to the borrower and all listed guarantors?'
        )) return;

        btn.disabled = true;
        const box = document.getElementById('signLinks-' + id);

        try {
          const {data: {session}} = await db.auth.getSession();

          if (!session) {
            throw new Error('Please sign in again.');
          }

          const {data, error} = await db.functions.invoke(
            'gora-loan-signing',
            {
              body: {
                action: 'create_links',
                application_id: id
              },
              headers: {
                Authorization: 'Bearer ' + session.access_token
              }
            }
          );

          if (error) throw error;
          if (!data.success) {
            throw new Error(data.error || 'Could not issue links.');
          }

          box.innerHTML = `
            <h3>Signing links issued</h3>
            <p>Expiry: ${esc(data.expires_at)}</p>

            ${data.signers.map(s => `
              <div class="panel">
                <p>${esc(s.signer_type)}: ${esc(s.name)}</p>
                <p>${esc(s.phone)}</p>
                <button class="secondary copySignLink"
                  data-url="${esc(s.url)}">
                  Copy signing link
                </button>
              </div>
            `).join('')}

            <p class="hint">
              Members without smartphones can use a GORA-assisted
              device. Each person must personally review and sign.
            </p>
          `;

          box.querySelectorAll('.copySignLink').forEach(copy => {
            copy.onclick = async () => {
              try {
                await navigator.clipboard.writeText(copy.dataset.url);
                copy.textContent = 'Copied!';
              } catch (err) {
                prompt('Copy this signing link:', copy.dataset.url);
              }
            };
          });

          alert('Signing links created successfully.');

        } catch (err) {
          box.textContent = 'Error: ' + err.message;
        } finally {
          btn.disabled = false;
        }
      };
    });

  } catch (err) {
    c.innerHTML = `
      <div class="panel">
        <h3>Signing page error</h3>
        <p>${esc(err.message)}</p>
      </div>
    `;
  }
}

async function goraOnlineSigningPage(c) {
  try {
    const [members, products, chamas] = await Promise.all([
      safe(db.from('members').select('id,member_number,full_name,phone,national_id,status').order('full_name')),
      safe(db.from('loan_products').select('*').eq('active', true).order('name')),
      safe(db.from('chamas').select('id,name').eq('status', 'active').order('name'))
    ]);

    const ms = members.data || [];
    const ps = products.data || [];
    const cs = chamas.data || [];

    c.innerHTML = `
      <div class="page-heading">
        <div>
          <h2>GORA Loan Application</h2>
          <div class="sub">Complete borrower registration, assessment and guarantor details.</div>
        </div>
        <button class="secondary" id="openSigningManager">Signing Manager</button>
      </div>

      <div class="notice">
        Applications remain pending until documents are reviewed, guarantors are verified,
        and the authorised officer completes the approval process.
      </div>

      <form id="goraNewApplication">
        <div class="panel">
          <h3>1. Borrower details</h3>
          <label>GORA member
            <select name="member_id" required>
              <option value="">Select borrower</option>
              ${ms.filter(m=>m.status==='active').map(m=>`
                <option value="${m.id}">${esc(m.member_number)} - ${esc(m.full_name)} (${esc(m.phone)})</option>
              `).join('')}
            </select>
          </label>
          <label>Chama (if applicable)
            <select name="chama_id">
              <option value="">Individual / No chama</option>
              ${cs.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('')}
            </select>
          </label>
<button type="button" class="secondary" id="addAllChamaMembers">
  Add all chama members as guarantors
</button>

          <label>Preferred disbursement method
            <select name="disbursement">
              <option value="mpesa">M-Pesa</option>
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
            </select>
          </label>
          <p class="hint">The borrower must be a registered GORA member.</p>
        </div>

        <div class="panel">
          <h3>2. Loan details</h3>
          <label>Loan product
            <select name="product_id" id="goraProduct" required>
              <option value="">Select loan product</option>
              ${ps.map(p=>`
                <option value="${p.id}" data-min="${p.minimum_amount}"
                  data-max="${p.maximum_amount}" data-rate="${p.interest_rate}"
                  data-days="${p.duration_days}" data-fee="${p.application_fee_rate}">
                  ${esc(p.name)} (${cash(p.minimum_amount)} - ${cash(p.maximum_amount)})
                </option>
              `).join('')}
            </select>
          </label>
          <label>Requested amount (KSh)
            <input name="amount" type="number" min="1" step="1" required>
          </label>
          <label>Interest rate (%)
            <input name="rate" type="number" min="0" step="0.01" required>
          </label>
          <label>Duration (days)
            <input name="duration" type="number" min="1" required>
          </label>
          <label>Repayment frequency
            <select name="frequency" required>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label>Application fee (KSh)
            <input name="fee" type="number" min="0" step="0.01" value="0">
          </label>
          <label>Loan purpose
            <textarea name="purpose" required rows="3"></textarea>
          </label>
        </div>

        <div class="panel">
          <h3>3. Employment and business information</h3>
          <label>Employment status
            <select name="employment">
              <option value="self_employed">Self-employed</option>
              <option value="employed">Employed</option>
              <option value="business_owner">Business owner</option>
              <option value="casual">Casual worker</option>
              <option value="unemployed">Unemployed</option>
            </select>
          </label>
          <label>Occupation
            <input name="occupation">
          </label>
          <label>Employer name
            <input name="employer">
          </label>
          <label>Business name
            <input name="business_name">
          </label>
          <label>Business type
            <input name="business_type">
          </label>
          <label>Business location
            <input name="business_location">
          </label>
          <label>Business age (months)
            <input name="business_age" type="number" min="0">
          </label>
          <label>Monthly salary income (KSh)
            <input name="salary" type="number" min="0" value="0">
          </label>
          <label>Monthly business income (KSh)
            <input name="business_income" type="number" min="0" value="0">
          </label>
          <label>Other income description
            <input name="other_income_description">
          </label>
          <label>Other monthly income (KSh)
            <input name="other_income" type="number" min="0" value="0">
          </label>
        </div>

        <div class="panel">
          <h3>4. Financial assessment</h3>
          <label>Monthly income (KSh)
            <input name="monthly_income" type="number" min="0" required>
          </label>
          <label>Monthly expenses (KSh)
            <input name="expenses" type="number" min="0" required>
          </label>
          <label>Existing loan balance (KSh)
            <input name="existing_balance" type="number" min="0" value="0">
          </label>
          <label>Existing monthly loan repayments (KSh)
            <input name="existing_repayments" type="number" min="0" value="0">
          </label>
          <label>GORA savings balance (KSh)
            <input name="savings" type="number" min="0" value="0">
          </label>
          <label>Proposed instalment (KSh)
            <input name="installment" type="number" min="0" required>
          </label>
          <label>Repayment capacity
            <select name="capacity">
              <option value="pending">Pending assessment</option>
              <option value="adequate">Adequate</option>
              <option value="inadequate">Inadequate</option>
              <option value="needs_review">Needs further review</option>
            </select>
          </label>
          <label>Officer assessment notes
            <textarea name="assessment_notes" rows="3"></textarea>
          </label>
        </div>

        <div class="panel">
          <h3>5. Applicant documents</h3>
          <label>Applicant photo
            <input type="file" name="applicant_photo" accept="image/*" required>
          </label>
          <label>National ID - front
            <input type="file" name="applicant_id_front" accept="image/*,.pdf" required>
          </label>
          <label>National ID - back
            <input type="file" name="applicant_id_back" accept="image/*,.pdf" required>
          </label>
          <label>Business / income evidence (optional)
            <input type="file" name="income_evidence" accept="image/*,.pdf">
          </label>
        </div>

        <div class="panel">
          <h3>6. Guarantors</h3>
          <div class="notice">
            Both GORA members and outsiders are accepted.
            Every guarantor must be at least 18 years old and must personally consent and sign.
            Identity and phone verification must be completed before signing links are issued.
          </div>
          <div id="goraGuarantorRows"></div>
          <button type="button" class="secondary" id="addGoraGuarantor">＋ Add another guarantor</button>
        </div>

        <div class="panel">
          <h3>7. Optional collateral</h3>
          <label>Collateral type
            <select name="collateral_type">
              <option value="">No collateral</option>
              <option value="household_item">Household item</option>
              <option value="motor_vehicle">Motor vehicle</option>
              <option value="land">Land</option>
              <option value="business_asset">Business asset</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>Description
            <textarea name="collateral_description" rows="2"></textarea>
          </label>
          <label>Estimated value (KSh)
            <input name="collateral_value" type="number" min="0">
          </label>
          <label>Collateral owner
            <input name="collateral_owner">
          </label>
          <label>Ownership document notes
            <textarea name="ownership_notes" rows="2"></textarea>
          </label>
        </div>

        <div class="panel">
          <label>
            <input type="checkbox" name="declaration" required>
            I confirm that the information has been provided by the applicant and
            that the applicant has agreed to this application.
          </label>
          <button class="primary" type="submit">Save loan application</button>
          <p id="goraApplicationMessage" class="hint"></p>
        </div>
      </form>
    `;

    c.querySelector('#openSigningManager').onclick = () =>
      goraSigningManagerPage(c);

    const form = c.querySelector('#goraNewApplication');
    const rows = c.querySelector('#goraGuarantorRows');

    
function addGuarantor() {
  const n = rows.children.length;
  const div = document.createElement('div');
  div.className = 'panel goraGuarantor';

  div.innerHTML = `
    <h4>Guarantor ${n + 1}</h4>

    <label>Guarantor type
      <select name="gtype">
        <option value="member">GORA member</option>
        <option value="outsider">Outsider</option>
      </select>
    </label>

    <div class="memberPicker">
      <label>Select registered GORA member
        <select name="gmember">
          <option value="">Choose member</option>
          ${ms.filter(m => m.status === 'active').map(m => `
            <option value="${m.id}"
              data-name="${esc(m.full_name)}"
              data-phone="${esc(m.phone)}"
              data-id="${esc(m.national_id || '')}">
              ${esc(m.member_number)} - ${esc(m.full_name)}
            </option>
          `).join('')}
        </select>
      </label>
    </div>

    <label>Full name
      <input name="gname" required>
    </label>

    <label>Phone number
      <input name="gphone" required>
    </label>

    <label>National ID number
      <input name="gid" required>
    </label>

    <label>Date of birth
      <input name="gdob" type="date" required>
    </label>

    <label>Location
      <input name="glocation">
    </label>

    <label>Relationship to borrower
      <input name="relationship">
    </label>

    <label>Guarantee amount (KSh)
      <input name="gamount" type="number" min="1" required>
    </label>

    <label>Guarantor photo
      <input name="gphoto" type="file" accept="image/*" required>
    </label>

    <label>National ID front
      <input name="gidfront" type="file" accept="image/*,.pdf" required>
    </label>

    <label>National ID back
      <input name="gidback" type="file" accept="image/*,.pdf" required>
    </label>

    <button type="button" class="secondary removeGuarantor">
      Remove guarantor
    </button>
  `;

  const type = div.querySelector('[name="gtype"]');
  const picker = div.querySelector('.memberPicker');
  const memberSelect = div.querySelector('[name="gmember"]');
  const name = div.querySelector('[name="gname"]');
  const phone = div.querySelector('[name="gphone"]');
  const nationalId = div.querySelector('[name="gid"]');

  function updateType() {
    const isMember = type.value === 'member';
    picker.style.display = isMember ? 'block' : 'none';
    memberSelect.required = isMember;

    name.readOnly = isMember;
    phone.readOnly = isMember;
    nationalId.readOnly = isMember;

    if (!isMember) {
      memberSelect.value = '';
      name.value = '';
      phone.value = '';
      nationalId.value = '';
    }
  }

  memberSelect.onchange = () => {
    const option = memberSelect.selectedOptions[0];
    name.value = option.dataset.name || '';
    phone.value = option.dataset.phone || '';
    nationalId.value = option.dataset.id || '';
  };

  type.onchange = updateType;

  div.querySelector('.removeGuarantor').onclick = () => div.remove();

  rows.appendChild(div);
  updateType();
}


    addGuarantor();
    c.querySelector('#addGoraGuarantor').onclick = addGuarantor;

c.querySelector('#addAllChamaMembers').onclick = async () => {
  const btn = c.querySelector('#addAllChamaMembers');
  const chamaId = form.elements.chama_id.value;
  const borrowerId = form.elements.member_id.value;

  if (!chamaId) {
    alert('Please select a chama first.');
    return;
  }

  btn.disabled = true;

  try {
    const { data, error } = await db
      .from('chama_members')
      .select('member_id')
      .eq('chama_id', chamaId)
      .eq('status', 'active');

    if (error) throw error;

    const eligible = (data || []).filter(
      item => item.member_id !== borrowerId
    );

    if (!eligible.length) {
      alert('No other active chama members were found.');
      return;
    }

    const existing = new Set(
      [...rows.querySelectorAll('.goraGuarantor')]
        .map(div => div.querySelector('[name="gmember"]').value)
        .filter(Boolean)
    );

    let added = 0;

    for (const item of eligible) {
      if (existing.has(item.member_id)) continue;

      const member = ms.find(m => m.id === item.member_id);
      if (!member || member.status !== 'active') continue;

      addGuarantor();

      const div = rows.lastElementChild;
      const type = div.querySelector('[name="gtype"]');
      const select = div.querySelector('[name="gmember"]');

      type.value = 'member';
      type.dispatchEvent(new Event('change'));

      select.value = member.id;
      select.dispatchEvent(new Event('change'));

      existing.add(member.id);
      added++;
    }

    alert(added + ' chama members added as proposed guarantors.');
  } catch (err) {
    alert('Could not load chama members: ' + err.message);
  } finally {
    btn.disabled = false;
  }
};

    c.querySelector('#goraProduct').onchange = e => {
      const o = e.target.selectedOptions[0];
      if (!o.value) return;
      form.elements.rate.value = o.dataset.rate || 0;
      form.elements.duration.value = o.dataset.days || 28;
      const amount = Number(form.elements.amount.value || o.dataset.min);
      form.elements.fee.value =
        (amount * Number(o.dataset.fee || 0)) / 100;
    };

    form.elements.amount.oninput = () => {
      const o = c.querySelector('#goraProduct').selectedOptions[0];
      if (o && o.value) {
        form.elements.fee.value =
          (Number(form.elements.amount.value || 0) *
          Number(o.dataset.fee || 0)) / 100;
      }
    };

    form.onsubmit = async e => {
      e.preventDefault();
      const msg = c.querySelector('#goraApplicationMessage');
      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      msg.textContent = 'Saving application. Please wait...';

      let applicationId = null;
      const uploaded = [];

      try {
        const fd = new FormData(form);
        const memberId = fd.get('member_id');
        const productId = fd.get('product_id');
        const amount = Number(fd.get('amount'));
        const product = ps.find(p => p.id === productId);

        if (!memberId || !product) throw new Error('Select a borrower and loan product.');
        if (amount < Number(product.minimum_amount) ||
            amount > Number(product.maximum_amount)) {
          throw new Error('Requested amount is outside this product limit.');
        }

        const guarantorRows = [...rows.querySelectorAll('.goraGuarantor')];
        if (!guarantorRows.length) throw new Error('Add at least one guarantor.');

        const guarantors = guarantorRows.map(div => {
          const g = Object.fromEntries(
            [...div.querySelectorAll('[name]')].map(el => [el.name, el])
          );
          const dob = new Date(g.gdob.value + 'T00:00:00');
          let age = new Date().getFullYear() - dob.getFullYear();
          const md = new Date().getMonth() - dob.getMonth();
          if (md < 0 || (md === 0 && new Date().getDate() < dob.getDate())) age--;
         if (g.gtype.value === 'member' && !g.gmember.value) {
  throw new Error('Please select the registered GORA guarantor.');
}
          if (!g.gname.value.trim() || !g.gphone.value.trim() ||
              !g.gid.value.trim() || !g.gdob.value || age < 18) {
            throw new Error('Each guarantor must have complete details and be at least 18.');
          }
          if (!g.gphoto.files[0] || !g.gidfront.files[0] || !g.gidback.files[0]) {
            throw new Error('Upload each guarantor photo and both sides of their ID.');
          }
          return { div, g };
        });

        const guaranteeTotal = guarantors.reduce(
          (sum, x) => sum + Number(x.g.gamount.value || 0), 0
        );
        if (guaranteeTotal < amount) {
          throw new Error('Total guarantor amounts must cover the requested loan.');
        }

        const { data: userData } = await db.auth.getUser();
        if (!userData.user) throw new Error('Please sign in again.');

        const appPayload = {
          member_id: memberId,
          product_id: productId,
          requested_amount: amount,
          proposed_interest_rate: Number(fd.get('rate')),
          proposed_duration_days: Number(fd.get('duration')),
          purpose: fd.get('purpose'),
          status: 'pending',
          application_source: 'manual',
          repayment_frequency: fd.get('frequency'),
          application_fee_amount: Number(fd.get('fee') || 0),
          application_fee_status: 'not_paid',
          guarantor_required: true,
          chama_id: fd.get('chama_id') || null,
          preferred_disbursement_method: fd.get('disbursement'),
          borrower_declaration_at: new Date().toISOString(),
          documents_review_status: 'pending'
        };

        const { data: app, error: appError } = await db
          .from('loan_applications').insert(appPayload).select('id').single();
        if (appError) throw appError;
        applicationId = app.id;

        const business = await db.from('loan_application_business_details').insert({
          application_id: applicationId,
          employment_status: fd.get('employment'),
          occupation: fd.get('occupation'),
          employer_name: fd.get('employer'),
          business_name: fd.get('business_name'),
          business_type: fd.get('business_type'),
          business_location: fd.get('business_location'),
          business_age_months: Number(fd.get('business_age') || 0) || null,
          monthly_business_income: Number(fd.get('business_income') || 0),
          monthly_salary_income: Number(fd.get('salary') || 0),
          other_income_description: fd.get('other_income_description'),
          other_income_amount: Number(fd.get('other_income') || 0)
        });
        if (business.error) throw business.error;

        const monthlyIncome = Number(fd.get('monthly_income'));
        const expenses = Number(fd.get('expenses'));
        const assessment = await db.from('loan_application_assessments').insert({
          application_id: applicationId,
          monthly_income: monthlyIncome,
          other_monthly_income: Number(fd.get('other_income') || 0),
          monthly_expenses: expenses,
          existing_loan_balance: Number(fd.get('existing_balance') || 0),
          existing_monthly_repayments: Number(fd.get('existing_repayments') || 0),
          savings_balance: Number(fd.get('savings') || 0),
          disposable_income: monthlyIncome - expenses -
            Number(fd.get('existing_repayments') || 0),
          proposed_installment: Number(fd.get('installment')),
          repayment_capacity: fd.get('capacity'),
          officer_assessment: fd.get('assessment_notes'),
          assessed_by: userData.user.id,
          assessed_at: new Date().toISOString()
        });
        if (assessment.error) throw assessment.error;

        for (const item of guarantors) {
          const g = item.g;
          const { data: guarantor, error: gError } = await db
            .from('loan_guarantors').insert({
              application_id: applicationId,
              guarantor_member_id: g.gtype.value === 'member' ? g.gmember.value : null,
              guarantor_type: g.gtype.value,
              full_name: g.gname.value.trim(),
              phone: g.gphone.value.trim(),
              national_id: g.gid.value.trim(),
              date_of_birth: g.gdob.value,
              location: g.glocation.value,
              relationship: g.relationship.value,
              guarantee_amount: Number(g.gamount.value),
              consent_status: 'pending',
              identity_verification_status: 'pending',
              phone_verification_status: 'pending',
              recorded_by: userData.user.id
            }).select('id').single();
          if (gError) throw gError;

          for (const [type, file] of [
            ['photo', g.gphoto.files[0]],
            ['id_front', g.gidfront.files[0]],
            ['id_back', g.gidback.files[0]]
          ]) {
            const path = `applications/${applicationId}/guarantors/${guarantor.id}/${type}_${Date.now()}`;
            const up = await db.storage.from('member-documents').upload(path, file);
            if (up.error) throw up.error;
            uploaded.push(path);
            const meta = await db.from('loan_guarantor_documents').insert({
              guarantor_id: guarantor.id,
              document_type: type,
              storage_bucket: 'member-documents',
              storage_path: path,
              uploaded_by: userData.user.id
            });
            if (meta.error) throw meta.error;
          }
        }

        const applicantFiles = [
          ['applicant_photo', fd.get('applicant_photo')],
          ['applicant_id_front', fd.get('applicant_id_front')],
          ['applicant_id_back', fd.get('applicant_id_back')],
          ['income_evidence', fd.get('income_evidence')]
        ].filter(x => x[1] instanceof File && x[1].size > 0);

        for (const [type, file] of applicantFiles) {
          const path = `applications/${applicationId}/applicant/${type}_${Date.now()}`;
          const up = await db.storage.from('member-documents').upload(path, file);
          if (up.error) throw up.error;
          uploaded.push(path);
          const meta = await db.from('loan_application_documents').insert({
            application_id: applicationId,
            document_type: type,
            storage_path: path,
            uploaded_by: userData.user.id
          });
          if (meta.error) throw meta.error;
        }

        if (fd.get('collateral_type')) {
          const col = await db.from('loan_application_collateral').insert({
            application_id: applicationId,
            collateral_type: fd.get('collateral_type'),
            description: fd.get('collateral_description'),
            estimated_value: Number(fd.get('collateral_value') || 0),
            owner_full_name: fd.get('collateral_owner'),
            ownership_document_notes: fd.get('ownership_notes'),
            verification_status: 'pending'
          });
          if (col.error) throw col.error;
        }

        msg.textContent =
          'Application saved successfully. Reference: ' + applicationId +
          '. Documents and guarantor verification are pending review.';
        alert('GORA application saved. Reference: ' + applicationId);
        form.reset();
        rows.innerHTML = '';
        addGuarantor();

      } catch (err) {
        msg.textContent = applicationId
          ? 'Application ' + applicationId +
            ' was created but a later step failed. Do not submit another application. Contact the administrator to complete this record. Error: ' + err.message
          : 'Could not save application: ' + err.message;
      } finally {
        btn.disabled = false;
      }
    };

  } catch (err) {
    c.innerHTML = `<div class="panel"><h3>Application screen error</h3><p>${esc(err.message)}</p></div>`;
  }
}

load = async function(page) {
  if (page === 'Applications') return goraOnlineSigningPage($('content'));
  if (page === 'Loans') return goraLoans($('content'));
  return goraOldLoad(page);
};
