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
 const [loansRes,membersRes,paymentsRes]=await Promise.all([
  safe(db.from('loans').select('id,member_id,status,disbursement_date,principal,total_payable').not('disbursement_date','is',null).in('status',['approved','active'])),
  safe(db.from('members').select('id,full_name,member_number,phone')),
  safe(db.from('repayments').select('id,loan_id,amount,payment_date,payment_method,receipt_number,notes').order('payment_date',{ascending:false}).limit(100))
 ]);

 const loans=loansRes.data||[];
 const members=membersRes.data||[];
 const payments=paymentsRes.data||[];
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
 ))}
 `;

 const form=$('collectionForm');
 const memberSelect=$('collectionMember');
 const loanSelect=$('collectionLoan');
 const installmentSelect=$('collectionInstallment');
 const balanceInput=$('collectionBalance');
 const amountInput=$('collectionAmount');

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
 };
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
async function load(page){$('title').textContent=page;const c=$('content');c.innerHTML='<div class="panel">Loading records…</div>';try{if(page==='Dashboard'){await dashboard(c);return}if(page==='Chamas'){await chamaPage(c);return}if(page==='Members'){await (window.membersPage||membersPage)(c);return};if(page==='Applications'){await applicationsPage(c);return}if(page==='Performance'){await performancePage(c);return}if(page==='Repayments'){await collectionsPage(c);return}if(page==='Settings'){c.innerHTML='<div class="panel"><h3>System settings</h3><p>Loan product rates and fees must be administered by the GORA admin only. Configuration controls will be enabled after permission policies are verified.</p></div>';return}
const [tbl,cols]=pages[page]||['audit_logs',['action','table_name','record_id','created_at']];let q=db.from(tbl).select('*').limit(100);if(page==='Arrears')q=q.lt('due_date',new Date().toISOString().slice(0,10)).gt('balance',0);const res=await safe(q);let rows=res.data||[];if(page==='Expenses')rows=rows.filter(x=>x.entry_type==='expense');c.innerHTML=`<div class="page-heading"><div><h2>${page}</h2><div class="sub">Showing up to 100 records from the connected GORA database.</div></div></div><div class="notice">This section is currently connected for viewing. Data-entry, approval and payment actions will be enabled only after their database security and audit controls are completed.</div>${table(page,cols,rows)}`;}
catch(e){c.innerHTML=`<div class="panel"><h3>Could not load ${page}</h3><p>${String(e.message||e)}</p><p>Database access policies or the required view may not yet be configured. No data has been changed.</p></div>`}}
(function(){const u=localStorage.getItem('gora_url')||'',k=localStorage.getItem('gora_key')||'';$('url').value=u;$('key').value=k;connect();})();
