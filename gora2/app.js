/* GORA 2.0 - browser application. Uses Supabase Auth + RLS; never put service-role keys here. */
const SUPABASE_URL = "https://ptqenrbebssgfrhcuyuw.supabase.co";
const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY_HERE";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s);
const money = n => new Intl.NumberFormat("en-KE",{style:"currency",currency:"KES",maximumFractionDigits:2}).format(Number(n||0));
const esc = v => String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const config = {
 members:{title:"Members",table:"members",cols:["member_number","full_name","phone","national_id","status","registration_date"]},
 chama_groups:{title:"Chama groups",table:"chama_groups",cols:["group_code","group_name","status","meeting_frequency","target_weekly_savings","location"]},
 savings_accounts:{title:"Savings accounts",table:"savings_accounts",cols:["account_number","member_id","status","opened_at"]},
 loan_applications:{title:"Loan applications",table:"loan_applications",cols:["application_number","borrower_type","requested_amount","status","applied_at"]},
 loan_accounts:{title:"Loan accounts",table:"loan_accounts",cols:["loan_number","application_id","principal_amount","status","disbursement_date"]},
 loan_repayments:{title:"Loan repayments",table:"loan_repayments",cols:["loan_account_id","payment_date","amount","payment_method","reference_number","status"]},
 financial_approval_requests:{title:"Financial approvals",table:"financial_approval_requests",cols:["request_type","amount","description","status","maker_user_id","submitted_at"]},
 capital_transactions:{title:"Capital transactions",table:"capital_transactions",cols:["transaction_type","amount","transaction_date","payment_method","reference","description"]},
 daily_reconciliations:{title:"Daily reconciliation",table:"daily_reconciliations",cols:["reconciliation_date","opening_cash","opening_mpesa","opening_bank","actual_closing_cash","actual_closing_mpesa","actual_closing_bank","status"]},
 journal_entries:{title:"General ledger",table:"journal_entries",cols:["entry_number","entry_date","description","source_type","status","posted_at"]}
};
let currentUser=null, orgId=null, roleCode=null, currentPage="dashboard";
function toast(msg){const t=$("#toast");t.textContent=msg;t.style.display="block";setTimeout(()=>t.style.display="none",3200)}
function titleCase(s){return String(s).replaceAll("_"," ").replace(/\b\w/g,x=>x.toUpperCase())}
async function sessionStart(session){
 if(!session){$("#app").classList.add("hidden");$("#login").classList.remove("hidden");return}
 currentUser=session.user;
 const {data:ur,error}=await db.from("user_roles").select("organization_id,roles(role_code,role_name)").eq("user_id",currentUser.id).eq("is_active",true);
 if(error||!ur?.length){$("#loginMsg").textContent="Your account has no active GORA role. Ask the system administrator.";await db.auth.signOut();return}
 orgId=ur[0].organization_id;roleCode=ur[0].roles?.role_code||"STAFF";
 $("#userLabel").textContent=currentUser.email+" · "+roleCode;
 $("#login").classList.add("hidden");$("#app").classList.remove("hidden");
 navigate("dashboard");
}
$("#loginForm").addEventListener("submit",async e=>{e.preventDefault();$("#loginMsg").textContent="Signing in…";const {error}=await db.auth.signInWithPassword({email:$("#email").value,password:$("#password").value});$("#loginMsg").textContent=error?.message||""});
$("#logout").onclick=()=>db.auth.signOut();
db.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>sessionStart(session),0)});
$("#nav").addEventListener("click",e=>{const b=e.target.closest("[data-page]");if(b)navigate(b.dataset.page)});
$("#menuToggle").onclick=()=>$("#sidebar").classList.toggle("open");
function navigate(page){currentPage=page;$("#sidebar").classList.remove("open");document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));if(page==="dashboard")renderDashboard();else if(page==="reports")renderReports();else renderTablePage(page)}
async function fetchRows(table,limit=100){let q=db.from(table).select("*").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(limit);return await q}
function renderDashboard(){ $("#pageTitle").textContent="Dashboard";$("#crumb").textContent="OVERVIEW";$("#content").innerHTML='<div class="loading">Loading portfolio…</div>';
 Promise.all([fetchRows("members"),fetchRows("chama_groups"),fetchRows("loan_accounts"),fetchRows("savings_accounts"),fetchRows("financial_approval_requests")]).then(([m,g,l,s,a])=>{
 const errs=[m,g,l,s,a].filter(x=>x.error);if(errs.length){$("#content").innerHTML=`<div class="panel error">Dashboard data unavailable: ${esc(errs[0].error.message)}</div>`;return}
 const activeMembers=(m.data||[]).filter(x=>x.status==="ACTIVE").length;
 $("#content").innerHTML=`<div class="page-head"><div><h2>Good day</h2><p>Your GORA operations at a glance.</p></div><span class="badge active">LIVE DATA</span></div>
 <div class="stats"><div class="stat"><small>Total members</small><strong>${m.data.length}</strong></div><div class="stat"><small>Active members</small><strong>${activeMembers}</strong></div><div class="stat"><small>Chama groups</small><strong>${g.data.length}</strong></div><div class="stat"><small>Loan accounts</small><strong>${l.data.length}</strong></div></div>
 <div class="grid2"><div class="panel"><h3>Pending approvals</h3><strong style="font-size:28px">${(a.data||[]).filter(x=>x.status==="PENDING").length}</strong><p class="muted">Requests awaiting owner review</p><button class="secondary" onclick="navigate('financial_approval_requests')">Review approvals</button></div>
 <div class="panel"><h3>Savings accounts</h3><strong style="font-size:28px">${s.data.length}</strong><p class="muted">Member savings are liabilities, not lending capital.</p><button class="secondary" onclick="navigate('savings_accounts')">View accounts</button></div></div>
 <div class="hint">Financial totals are intentionally not estimated from account counts. Use posted ledger entries and reconciled balances for cash and portfolio reporting.</div>`;
 }).catch(e=>$("#content").innerHTML=`<div class="error">${esc(e.message)}</div>`)}
