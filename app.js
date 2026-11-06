const $=id=>document.getElementById(id);let db=null,profile=null;
const cash=n=>new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES',maximumFractionDigits:0}).format(Number(n||0));
function connect(){const u=localStorage.getItem('gora_url'),k=localStorage.getItem('gora_key');if(!u||!k||!window.supabase)return false;db=window.supabase.createClient(u,k);return true}
$('save').onclick=()=>{localStorage.setItem('gora_url',$('url').value.trim());localStorage.setItem('gora_key',$('key').value.trim());$('msg').textContent=connect()?'Connection settings saved on this device.':'Enter both settings.'};
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
async function load(page){$('title').textContent=page;const c=$('content');c.innerHTML='<div class="panel">Loading records…</div>';try{if(page==='Dashboard'){await dashboard(c);return}if(page==='Chamas'){await chamaPage(c)if(page==='Members'){await (window.membersPage||membersPage)(c);return};if(page==='Applications'){await applicationsPage(c);return}if(page==='Performance'){await performancePage(c);return}if(page==='Settings'){c.innerHTML='<div class="panel"><h3>System settings</h3><p>Loan product rates and fees must be administered by the GORA admin only. Configuration controls will be enabled after permission policies are verified.</p></div>';return}
const [tbl,cols]=pages[page]||['audit_logs',['action','table_name','record_id','created_at']];let q=db.from(tbl).select('*').limit(100);if(page==='Arrears')q=q.lt('due_date',new Date().toISOString().slice(0,10)).gt('balance',0);const res=await safe(q);let rows=res.data||[];if(page==='Expenses')rows=rows.filter(x=>x.entry_type==='expense');c.innerHTML=`<div class="page-heading"><div><h2>${page}</h2><div class="sub">Showing up to 100 records from the connected GORA database.</div></div></div><div class="notice">This section is currently connected for viewing. Data-entry, approval and payment actions will be enabled only after their database security and audit controls are completed.</div>${table(page,cols,rows)}`;}
catch(e){c.innerHTML=`<div class="panel"><h3>Could not load ${page}</h3><p>${String(e.message||e)}</p><p>Database access policies or the required view may not yet be configured. No data has been changed.</p></div>`}}
(function(){const u=localStorage.getItem('gora_url')||'',k=localStorage.getItem('gora_key')||'';$('url').value=u;$('key').value=k;connect();})();
