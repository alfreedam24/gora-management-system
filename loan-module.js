/* GORA 2.0 — Complete core Loan Module
 * Uses isolated public.gora2_loan_* tables and secured RPCs.
 * Load after app.js; app.js passes the authenticated context.
 */
(() => {
  "use strict";

  const MODULES = new Set([
    "Loan Products","Loan Applications","Assessment & Approval",
    "Disbursement","Repayments","Schedules & Arrears"
  ]);
  const PRESETS = [
    {name:"Emergency",code:"EMERGENCY",category:"EMERGENCY",min:2000,max:10000,
     rate:20,period:"FOUR_WEEKS",termMin:4,termMax:5,unit:"WEEKS",frequency:"WEEKLY",grace:0},
    {name:"Chemsha",code:"CHEMSHA",category:"BUSINESS",min:8000,max:9999,
     rate:0,period:"FOUR_WEEKS",termMin:3,termMax:6,unit:"MONTHS",frequency:"MONTHLY",grace:0},
    {name:"Bizna",code:"BIZNA",category:"BUSINESS",min:10000,max:40000,
     rate:0,period:"FOUR_WEEKS",termMin:3,termMax:6,unit:"MONTHS",frequency:"MONTHLY",grace:0},
    {name:"Inuka",code:"INUKA",category:"BUSINESS",min:41000,max:65000,
     rate:0,period:"FOUR_WEEKS",termMin:3,termMax:6,unit:"MONTHS",frequency:"MONTHLY",grace:0},
    {name:"Nawiri",code:"NAWIRI",category:"BUSINESS",min:66000,max:85000,
     rate:0,period:"FOUR_WEEKS",termMin:3,termMax:6,unit:"MONTHS",frequency:"MONTHLY",grace:0},
    {name:"Boresha",code:"BORESHA",category:"BUSINESS",min:86000,max:null,
     rate:0,period:"FOUR_WEEKS",termMin:3,termMax:6,unit:"MONTHS",frequency:"MONTHLY",grace:0},
    {name:"Christmas",code:"CHRISTMAS",category:"CHRISTMAS",min:2000,max:10000,
     rate:0,period:"FOUR_WEEKS",termMin:4,termMax:4,unit:"WEEKS",frequency:"WEEKLY",grace:2},
    {name:"School Fees",code:"SCHOOL_FEES",category:"SCHOOL_FEES",min:1000,max:50000,
     rate:0,period:"FOUR_WEEKS",termMin:1,termMax:1,unit:"MONTHS",frequency:"MONTHLY",grace:1},
    {name:"Hospital",code:"HOSPITAL",category:"HOSPITAL",min:10000,max:30000,
     rate:0,period:"FOUR_WEEKS",termMin:1,termMax:1,unit:"MONTHS",frequency:"MONTHLY",grace:1}
  ];
  const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = v => new Intl.NumberFormat("en-KE",{style:"currency",currency:"KES",maximumFractionDigits:2}).format(Number(v||0));
  const dateToday = () => new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Nairobi",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const options = (items,selected) => items.map(v=>`<option value="${esc(v)}" ${v===selected?"selected":""}>${esc(v.replaceAll("_"," "))}</option>`).join("");
  const field = (label,id,value="",type="text",attrs="") => `<label class="form-field">${esc(label)}<input id="lm-${id}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
  const select = (label,id,items,value) => `<label class="form-field">${esc(label)}<select id="lm-${id}">${options(items,value)}</select></label>`;
  const val = id => document.getElementById("lm-"+id)?.value ?? "";
  const fmtDate = v => v ? String(v).slice(0,10) : "—";
  const btn = (label,cls="btn btn-soft",attrs="") => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;
  const isManager = ctx => ["SUPER_ADMIN","MANAGER"].includes(ctx.profile?.roleCode);
  const isLoanStaff = ctx => ["SUPER_ADMIN","MANAGER","LOAN_OFFICER"].includes(ctx.profile?.roleCode);
  const pill = s => `<span class="pill ${String(s||"").toLowerCase()}">${esc(String(s||"—").replaceAll("_"," "))}</span>`;

  window.GORALoanModule = {
    handles: name => MODULES.has(name),
    async render(moduleName,ctx) {
      const root=document.getElementById("pageContent");
      if(!root || !ctx?.db || !ctx?.organization?.id) {
        if(root) root.innerHTML='<div class="panel">Loan module connection context is missing.</div>';
        return;
      }
      const db=ctx.db, org=ctx.organization.id, user=ctx.authUser?.id;
      let products=[],apps=[],accounts=[],members=[],groups=[],individuals=[],activeView=moduleName;
      root.innerHTML='<div class="loading-panel">Loading loan module…</div>';
      try {
        [products,apps,accounts,members,groups,individuals]=await Promise.all([
          read("gora2_loan_products","*","product_name"),
          read("gora2_loan_applications","*","applied_at"),
          read("gora2_loan_accounts","*","created_at"),
          read("members","id,member_number,first_name,last_name,business_name,phone,status,chama_group_id,branch_id","first_name"),
          read("chama_groups","id,group_code,group_name,status","group_name"),
          read("individual_borrowers","id,borrower_number,full_name,phone,status,branch_id","full_name")
        ]);
        await draw(moduleName);
      } catch(e) {
        root.innerHTML=`<div class="panel error"><b>Loan module could not load.</b><p>${esc(e.message)}</p><p>Check that the GORA 2.0 loan SQL migration has been applied and that your staff role has access.</p></div>`;
      }

      async function read(table,cols,order) {
        const {data,error}=await db.from(table).select(cols).eq("organization_id",org).order(order,{ascending:false});
        if(error) throw error;
        return data||[];
      }
      const memberName=id=>{
        const m=members.find(x=>x.id===id);
        if(m)return m.business_name||`${m.first_name||""} ${m.last_name||""}`.trim();
        const b=individuals.find(x=>x.id===id);
        return b?(b.business_name||b.full_name||b.borrower_number):"—";
      };
      const productName=id=>products.find(x=>x.id===id)?.product_name||"—";
      const accountNumber=id=>accounts.find(x=>x.id===id)?.account_number||"—";
      const refresh=async()=>{[products,apps,accounts]=await Promise.all([
        read("gora2_loan_products","*","product_name"),
        read("gora2_loan_applications","*","applied_at"),
        read("gora2_loan_accounts","*","created_at")
      ]);await draw(activeView);};

      async function draw(view) {
        activeView=view;
        const nav=MODULES.has(view)?view:"Loan Products";
        root.innerHTML=`
          <div class="page-heading">
            <div><h2>${esc(nav)}</h2><p>GORA 2.0 loan lifecycle and portfolio operations.</p></div>
            <div class="heading-actions">${(view==="Loan Products"?isManager(ctx):(["Loan Applications","Assessment & Approval","Repayments"].includes(view)?isLoanStaff(ctx):false))?btn("+ New", "btn btn-primary","id='lm-new'"):""}</div>
          </div>
          <div class="panel">
            <div class="toolbar" style="grid-template-columns:1fr 180px">
              <input id="lm-search" type="search" placeholder="Search product, borrower, application or loan number…">
              <select id="lm-status"><option value="ALL">All statuses</option>${options(["ACTIVE","INACTIVE","PROCESSING","UNDER_REVIEW","PENDING_APPROVAL","APPROVED","READY_FOR_DISBURSEMENT","DISBURSED","OPEN","CLEARED","DEFAULTED","NOT_TAKEN_UP","REJECTED"],"ALL")}</select>
            </div>
            <div class="table-wrap" id="lm-table"></div>
          </div>
          <div id="lm-editor"></div>
          <div class="note-box">Loan approval and financial posting are handled by protected database functions. Each borrower can have multiple independent loans and schedules.</div>
        `;
        const table=document.getElementById("lm-table"),editor=document.getElementById("lm-editor");
        const filtered=(rows,kind)=>{
          const q=(document.getElementById("lm-search").value||"").toLowerCase(),st=document.getElementById("lm-status").value;
          return rows.filter(x=>{
            const text=kind==="products"?`${x.product_name} ${x.product_code} ${x.category}`:
              kind==="apps"?`${x.application_number} ${memberName(x.member_id)} ${productName(x.product_id)} ${x.purpose}`:
              `${x.account_number} ${memberName(x.member_id)} ${productName(x.product_id)}`;
            return (!q||text.toLowerCase().includes(q))&&(st==="ALL"||x.status===st);
          });
        };
        if(view==="Loan Products") drawProducts();
        else if(view==="Loan Applications"||view==="Assessment & Approval") drawApplications();
        else if(view==="Disbursement") drawDisbursement();
        else if(view==="Repayments") drawRepayments();
        else drawSchedules();

        document.getElementById("lm-search").oninput=()=>drawTableCurrent();
        document.getElementById("lm-status").onchange=()=>drawTableCurrent();
        if(document.getElementById("lm-new")) document.getElementById("lm-new").onclick=()=>openNew();

        function drawTableCurrent(){
          if(view==="Loan Products") drawProducts();
          else if(view==="Loan Applications"||view==="Assessment & Approval") drawApplications();
          else if(view==="Disbursement") drawDisbursement();
          else if(view==="Repayments") drawRepayments();
          else drawSchedules();
        }
        function drawProducts(){
          const rows=filtered(products,"products");
          table.innerHTML=rows.length?`<table class="data-table" style="min-width:850px"><thead><tr><th>Product</th><th>Range</th><th>Rate</th><th>Term</th><th>Grace</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(p=>`<tr><td><b>${esc(p.product_name)}</b><small style="display:block;color:var(--muted)">${esc(p.product_code)} · ${esc(p.category)}</small></td><td>${money(p.minimum_amount)} – ${p.maximum_amount==null?"No cap":money(p.maximum_amount)}</td><td>${Number(p.interest_rate)}% <small>${esc(p.interest_period)}</small></td><td>${p.duration_min}–${p.duration_max} ${esc(p.duration_unit)}</td><td>${p.grace_period_count} ${esc(p.grace_period_unit)}</td><td>${pill(p.status)}</td><td>${isManager(ctx)?btn("Edit","btn btn-soft lp-edit",`data-id="${p.id}"`):"—"}</td></tr>`).join("")}</tbody></table>`:'<div class="empty-state">No products yet. Add a product preset and enter the approved rate.</div>';
          table.querySelectorAll(".lp-edit").forEach(b=>b.onclick=()=>openProduct(products.find(x=>x.id===b.dataset.id)));
        }
        function drawApplications(){
          const rows=filtered(apps,"apps");
          table.innerHTML=rows.length?`<table class="data-table" style="min-width:900px"><thead><tr><th>Application</th><th>Borrower</th><th>Product</th><th>Requested</th><th>Term / cycle</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map(a=>`<tr><td><b>${esc(a.application_number)}</b><small>${fmtDate(a.applied_at)}</small></td><td>${esc(a.borrower_type==="GROUP"?groups.find(g=>g.id===a.group_id)?.group_name||"Group":memberName(a.member_id)||memberName(a.individual_borrower_id))}</td><td>${esc(productName(a.product_id))}</td><td>${money(a.requested_amount)}</td><td>${a.requested_duration} ${esc(a.requested_duration_unit)} · ${esc(a.requested_repayment_frequency)}</td><td>${pill(a.status)}</td><td>${btn("Review","btn btn-soft lm-review",`data-id="${a.id}"`)} ${isManager(ctx)&&["APPROVED","READY_FOR_DISBURSEMENT"].includes(a.status)?btn("Disburse","btn btn-primary lm-disburse",`data-id="${a.id}"`):""} ${isManager(ctx)&&["PROCESSING","UNDER_REVIEW","READY_FOR_DISBURSEMENT"].includes(a.status)?btn("Not taken up","btn btn-soft lm-not-taken",`data-id="${a.id}"`):""}</td></tr>`).join("")}</tbody></table>`:'<div class="empty-state">No loan applications found.</div>';
          table.querySelectorAll(".lm-review").forEach(b=>b.onclick=()=>reviewApplication(apps.find(x=>x.id===b.dataset.id)));
          table.querySelectorAll(".lm-disburse").forEach(b=>b.onclick=()=>openDisburse(apps.find(x=>x.id===b.dataset.id)));
          table.querySelectorAll(".lm-not-taken").forEach(b=>b.onclick=async()=>{const reason=prompt("Reason this approved application was not taken up:");if(!reason||reason.trim().length<5)return;try{const {error}=await db.rpc("gora2_loan_mark_not_taken_up",{_application_id:b.dataset.id,_reason:reason.trim()});if(error)throw error;ctx.toast("Application marked not taken up.");await refresh();}catch(err){alert(err.message);}});
        }
        function drawDisbursement(){
          const rows=filtered(apps.filter(a=>["APPROVED","READY_FOR_DISBURSEMENT"].includes(a.status)),"apps");
          table.innerHTML=rows.length?`<table class="data-table"><thead><tr><th>Application</th><th>Borrower</th><th>Approved</th><th>Due date</th><th>Action</th></tr></thead><tbody>${rows.map(a=>`<tr><td>${esc(a.application_number)}</td><td>${esc(memberName(a.member_id||a.individual_borrower_id))}</td><td>${money(a.approved_amount)}</td><td>${fmtDate(a.approved_first_repayment_date||a.first_repayment_date)}</td><td>${btn("Release loan","btn btn-primary lm-disburse",`data-id="${a.id}"`)}</td></tr>`).join("")}</tbody></table>`:'<div class="empty-state">No approved loans awaiting disbursement.</div>';
          table.querySelectorAll(".lm-disburse").forEach(b=>b.onclick=()=>openDisburse(apps.find(x=>x.id===b.dataset.id)));
        }
        async function drawRepayments(){
          const rows=await read("gora2_loan_repayments","*","payment_date");
          const all=rows.filter(r=>accounts.some(a=>a.id===r.loan_account_id));
          const q=(document.getElementById("lm-search").value||"").toLowerCase();
          const filteredRows=all.filter(r=>!q||`${accountNumber(r.loan_account_id)} ${r.reference_number||""}`.toLowerCase().includes(q));
          table.innerHTML=`<div class="heading-actions" style="padding:12px">${isLoanStaff(ctx)?btn("＋ Record repayment","btn btn-primary","id='lm-repay-new'"):""} ${btn("Bulk CSV repayments","btn btn-soft","id='lm-repay-import'")} ${btn("Export CSV","btn btn-soft","id='lm-repay-export'")}</div><input id="lm-repay-file" type="file" accept=".csv,text/csv" hidden>${filteredRows.length?`<table class="data-table"><thead><tr><th>Date</th><th>Loan</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th></tr></thead><tbody>${filteredRows.map(r=>`<tr><td>${fmtDate(r.payment_date)}</td><td>${esc(accountNumber(r.loan_account_id))}</td><td>${money(r.amount)}</td><td>${esc(r.payment_method)}</td><td>${esc(r.reference_number||"—")}</td><td>${pill(r.status)}</td></tr>`).join("")}</tbody></table>`:'<div class="empty-state">No repayments recorded.</div>'}`;
          if(document.getElementById("lm-repay-new"))document.getElementById("lm-repay-new").onclick=()=>openRepayment();
          document.getElementById("lm-repay-export").onclick=()=>exportCsv("gora2-repayments.csv",filteredRows);
          document.getElementById("lm-repay-import").onclick=()=>document.getElementById("lm-repay-file").click();
          document.getElementById("lm-repay-file").onchange=async e=>{const file=e.target.files?.[0];if(!file)return;await bulkRepayments(file);};
        }
        async function drawSchedules(){
          const schedules=await read("gora2_loan_schedules","*","due_date");
          const rows=accounts.filter(a=>a.status!=="NOT_TAKEN_UP").map(a=>({...a,member_label:memberName(a.member_id)}));
          const now=dateToday();
          const q=(document.getElementById("lm-search").value||"").toLowerCase(),st=document.getElementById("lm-status").value;
          const list=rows.filter(a=>(!q||`${a.account_number} ${a.member_label} ${productName(a.product_id)}`.toLowerCase().includes(q))&&(st==="ALL"||a.status===st));
          const balanceFor=s=>{
            const paid=schedules.filter(x=>x.loan_account_id===s.id);
            return paid.reduce((t,x)=>t+Number(x.total_due||0),0);
          };
          table.innerHTML=`<div class="heading-actions" style="padding:12px">${btn("Export collection sheet","btn btn-soft","id='lm-collection-export'")} ${btn("Print collection sheet","btn btn-soft","id='lm-collection-print'")} ${btn("Prepare bulk SMS list","btn btn-soft","id='lm-sms-list'")}</div>${list.length?`<table class="data-table" style="min-width:900px"><thead><tr><th>Loan number</th><th>Borrower</th><th>Product</th><th>Principal</th><th>Total due</th><th>Schedule</th><th>Status</th><th>Actions</th></tr></thead><tbody>${list.map(a=>{const ss=schedules.filter(s=>s.loan_account_id===a.id);const due=ss.filter(s=>s.due_date<=now&&s.status!=="PAID"&&s.status!=="WAIVED");const total=ss.reduce((n,s)=>n+Number(s.total_due||0),0);return `<tr><td><b>${esc(a.account_number)}</b></td><td>${esc(a.member_label||"Group")}</td><td>${esc(productName(a.product_id))}</td><td>${money(a.principal_amount)}</td><td>${money(total)}</td><td>${due.length?`${due.length} overdue`:`${ss.length} installments`}</td><td>${pill(a.status)}</td><td>${btn("Schedule","btn btn-soft lm-schedule",`data-id="${a.id}"`)} ${btn("Statement","btn btn-soft lm-statement",`data-id="${a.id}"`)} ${btn("Repay","btn btn-primary lm-pay",`data-id="${a.id}"`)} ${btn("Adjustment","btn btn-soft lm-adjust",`data-id="${a.id}"`)} ${isManager(ctx)&&a.status==="OPEN"?btn("Default","btn btn-soft lm-default",`data-id="${a.id}"`):""}</td></tr>`;}).join("")}</tbody></table>`:'<div class="empty-state">No loan accounts.</div>'}`;
          table.querySelectorAll(".lm-pay").forEach(b=>b.onclick=()=>openRepayment(accounts.find(a=>a.id===b.dataset.id)));
          table.querySelectorAll(".lm-statement").forEach(b=>b.onclick=()=>printStatement(accounts.find(a=>a.id===b.dataset.id),schedules));
          table.querySelectorAll(".lm-schedule").forEach(b=>b.onclick=()=>showSchedule(accounts.find(a=>a.id===b.dataset.id),schedules));
          table.querySelectorAll(".lm-adjust").forEach(b=>b.onclick=()=>adjustmentForm(accounts.find(a=>a.id===b.dataset.id)));
          table.querySelectorAll(".lm-default").forEach(b=>b.onclick=async()=>{const reason=prompt("Reason for marking this loan defaulted:");if(!reason||reason.trim().length<5)return;try{const {error}=await db.rpc("gora2_loan_set_account_status",{_loan_account_id:b.dataset.id,_new_status:"DEFAULTED",_reason:reason.trim()});if(error)throw error;ctx.toast("Loan marked defaulted.");await refresh();}catch(err){alert(err.message);}});
          document.getElementById("lm-collection-export").onclick=()=>exportCsv("gora2-collection-sheet.csv",list.map(a=>({loan_number:a.account_number,borrower:a.member_label,product:productName(a.product_id),principal:a.principal_amount,status:a.status})));
          document.getElementById("lm-collection-print").onclick=()=>window.print();
          document.getElementById("lm-sms-list").onclick=()=>prepareSms(list);
        }
      }

      function openNew(){
        if(activeView==="Loan Products")openProduct();
        else if(activeView==="Loan Applications"||activeView==="Assessment & Approval")openApplication();
        else if(activeView==="Repayments")openRepayment();
        else toast("Choose an application or loan account first.","error");
      }

      function openProduct(product=null,preset=null){
        const p=product||preset||{};
        const ed=document.getElementById("lm-editor");
        ed.innerHTML=`<div class="panel"><div class="panel-head"><h3>${product?"Edit":"Create"} loan product</h3>${btn("Close","btn btn-neutral","id='lm-close'")}</div>
          ${!product?`<label class="form-field">GORA product preset<select id="lm-preset"><option value="">Choose preset</option>${PRESETS.map(x=>`<option value="${x.code}">${x.name}</option>`).join("")}</select></label>`:""}
          <form id="lm-product-form"><div class="form-grid">
            ${field("Product name","pname",p.product_name||p.name||"","text","required")}
            ${field("Product code","pcode",p.product_code||p.code||"","text","required")}
            ${select("Category","pcat",["EMERGENCY","BUSINESS","CHRISTMAS","SCHOOL_FEES","HOSPITAL","ASSET","MOTORCYCLE","OTHER"],p.category||"EMERGENCY")}
            ${select("Borrower scope","scope",["MEMBER","INDIVIDUAL","GROUP","ANY"],p.borrower_scope||"MEMBER")}
            ${field("Minimum KES","pmin",p.minimum_amount??p.min??2000,"number",'min="1" required')}
            ${field("Maximum KES (blank = no cap)","pmax",p.maximum_amount??p.max??"","number",'min="1"')}
            ${field("Interest rate (%)","rate",p.interest_rate??p.rate??0,"number",'min="0" step="0.01" required')}
            ${select("Interest method","method",["FLAT","REDUCING_BALANCE"],p.interest_method|