async function renderTablePage(page){
 const c=config[page];if(!c)return;
 $("#pageTitle").textContent=c.title;$("#crumb").textContent="OPERATIONS";$("#content").innerHTML='<div class="loading">Loading '+esc(c.title)+'…</div>';
 const {data,error}=await db.from(c.table).select("*").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(200);
 if(error){$("#content").innerHTML=`<div class="panel error"><b>Unable to load ${esc(c.title)}</b><p>${esc(error.message)}</p><p class="muted">Check your role's RLS read permission and confirm the migration/schema version.</p></div>`;return}
 const cols=c.cols.filter(k=>(data?.[0]||{}).hasOwnProperty(k));
 $("#content").innerHTML=`<div class="page-head"><div><h2>${esc(c.title)}</h2><p>${data.length} records · latest 200</p></div><button class="secondary" onclick="navigate('dashboard')">Back to dashboard</button></div>
 <div class="panel"><div class="toolbar"><input id="filterRows" placeholder="Search visible records…"><span class="muted">Read view · financial changes use approved workflows</span></div><div class="table-wrap"><table><thead><tr>${cols.map(k=>`<th>${esc(titleCase(k))}</th>`).join("")}</tr></thead><tbody id="tableBody">${data.map(row=>`<tr>${cols.map(k=>`<td>${cell(k,row[k])}</td>`).join("")}</tr>`).join("")||`<tr><td colspan="${Math.max(cols.length,1)}" class="empty">No records yet</td></tr>`}</tbody></table></div></div>
 ${page==="financial_approval_requests"?'<div class="hint">Approvals are displayed here. Decision processing must use the secure owner_decide_financial_request RPC and the separate transaction-posting workflow; this read-only release does not fake a successful posting.</div>':""}
 ${page==="daily_reconciliations"?'<div class="hint">Reconciliation records are shown for review. Do not treat a manually entered closing balance as reconciled until expected balances are calculated from posted ledger movements and the day is formally locked.</div>':""}`;
 $("#filterRows").addEventListener("input",e=>{const v=e.target.value.toLowerCase();$("#tableBody").querySelectorAll("tr").forEach(tr=>tr.style.display=tr.textContent.toLowerCase().includes(v)?"":"none")});
}
function cell(k,v){if(v==null)return "—";if(k==="status")return `<span class="badge ${esc(String(v).toLowerCase())}">${esc(v)}</span>`;if(["amount","requested_amount","principal_amount","target_weekly_savings","opening_cash","opening_mpesa","opening_bank","actual_closing_cash","actual_closing_mpesa","actual_closing_bank"].includes(k))return esc(money(v));if(typeof v==="string"&&v.length>32)return esc(v.slice(0,12)+"…");return esc(v)}
async function renderReports(){ $("#pageTitle").textContent="Reports";$("#crumb").textContent="INSIGHTS";$("#content").innerHTML=`<div class="page-head"><div><h2>Reports &amp; controls</h2><p>Operational visibility from your live GORA records.</p></div></div><div class="grid2"><div class="panel"><h3>Portfolio monitoring</h3><p class="muted">Use the loan schedules and allocations to calculate principal outstanding, arrears ageing and PAR 1/7/30. This release does not label unverified totals as official PAR.</p><button class="secondary" onclick="navigate('loan_accounts')">Loan accounts</button></div><div class="panel"><h3>Financial control</h3><p class="muted">Review posted journal entries, approval history and daily reconciliation records.</p><button class="secondary" onclick="navigate('journal_entries')">Open ledger</button></div><div class="panel"><h3>Savings protection</h3><p class="muted">Savings liabilities are tracked separately from owner capital and available lending funds.</p><button class="secondary" onclick="navigate('savings_accounts')">Savings accounts</button></div><div class="panel"><h3>Audit trail</h3><p class="muted">Financial actions must be traceable to a user, approval and journal source.</p><button class="secondary" onclick="navigate('financial_approval_requests')">Approval queue</button></div></div>`}
db.auth.getSession().then(({data})=>sessionStart(data.session));
