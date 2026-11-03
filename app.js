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
 const [m,ch,l,r,apps,inst]=await Promise.all([
 safe(db.from('members').select('id',{count:'exact',head:true})),
 safe(db.from('chamas').select('id',{count:'exact',head:true})),
 safe(db.from('loans').select('id,principal,interest_amount,total_payable,status,disbursement_date')),
 safe(db.from('repayments').select('amount,payment_date')),
 safe(db.from('loan_applications').select('id,status')),
 safe(db.from('installment_balances').select('amount_due,amount_paid,balance,due_date,payment_status'))
 ]);
 const loans=l.data||[],reps=r.data||[],ins=inst.data||[],today=new Date().toISOString().slice(0,10);
 const issued=loans.reduce((s,x)=>s+Number(x.principal||0),0),paid=reps.reduce((s,x)=>s+Number(x.amount||0),0);
 const outstanding=loans.reduce((s,x)=>s+Number(x.total_payable||0),0)-paid;
 const arrears=ins.filter(x=>x.due_date<today&&Number(x.balance)>0).reduce((s,x)=>s+Number(x.balance),0);
 const dueToday=ins.filter(x=>x.due_date===today&&Number(x.balance)>0).reduce((s,x)=>s+Number(x.balance),0);
 const pending=(apps.data||[]).filter(x=>x.status==='pending').length;
 c.innerHTML=`<div class="page-heading"><div><h2>Good day, ${profile?.full_name||'GORA team'}</h2><div class="sub">Your live operational and portfolio overview.</div></div><span class="pill">LIVE DATABASE</span></div>
 <div class="stats">
 ${stat('Registered members',m.count||0,'All member records','blue')}
 ${stat('Active chamas',ch.count||0,'All registered groups','good')}
 ${stat('Loans disbursed',cash(issued),'Total principal recorded','blue')}
 ${stat('Total repayments',cash(paid),'Payments recorded','good')}
 ${stat('Outstanding balance',cash(Math.max(0,outstanding)),'Total payable less repayments','warn')}
 ${stat('Loan arrears',cash(arrears),'Past-due unpaid installments','red')}
 ${stat('Loans due today',cash(dueToday),'Unpaid installments due today','warn')}
 ${stat('Pending applications',pending,'Awaiting review','blue')}
 </div>
 <div class="notice">Figures are calculated from records currently visible to your account. Before operational use, database permissions and repayment posting must be fully tested.</div>
 <div class="grid-two"><div class="panel"><h3>Portfolio at a glance</h3>
 <div class="metric-line"><span>Loans on record</span><b>${loans.length}</b></div>
 <div class="metric-line"><span>Active loans</span><b>${loans.filter(x=>['active','approved'].includes(x.status)).length}</b></div>
 <div class="metric-line"><span>Completed loans</span><b>${loans.filter(x=>x.status==='completed').length}</b></div>
 <div class="metric-line"><span>Defaulted loans</span><b>${loans.filter(x=>x.status==='defaulted').length}</b></div></div>
 <div class="panel"><h3>Operational attention</h3>
 <div class="metric-line"><span>Pending loan applications</span><b>${pending}</b></div>
 <div class="metric-line"><span>Installments overdue</span><b>${ins.filter(x=>x.due_date<today&&Number(x.balance)>0).length}</b></div>
 <div class="metric-line"><span>Installments due today</span><b>${ins.filter(x=>x.due_date===today&&Number(x.balance)>0).length}</b></div>
 <div class="metric-line"><span>Repayments recorded</span><b>${reps.length}</b></div></div></div>`;
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
  safe(db.from('chamas').select('id,name,location,meeting_day,status,created_at').order('created_at',{ascending:false})),
  safe(db.from('members').select('id,member_number,full_name,phone,status').order('full_name'))
 ]);
 const groupRows=groups.data||[], memberRows=members.data||[];
 c.innerHTML=`<div class="page-heading"><div><h2>Chama management</h2><div class="sub">Create groups and organise registered GORA members.</div></div><button class="primary" id="newChama">＋ Add new chama</button></div>
 <div class="grid-two"><div class="panel"><h3>Register a chama</h3><form id="chamaForm">
 <label>Chama name<input name="name" required maxlength="100" placeholder="e.g. Mtondia Women Group"></label>
 <label>Location<input name="location" required maxlength="120" placeholder="e.g. Mtondia, Kilifi"></label>
 <label>Meeting day<input name="meeting_day" placeholder="e.g. Friday"></label>
 <label>Meeting frequency<select name="frequency"><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="monthly">Monthly</option></select></label>
 <label>Group status<select name="status"><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
 <button class="primary" type="submit">Save chama</button><p id="chamaMsg" class="message"></p></form></div>
 <div class="panel"><h3>Add registered member to a chama</h3><form id="joinForm">
 <label>Select chama<select name="chama_id" required><option value="">Choose chama</option>${groupRows.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></label>
 <label>Select registered member<select name="member_id" required><option value="">Choose member</option>${memberRows.filter(m=>m.status==='active').map(m=>`<option value="${m.id}">${esc(m.full_name)} — ${esc(m.member_number||m.phone||'')}</option>`).join('')}</select></label>
 <label>Date joined<input name="date_joined" type="date" value="${new Date().toISOString().slice(0,10)}" required></label>
 <button class="primary" type="submit">Add member to chama</button><p id="joinMsg" class="message"></p></form>
 <p class="hint">Only active members already registered in the GORA Members Registry appear here.</p></div></div>
 ${table('Registered chamas',['name','location','meeting_day','status'],groupRows.map(g=>({...g,status:g.status||'active'})))}
 <div class="notice">Creating chamas and assigning members requires the correct Supabase row-level security policies. If saving is denied, no record has been added; the database administrator must apply the accompanying policy script.</div>`;
 $('newChama').onclick=()=>$('chamaForm').scrollIntoView({behavior:'smooth',block:'center'});
 $('chamaForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const row={name:f.get('name').trim(),location:f.get('location').trim(),meeting_day:f.get('meeting_day').trim()||null,status:f.get('status')};const msg=$('chamaMsg');try{await safe(db.from('chamas').insert(row));msg.textContent='Chama saved successfully.';await chamaPage(c)}catch(err){msg.textContent='Could not save: '+(err.message||err);}};
 $('joinForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const row={chama_id:f.get('chama_id'),member_id:f.get('member_id'),date_joined:f.get('date_joined'),status:'active'};const msg=$('joinMsg');try{await safe(db.from('chama_members').insert(row));msg.textContent='Member added to chama successfully.';await chamaPage(c)}catch(err){msg.textContent='Could not add member: '+(err.message||err);}};
}
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
async function load(page){$('title').textContent=page;const c=$('content');c.innerHTML='<div class="panel">Loading records…</div>';try{if(page==='Dashboard'){await dashboard(c);return}if(page==='Chamas'){await chamaPage(c);return}if(page==='Settings'){c.innerHTML='<div class="panel"><h3>System settings</h3><p>Loan product rates and fees must be administered by the GORA admin only. Configuration controls will be enabled after permission policies are verified.</p></div>';return}
const [tbl,cols]=pages[page]||['audit_logs',['action','table_name','record_id','created_at']];let q=db.from(tbl).select('*').limit(100);if(page==='Arrears')q=q.lt('due_date',new Date().toISOString().slice(0,10)).gt('balance',0);const res=await safe(q);let rows=res.data||[];if(page==='Expenses')rows=rows.filter(x=>x.entry_type==='expense');c.innerHTML=`<div class="page-heading"><div><h2>${page}</h2><div class="sub">Showing up to 100 records from the connected GORA database.</div></div></div><div class="notice">This section is currently connected for viewing. Data-entry, approval and payment actions will be enabled only after their database security and audit controls are completed.</div>${table(page,cols,rows)}`;}
catch(e){c.innerHTML=`<div class="panel"><h3>Could not load ${page}</h3><p>${String(e.message||e)}</p><p>Database access policies or the required view may not yet be configured. No data has been changed.</p></div>`}}
(function(){const u=localStorage.getItem('gora_url')||'',k=localStorage.getItem('gora_key')||'';$('url').value=u;$('key').value=k;connect();})();
