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
    {name:"Emergency",code:"EMERGENCY",category:"EMERGENCY",min:2000,max:15000,
     rate:20,period:"FOUR_WEEKS",termMin:4,termMax:4,unit:"WEEKS",frequency:"WEEKLY",grace:0},
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

  function weeksForUnit(unit) {
    if (unit === "DAYS") return 1 / 7;
    if (unit === "WEEKS") return 1;
    if (unit === "MONTHS") return 4.34524;
    return 1;
  }

  function weeksForInterestPeriod(period) {
    if (period === "WEEKLY") return 1;
    if (period === "FOUR_WEEKS") return 4;
    if (period === "MONTHLY") return 4.34524;
    if (period === "ANNUAL") return 52.14286;
    return 4;
  }

  function weeksForFrequency(frequency) {
    if (frequency === "WEEKLY") return 1;
    if (frequency === "BIWEEKLY") return 2;
    if (frequency === "MONTHLY") return 4.34524;
    return 1;
  }

  function attachInstallmentPreview(formId, previewId, getTerms) {
    const form = document.getElementById(formId);
    const preview = document.getElementById(previewId);
    if (!form || !preview) return;

    const update = () => {
      const terms = getTerms();
      const amount = Number(terms.amount || 0);
      const rate = Number(terms.rate || 0);
      const duration = Number(terms.duration || 0);

      if (!terms.product || amount <= 0 || duration <= 0) {
        preview.textContent =
          "Choose a loan product and enter the amount and duration to see the installment estimate.";
        return;
      }

      const termWeeks = duration * weeksForUnit(terms.unit);
      const cycleWeeks = weeksForFrequency(terms.frequency);
      const interestWeeks = weeksForInterestPeriod(terms.period);
      const payments = Math.max(1, Math.ceil(termWeeks / cycleWeeks));

      let interest = 0;
      let installment = 0;

      if (terms.method === "REDUCING_BALANCE") {
        const periodicRate =
          (rate / 100) * (cycleWeeks / interestWeeks);

        if (periodicRate > 0) {
          installment =
            amount * periodicRate /
            (1 - Math.pow(1 + periodicRate, -payments));
        } else {
          installment = amount / payments;
        }

        interest = Math.max(0, installment * payments - amount);
      } else {
        interest =
          amount * (rate / 100) * (termWeeks / interestWeeks);

        installment = (amount + interest) / payments;
      }

      let fee = 0;
      if (terms.feeType === "FIXED") {
        fee = Number(terms.feeValue || 0);
      } else if (terms.feeType === "PERCENTAGE") {
        fee = amount * Number(terms.feeValue || 0) / 100;
      }

      const total = amount + interest + fee;
      installment += fee / payments;

      preview.innerHTML = `
        <b>Automatic repayment estimate</b>
        <div class="detail-grid">
          <div><span>Interest rate</span><b>${rate.toFixed(2)}%</b></div>
          <div><span>Total interest</span><b>${money(interest)}</b></div>
          <div><span>Processing fee</span><b>${money(fee)}</b></div>
          <div><span>Total repayment</span><b>${money(total)}</b></div>
          <div><span>Number of installments</span><b>${payments}</b></div>
          <div><span>Estimated installment</span><b>${money(installment)}</b></div>
        </div>
        <small class="small-note">
          Estimate only. The approved loan schedule and final rounding
          are generated during disbursement.
        </small>
      `;
    };

    form.addEventListener("input", update);
    form.addEventListener("change", update);
    update();
      }
  
  window.GORALoanModule = {
    handles: name => MODULES.has(name),
    async render(moduleName,ctx) {
      const root=document.getElementById("pageContent");
      if(!root || !ctx?.db || !ctx?.organization?.id) {
        if(root) root.innerHTML='<div class="panel">Loan module connection context is missing.</div>';
        return;
      }
      const db=ctx.db, org=ctx.organization.id, user=ctx.authUser?.id;
      let products=[],apps=[],accounts=[],members=[],groups=[],individuals=[],memberships=[],activeView=moduleName;
      root.innerHTML='<div class="loading-panel">Loading loan module…</div>';
      try {
        [products,apps,accounts,members,groups,individuals,memberships]=await Promise.all([
          read("gora2_loan_products","*","product_name"),
          read("gora2_loan_applications","*","applied_at"),
          read("gora2_loan_accounts","*","created_at"),
          read("members","id,member_number,first_name,last_name,business_name,full_name,phone,status,chama_group_id,branch_id","first_name"),
          read("chama_groups","id,group_code,group_name,status","group_name"),
          read("individual_borrowers","id,borrower_number,full_name,phone,status,branch_id","full_name"),
          read("chama_memberships","member_id,group_id,status","created_at")
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
        if(m)return m.business_name||m.full_name||`${m.first_name||""} ${m.last_name||""}`.trim();
        const b=individuals.find(x=>x.id===id);
        return b?(b.business_name||b.full_name||b.borrower_number):"—";
      };
      const productName=id=>products.find(x=>x.id===id)?.product_name||"—";
      const accountNumber=id=>accounts.find(x=>x.id===id)?.account_number||"—";
      const groupName=id=>groups.find(g=>g.id===id)?.group_name||"Group";
      const borrowerName=row=>row?.borrower_type==="GROUP"?groupName(row.group_id):memberName(row?.member_id||row?.individual_borrower_id);
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
          table.innerHTML=rows.length?`<table class="data-table" style="min-width:900px"><thead><tr><th>Application</th><th>Borrower</th><th>Product</th><th>Requested</th><th>Term / cycle</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map(a=>`<tr><td><b>${esc(a.application_number)}</b><small>${fmtDate(a.applied_at)}</small></td><td>${esc(borrowerName(a))}</td><td>${esc(productName(a.product_id))}</td><td>${money(a.requested_amount)}</td><td>${a.requested_duration} ${esc(a.requested_duration_unit)} · ${esc(a.requested_repayment_frequency)}</td><td>${pill(a.status)}</td><td>${btn("Review","btn btn-soft lm-review",`data-id="${a.id}"`)} ${isManager(ctx)&&a.status==="READY_FOR_DISBURSEMENT"?btn("Disburse","btn btn-primary lm-disburse",`data-id="${a.id}"`):""} ${isManager(ctx)&&["PROCESSING","UNDER_REVIEW","READY_FOR_DISBURSEMENT"].includes(a.status)?btn("Not taken up","btn btn-soft lm-not-taken",`data-id="${a.id}"`):""}</td></tr>`).join("")}</tbody></table>`:'<div class="empty-state">No loan applications found.</div>';
          table.querySelectorAll(".lm-review").forEach(b=>b.onclick=()=>reviewApplication(apps.find(x=>x.id===b.dataset.id)));
          table.querySelectorAll(".lm-disburse").forEach(b=>b.onclick=()=>openDisburse(apps.find(x=>x.id===b.dataset.id)));
          table.querySelectorAll(".lm-not-taken").forEach(b=>b.onclick=async()=>{const reason=prompt("Reason this approved application was not taken up:");if(!reason||reason.trim().length<5)return;try{const {error}=await db.rpc("gora2_loan_mark_not_taken_up",{_application_id:b.dataset.id,_reason:reason.trim()});if(error)throw error;ctx.toast("Application marked not taken up.");await refresh();}catch(err){alert(err.message);}});
        }
        function drawDisbursement(){
          const rows=filtered(apps.filter(a=>a.status==="READY_FOR_DISBURSEMENT"),"apps");
          table.innerHTML=rows.length?`<table class="data-table"><thead><tr><th>Application</th><th>Borrower</th><th>Approved</th><th>Due date</th><th>Action</th></tr></thead><tbody>${rows.map(a=>`<tr><td>${esc(a.application_number)}</td><td>${esc(borrowerName(a))}</td><td>${money(a.approved_amount)}</td><td>${fmtDate(a.approved_first_repayment_date||a.first_repayment_date)}</td><td>${btn("Release loan","btn btn-primary lm-disburse",`data-id="${a.id}"`)}</td></tr>`).join("")}</tbody></table>`:'<div class="empty-state">No approved loans awaiting disbursement.</div>';
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
          const [schedules,allocations,repayments]=await Promise.all([
            read("gora2_loan_schedules","*","due_date"),
            read("gora2_loan_allocations","schedule_id,repayment_id,amount","created_at"),
            read("gora2_loan_repayments","id,status","payment_date")
          ]);
          const postedRepaymentIds=new Set(repayments.filter(r=>r.status==="POSTED").map(r=>r.id));
          const paidBySchedule=new Map();
          allocations.filter(x=>postedRepaymentIds.has(x.repayment_id)).forEach(x=>paidBySchedule.set(x.schedule_id,(paidBySchedule.get(x.schedule_id)||0)+Number(x.amount||0)));
          const scheduleOutstanding=s=>Math.round(Math.max(0,Number(s.total_due||0)-(paidBySchedule.get(s.id)||0))*100)/100;
          const rows=accounts.filter(a=>a.status!=="NOT_TAKEN_UP").map(a=>({...a,member_label:borrowerName(a)}));
          const now=dateToday();
          const q=(document.getElementById("lm-search").value||"").toLowerCase(),st=document.getElementById("lm-status").value;
          const list=rows.filter(a=>(!q||`${a.account_number} ${a.member_label} ${productName(a.product_id)}`.toLowerCase().includes(q))&&(st==="ALL"||a.status===st));
          const balanceFor=s=>{
            const paid=schedules.filter(x=>x.loan_account_id===s.id);
            return paid.reduce((t,x)=>t+Number(x.total_due||0),0);
          };
          table.innerHTML=`<div class="heading-actions" style="padding:12px">${btn("Export collection sheet","btn btn-soft","id='lm-collection-export'")} ${btn("Print collection sheet","btn btn-soft","id='lm-collection-print'")} ${btn("Prepare bulk SMS list","btn btn-soft","id='lm-sms-list'")}</div>${list.length?`<table class="data-table" style="min-width:900px"><thead><tr><th>Loan number</th><th>Borrower</th><th>Product</th><th>Principal</th><th>Total repayment</th><th>Outstanding</th><th>Overdue installments</th><th>Status</th><th>Actions</th></tr></thead><tbody>${list.map(a=>{const ss=schedules.filter(s=>s.loan_account_id===a.id);const due=ss.filter(s=>s.due_date<now&&s.status!=="WAIVED"&&scheduleOutstanding(s)>0);const total=ss.reduce((n,s)=>n+Number(s.total_due||0),0);const outstanding=ss.reduce((n,s)=>n+scheduleOutstanding(s),0);return `<tr><td><b>${esc(a.account_number)}</b></td><td>${esc(a.member_label||"Group")}</td><td>${esc(productName(a.product_id))}</td><td>${money(a.principal_amount)}</td><td>${money(total)}</td><td><b>${money(outstanding)}</b></td><td>${due.length}</td><td>${pill(a.status)}</td><td>${btn("Schedule","btn btn-soft lm-schedule",`data-id="${a.id}"`)} ${btn("Statement","btn btn-soft lm-statement",`data-id="${a.id}"`)} ${btn("Repay","btn btn-primary lm-pay",`data-id="${a.id}"`)} ${btn("Adjustment","btn btn-soft lm-adjust",`data-id="${a.id}"`)} ${isManager(ctx)&&a.status==="OPEN"?btn("Default","btn btn-soft lm-default",`data-id="${a.id}"`):""}</td></tr>`;}).join("")}</tbody></table>`:'<div class="empty-state">No loan accounts.</div>'}`;
          table.querySelectorAll(".lm-pay").forEach(b=>b.onclick=()=>openRepayment(accounts.find(a=>a.id===b.dataset.id)));
          table.querySelectorAll(".lm-statement").forEach(b=>b.onclick=()=>printStatement(accounts.find(a=>a.id===b.dataset.id),schedules));
          table.querySelectorAll(".lm-schedule").forEach(b=>b.onclick=()=>showSchedule(accounts.find(a=>a.id===b.dataset.id),schedules,allocations,postedRepaymentIds));
          table.querySelectorAll(".lm-adjust").forEach(b=>b.onclick=()=>adjustmentForm(accounts.find(a=>a.id===b.dataset.id)));
          table.querySelectorAll(".lm-default").forEach(b=>b.onclick=async()=>{const reason=prompt("Reason for marking this loan defaulted:");if(!reason||reason.trim().length<5)return;try{const {error}=await db.rpc("gora2_loan_set_account_status",{_loan_account_id:b.dataset.id,_new_status:"DEFAULTED",_reason:reason.trim()});if(error)throw error;ctx.toast("Loan marked defaulted.");await refresh();}catch(err){alert(err.message);}});
          document.getElementById("lm-collection-export").onclick=()=>exportCsv("gora2-collection-sheet.csv",list.map(a=>{const ss=schedules.filter(s=>s.loan_account_id===a.id);return {loan_number:a.account_number,borrower:a.member_label,product:productName(a.product_id),principal:a.principal_amount,total_repayment:ss.reduce((n,s)=>n+Number(s.total_due||0),0),outstanding:ss.reduce((n,s)=>n+scheduleOutstanding(s),0),overdue_installments:ss.filter(s=>s.due_date<now&&s.status!=="WAIVED"&&scheduleOutstanding(s)>0).length,status:a.status};}));
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
            ${select("Interest method","method",["FLAT","REDUCING_BALANCE"],p.interest_method||"FLAT")}
            ${select("Interest period","period",["WEEKLY","FOUR_WEEKS","MONTHLY","ANNUAL"],p.interest_period||p.period||"FOUR_WEEKS")}
            ${field("Minimum term","tmin",p.duration_min??p.termMin??4,"number",'min="1" required')}
            ${field("Maximum term","tmax",p.duration_max??p.termMax??4,"number",'min="1" required')}
            ${select("Term unit","unit",["DAYS","WEEKS","MONTHS"],p.duration_unit||p.unit||"WEEKS")}
            ${select("Repayment cycle","freq",["WEEKLY","BIWEEKLY","MONTHLY"],p.repayment_frequency||p.frequency||"WEEKLY")}
            ${field("Grace period","grace",p.grace_period_count??p.grace??0,"number",'min="0" required')}
            ${select("Grace unit","graceUnit",["DAYS","WEEKS","MONTHS"],p.grace_period_unit||"WEEKS")}
            ${select("Processing fee type","feeType",["NONE","FIXED","PERCENTAGE"],p.processing_fee_type||"NONE")}
            ${field("Processing fee value","feeValue",p.processing_fee_value??0,"number",'min="0" step="0.01"')}
            ${select("Late penalty type","penaltyType",["NONE","FIXED","PERCENTAGE"],p.late_penalty_type||"NONE")}
            ${field("Late penalty value","penaltyValue",p.late_penalty_value??0,"number",'min="0" step="0.01"')}
            ${field("Minimum savings balance","minSavings",p.minimum_savings_balance??0,"number",'min="0" step="0.01"')}
            <label class="form-field">Require guarantors<input id="lm-requires-guarantors" type="checkbox" ${(p.requires_guarantors??true)?"checked":""}></label>
            <label class="form-field">Require collateral<input id="lm-requires-collateral" type="checkbox" ${(p.requires_collateral??false)?"checked":""}></label>
            ${field("Product description","pdescription",p.description||"","text")}
            ${select("Status","pstatus",["ACTIVE","INACTIVE"],p.status||"INACTIVE")}
          </div><p class="message" id="lm-product-msg"></p><button class="btn btn-primary" type="submit">Save product</button></form></div>`;
        document.getElementById("lm-close").onclick=()=>ed.innerHTML="";
        const ps=document.getElementById("lm-preset");
        if(ps)ps.onchange=()=>openProduct(null,PRESETS.find(x=>x.code===ps.value));
        document.getElementById("lm-product-form").onsubmit=async e=>{
          e.preventDefault();
          const payload={organization_id:org,product_name:val("pname").trim(),product_code:val("pcode").trim().toUpperCase(),category:val("pcat"),borrower_scope:val("scope"),minimum_amount:Number(val("pmin")),maximum_amount:val("pmax")===""?null:Number(val("pmax")),interest_rate:Number(val("rate")),interest_method:val("method"),interest_period:val("period"),duration_min:Number(val("tmin")),duration_max:Number(val("tmax")),duration_unit:val("unit"),repayment_frequency:val("freq"),grace_period_count:Number(val("grace")||0),grace_period_unit:val("graceUnit"),processing_fee_type:val("feeType"),processing_fee_value:Number(val("feeValue")||0),late_penalty_type:val("penaltyType"),late_penalty_value:Number(val("penaltyValue")||0),minimum_savings_balance:Number(val("minSavings")||0),requires_guarantors:document.getElementById("lm-requires-guarantors").checked,requires_collateral:document.getElementById("lm-requires-collateral").checked,description:val("pdescription")||null,status:val("pstatus"),updated_at:new Date().toISOString()};
          if(!product)payload.created_by=user;
          if(payload.maximum_amount!==null&&payload.maximum_amount<payload.minimum_amount){document.getElementById("lm-product-msg").textContent="Maximum must be at least minimum.";return;}
          try{const r=product?await db.from("gora2_loan_products").update(payload).eq("id",product.id).eq("organization_id",org):await db.from("gora2_loan_products").insert(payload);if(r.error)throw r.error;ctx.toast("Loan product saved.");ed.innerHTML="";await refresh();}catch(err){document.getElementById("lm-product-msg").textContent=err.message;}
        };
      }

      function openApplication(){
        if(!isLoanStaff(ctx)){ctx.toast("Loan officer or manager permission required.","error");return;}
        const ed=document.getElementById("lm-editor");
        ed.innerHTML=`<div class="panel"><div class="panel-head"><h3>New loan application</h3>${btn("Close","btn btn-neutral","id='lm-close'")}</div>
          <form id="lm-app-form"><div class="form-grid">
            <label class="form-field">Loan product<select id="lm-product" required><option value="">Select product</option>${products.filter(p=>p.status==="ACTIVE").map(p=>`<option value="${p.id}">${esc(p.product_name)} · ${esc(p.product_code)}</option>`).join("")}</select></label>
            ${select("Borrower type","btype",["MEMBER","INDIVIDUAL","GROUP"],"MEMBER")}
            
<label class="form-field" id="lm-member-wrap">
  Member
  <select id="lm-member" required>
    <option value="">Select member</option>
    ${members
      ..filter(m => String(m.status || "").toUpperCase() === "ACTIVE")
      .map(m => `
        <option
          value="${m.id}"
          ${ctx.selectedBorrowerId === m.id ? "selected" : ""}
        >
          ${esc(m.member_number || "")}
          ${esc(memberName(m.id))}
        </option>
      `)
      .join("")}
  </select>
</label>

            <label class="form-field hidden" id="lm-individual-wrap">Individual borrower<select id="lm-individual"><option value="">Select borrower</option>${individuals.filter(b=>b.status==="ACTIVE").map(b=>`<option value="${b.id}">${esc(b.borrower_number||"")} ${esc(b.full_name||b.business_name||"")}</option>`).join("")}</select></label>
            <label class="form-field hidden" id="lm-group-wrap">Chama / group<select id="lm-group"><option value="">Select group</option>${groups.filter(g=>g.status==="ACTIVE").map(g=>`<option value="${g.id}">${esc(g.group_name)}</option>`).join("")}</select></label>
            ${field("Requested amount (KES)","amount","","number",'min="1" required')}
            ${field("Product interest rate (%)","appRate","","number",'min="0" step="0.01" readonly')}
            ${field("Duration","duration","4","number",'min="1" required')}
            ${select("Duration unit","dunit",["DAYS","WEEKS","MONTHS"],"WEEKS")}
            ${select("Repayment cycle","cycle",["WEEKLY","BIWEEKLY","MONTHLY"],"WEEKLY")}
            ${field("Purpose","purpose","","text","required")}
            <label class="form-field">Branch<select id="lm-branch"><option value="">No branch selected</option>${(ctx.branches||[]).map(b=>`<option value="${b.id}">${esc(b.branch_name)}</option>`).join("")}</select></label>
            ${field("First repayment date (optional)","firstDate","","date")}
            ${field("First repayment amount (optional)","firstAmount","","number",'min="0.01" step="0.01"')}
            ${field("Monthly income","income","","number",'min="0" step="0.01"')}
            ${field("Monthly expenses","expenses","","number",'min="0" step="0.01"')}
            ${field("Existing monthly debt","debt","","number",'min="0" step="0.01"')}
            ${field("Credit score (0–1000)","score","","number",'min="0" max="1000"')}
            ${select("Field check","fieldCheck",["NOT_DONE","PASS","FAIL","NOT_REQUIRED"],"NOT_DONE")}
            ${field("Assessment / KYC notes","notes","","text")}
          </div>
<div class="note-box" id="lm-app-preview">
  Choose a product and enter the amount to calculate installments.
</div>
<p class="message" id="lm-app-msg"></p><button class="btn btn-primary" type="submit">Submit application for processing</button></form></div>`;
        document.getElementById("lm-close").onclick=()=>ed.innerHTML="";
        
        const productSelect = document.getElementById("lm-product");

        productSelect.addEventListener("change", () => {
          const p = products.find(x => x.id === val("product"));
          if (!p) return;

          val("appRate");
          document.getElementById("lm-appRate").value =
            Number(p.interest_rate || 0);

          document.getElementById("lm-duration").value =
            Number(p.duration_min || 1);

          document.getElementById("lm-duration").min =
            Number(p.duration_min || 1);

          document.getElementById("lm-duration").max =
            Number(p.duration_max || p.duration_min || 1);

          document.getElementById("lm-dunit").value =
            p.duration_unit || "WEEKS";

          document.getElementById("lm-cycle").value =
            p.repayment_frequency || "WEEKLY";

          document.getElementById("lm-dunit").disabled = true;
          document.getElementById("lm-cycle").disabled = true;
        });

        attachInstallmentPreview(
          "lm-app-form",
          "lm-app-preview",
          () => {
            const p = products.find(x => x.id === val("product"));
            return {
              product: p,
              amount: val("amount"),
              rate: val("appRate") || p?.interest_rate,
              duration: val("duration"),
              unit: val("dunit"),
              frequency: val("cycle"),
              method: p?.interest_method || "FLAT",
              period: p?.interest_period || "FOUR_WEEKS",
              feeType: p?.processing_fee_type || "NONE",
              feeValue: p?.processing_fee_value || 0
            };
          }
        );
        
        document.getElementById("lm-btype")?.addEventListener("change",e=>{
          document.getElementById("lm-member-wrap").classList.toggle("hidden",e.target.value!=="MEMBER");
          document.getElementById("lm-individual-wrap").classList.toggle("hidden",e.target.value!=="INDIVIDUAL");
          document.getElementById("lm-group-wrap").classList.toggle("hidden",e.target.value!=="GROUP");
        });
        document.getElementById("lm-app-form").onsubmit=async e=>{
          e.preventDefault();
          const p=products.find(x=>x.id===val("product"));
          const amount=Number(val("amount")),duration=Number(val("duration"));
          if (
  !p ||
  amount < p.minimum_amount ||
  (p.maximum_amount !== null && amount > p.maximum_amount) ||
  duration < p.duration_min ||
  duration > p.duration_max ||
  val("dunit") !== p.duration_unit ||
  val("cycle") !== p.repayment_frequency
) {
  document.getElementById("lm-app-msg").textContent =
    "Amount, duration or repayment cycle is outside the selected product terms.";
  return;
          }
          const btype=val("btype"),memberId=btype==="MEMBER"?val("member"):null,groupId=btype==="GROUP"?val("group"):null;
          const payload={organization_id:org,product_id:p.id,borrower_type:btype,member_id:memberId,individual_borrower_id:btype==="INDIVIDUAL"?val("individual"):null,group_id:groupId,branch_id:val("branch")||null,requested_amount:amount,requested_duration:duration,requested_duration_unit:val("dunit"),requested_repayment_frequency:val("cycle"),purpose:val("purpose").trim(),first_repayment_date:val("firstDate")||null,first_repayment_amount:val("firstAmount")?Number(val("firstAmount")):null,assessment_monthly_income:val("income")?Number(val("income")):null,assessment_monthly_expenses:val("expenses")?Number(val("expenses")):null,assessment_existing_debt:val("debt")?Number(val("debt")):null,assessment_credit_score:val("score")?Number(val("score")):null,assessment_field_check:val("fieldCheck"),assessment_notes:val("notes")||null,custom_fields:{},kyc_snapshot:{}};
          try{const {data,error}=await db.rpc("gora2_loan_submit_application",{_payload:payload});if(error)throw error;ctx.toast("Application submitted for processing.");ed.innerHTML="";await refresh();}catch(err){document.getElementById("lm-app-msg").textContent=err.message;}
        };
      }

      async function reviewApplication(a){
        if(!a)return;
        if(!["PROCESSING","UNDER_REVIEW","PENDING_APPROVAL","RETURNED"].includes(a.status)){ctx.toast("This application is closed and cannot be sent back to review.","error");return;}
        const ed=document.getElementById("lm-editor");
        const fees=await readOne("gora2_loan_application_fee_payments","application_id",a.id);
        const gs=await readOne("gora2_loan_guarantors","application_id",a.id);
        const col=await readOne("gora2_loan_collateral","application_id",a.id);
        const docs=await readOne("gora2_loan_documents","application_id",a.id);
        ed.innerHTML=`<div class="panel"><div class="panel-head"><div><h3>Review ${esc(a.application_number)}</h3><p>${esc(borrowerName(a))} · ${esc(productName(a.product_id))}</p></div>${btn("Close","btn btn-neutral","id='lm-close'")}</div>
          <div class="detail-grid"><div><span>Requested</span><b>${money(a.requested_amount)}</b></div><div><span>Term</span><b>${a.requested_duration} ${esc(a.requested_duration_unit)}</b></div><div><span>Cycle</span><b>${esc(a.requested_repayment_frequency)}</b></div><div><span>Status</span><b>${pill(a.status)}</b></div></div>
          <div class="heading-actions">${btn("Record processing fee","btn btn-soft","id='lm-fee'")} ${btn("Add guarantor","btn btn-soft","id='lm-guarantor'")} ${btn("Add collateral","btn btn-soft","id='lm-collateral'")} ${btn("Add comment","btn btn-soft","id='lm-comment'")} ${btn("Add document record","btn btn-soft","id='lm-doc'")}</div>
          <div class="profile-subhead">Fees (${fees.length}) · Guarantors (${gs.length}) · Collateral (${col.length}) · Documents (${docs.length})</div>
          ${isManager(ctx)&&fees.some(f=>f.status==="PENDING")?btn("Verify pending fee","btn btn-soft","id='lm-fee-verify'"):""}
          <form id="lm-assess"><div class="form-grid">
            ${field("Monthly income","ai",a.assessment_monthly_income??"","number",'min="0" step="0.01"')}
            ${field("Monthly expenses","ae",a.assessment_monthly_expenses??"","number",'min="0" step="0.01"')}
            ${field("Existing monthly debt","ad",a.assessment_existing_debt??"","number",'min="0" step="0.01"')}
            ${field("Credit score","as",a.assessment_credit_score??"","number",'min="0" max="1000"')}
            ${select("Field check","af",["NOT_DONE","PASS","FAIL","NOT_REQUIRED"],a.assessment_field_check||"NOT_DONE")}
            ${field("Assessment notes","an",a.assessment_notes||"","text")}
          </div><button class="btn btn-soft" type="submit">Save assessment</button><p id="lm-assess-msg" class="message"></p></form>
          ${isManager(ctx)?`<form id="lm-approve"><h4>Final decision (maker-checker)</h4><div class="form-grid">
            ${field("Approved amount","aa",a.approved_amount??a.requested_amount,"number",'min="1" required')}
            ${field("Interest rate (%)","ar",a.approved_interest_rate??products.find(p=>p.id===a.product_id)?.interest_rate??0,"number",'min="0" step="0.01" required')}
            ${select("Interest method","am",["FLAT","REDUCING_BALANCE"],a.approved_interest_method||products.find(p=>p.id===a.product_id)?.interest_method||"FLAT")}
            ${select("Interest period","ap",["WEEKLY","FOUR_WEEKS","MONTHLY","ANNUAL"],a.approved_interest_period||products.find(p=>p.id===a.product_id)?.interest_period||"FOUR_WEEKS")}
            ${field("Approved term","aduration",a.approved_duration??a.requested_duration,"number",'min="1" required')}
            ${select("Term unit","adu",["DAYS","WEEKS","MONTHS"],a.approved_duration_unit||a.requested_duration_unit)}
            ${select("Repayment cycle","afreq",["WEEKLY","BIWEEKLY","MONTHLY"],a.approved_repayment_frequency||a.requested_repayment_frequency)}
            ${field("Grace period","ag",a.approved_grace_period_count??products.find(p=>p.id===a.product_id)?.grace_period_count??0,"number",'min="0"')}
            ${select("Grace unit","agu",["DAYS","WEEKS","MONTHS"],a.approved_grace_period_unit||products.find(p=>p.id===a.product_id)?.grace_period_unit||"WEEKS")}
            ${field("First repayment date","afd",a.approved_first_repayment_date||a.first_repayment_date||"","date")}
            ${field("First repayment amount","afa",a.approved_first_repayment_amount??a.first_repayment_amount??"","number",'min="0.01" step="0.01"')}
            ${field("Decision notes","dn","","text")}
          </div><div class="heading-actions"><button class="btn btn-primary" type="submit" name="decision" value="APPROVE">Approve</button><button class="btn btn-soft" type="submit" name="decision" value="RETURN">Return for correction</button><button class="btn btn-danger" type="submit" name="decision" value="REJECT">Reject</button></div></form>`:""}
        </div>`;
        document.getElementById("lm-close").onclick=()=>ed.innerHTML="";
        document.getElementById("lm-assess").onsubmit=async e=>{e.preventDefault();try{const upd={assessment_monthly_income:val("ai")?Number(val("ai")):null,assessment_monthly_expenses:val("ae")?Number(val("ae")):null,assessment_existing_debt:val("ad")?Number(val("ad")):null,assessment_credit_score:val("as")?Number(val("as")):null,assessment_field_check:val("af"),assessment_notes:val("an")};const {error}=await db.from("gora2_loan_applications").update(upd).eq("id",a.id).eq("organization_id",org);if(error)throw error;const review=await db.rpc("gora2_loan_start_review",{_application_id:a.id});if(review.error)throw review.error;ctx.toast("Assessment saved and review started.");await refresh();}catch(err){document.getElementById("lm-assess-msg").textContent=err.message;}};
        if(document.getElementById("lm-approve"))document.getElementById("lm-approve").onsubmit=async e=>{e.preventDefault();const decision=e.submitter?.value||"APPROVE";const terms={approved_amount:Number(val("aa")),approved_interest_rate:Number(val("ar")),approved_interest_method:val("am"),approved_interest_period:val("ap"),approved_duration:Number(val("aduration")),approved_duration_unit:val("adu"),approved_repayment_frequency:val("afreq"),approved_grace_period_count:Number(val("ag")||0),approved_grace_period_unit:val("agu"),approved_first_repayment_date:val("afd")||null,approved_first_repayment_amount:val("afa")?Number(val("afa")):null};try{const {error}=await db.rpc("gora2_loan_approve",{_application_id:a.id,_decision:decision,_terms:terms,_notes:val("dn")});if(error)throw error;ctx.toast("Application decision recorded.");ed.innerHTML="";await refresh();}catch(err){alert(err.message);}};
        document.getElementById("lm-fee").onclick=()=>feeForm(a);
        if(document.getElementById("lm-fee-verify"))document.getElementById("lm-fee-verify").onclick=async()=>{
          const pending=fees.find(f=>f.status==="PENDING");
          if(!pending)return;
          try{const {error}=await db.rpc("gora2_loan_verify_fee",{_fee_payment_id:pending.id,_approve:true,_notes:"Verified by authorised manager"});if(error)throw error;ctx.toast("Fee verified.");await reviewApplication(a);}catch(err){alert(err.message);}
        };
        document.getElementById("lm-guarantor").onclick=()=>guarantorForm(a);
        document.getElementById("lm-collateral").onclick=()=>collateralForm(a);
        document.getElementById("lm-comment").onclick=()=>commentForm(a.id,null);
        document.getElementById("lm-doc").onclick=()=>documentForm(a.id,null);
      }

      async function readOne(table,key,id){const {data,error}=await db.from(table).select("*").eq("organization_id",org).eq(key,id);if(error)throw error;return data||[];}
      function feeForm(a){const ed=document.getElementById("lm-editor");ed.insertAdjacentHTML("beforeend",`<div class="panel"><h4>Record processing fee payment</h4><form id="lm-fee-form" class="form-grid">${field("Amount KES","famount","","number",'min="0.01" step="0.01" required')}${select("Method","fmethod",["CASH","MPESA","BANK"],"MPESA")}${field("Reference","fref")}${field("Notes","fnotes")}</form>${btn("Save fee payment","btn btn-primary","id='lm-fee-save'")}</div>`);document.getElementById("lm-fee-save").onclick=async()=>{try{if(!document.getElementById("lm-fee-form").reportValidity())return;const {error}=await db.from("gora2_loan_application_fee_payments").insert({organization_id:org,application_id:a.id,amount:Number(val("famount")),payment_method:val("fmethod"),reference_number:val("fref")||null,notes:val("fnotes")||null,recorded_by:user,status:"PENDING"});if(error)throw error;ctx.toast("Fee recorded pending verification.");await reviewApplication(a);}catch(e){alert(e.message);}};}
      function guarantorForm(a){
        const ed=document.getElementById("lm-editor");
        const requiredGroup=a.borrower_type==="GROUP"?a.group_id:(a.borrower_type==="MEMBER"?a.group_id:null);
        const eligible=members.filter(m=>m.status==="ACTIVE"&&m.id!==a.member_id&&(!requiredGroup||memberships.some(x=>x.member_id===m.id&&x.group_id===requiredGroup&&x.status==="ACTIVE")));
        ed.insertAdjacentHTML("beforeend",`<div class="panel"><h4>Add guarantor</h4><form id="lm-guarantor-form"><label class="form-field">Active member<select id="lm-gmember" required>${eligible.map(m=>`<option value="${m.id}">${esc(memberName(m.id))} (${esc(m.member_number||"")})</option>`).join("")}</select></label>${select("Consent","gconsent",["PENDING","CONSENTED","DECLINED"],"PENDING")}${field("Consent notes (required if consented)","gnotes")}</form>${btn("Save guarantor","btn btn-primary","id='lm-gsave'")}</div>`);
        document.getElementById("lm-gsave").onclick=async()=>{try{if(!eligible.length)throw new Error(requiredGroup?"No active member from this chama is available as guarantor.":"No active GORA member is available as guarantor.");if(!document.getElementById("lm-guarantor-form").reportValidity())return;const consent=val("gconsent"),notes=val("gnotes").trim();if(consent==="CONSENTED"&&notes.length<5)throw new Error("Record how and when the guarantor gave consent (at least 5 characters) before saving.");const {error}=await db.from("gora2_loan_guarantors").insert({organization_id:org,application_id:a.id,guarantor_member_id:val("gmember"),consent_status:consent,consent_recorded_by:consent==="CONSENTED"?user:null,consent_recorded_at:consent==="CONSENTED"?new Date().toISOString():null,consent_notes:notes||null});if(error)throw error;ctx.toast("Guarantor added.");await reviewApplication(a);}catch(e){alert(e.message);}};}
      function collateralForm(a){
        const ed=document.getElementById("lm-editor");
        const verification=isManager(ctx)?select("Verification status","cverify",["PENDING","VERIFIED","REJECTED"],"PENDING"):select("Verification status","cverify",["PENDING"],"PENDING");
        ed.insertAdjacentHTML("beforeend",`<div class="panel"><h4>Record collateral</h4><form id="lm-collateral-form" class="form-grid">${field("Type","ctype","","text","required")}${field("Description","cdesc","","text","required")}${field("Estimated value KES","cvalue","","number",'min="0" step="0.01"')}${field("Serial / title number","ctitle")}${verification}</form>${btn("Save collateral","btn btn-primary","id='lm-csave'")}</div>`);
        document.getElementById("lm-csave").onclick=async()=>{try{if(!document.getElementById("lm-collateral-form").reportValidity())return;const status=val("cverify");const {error}=await db.from("gora2_loan_collateral").insert({organization_id:org,application_id:a.id,collateral_type:val("ctype"),description:val("cdesc"),estimated_value:val("cvalue")?Number(val("cvalue")):null,serial_or_title_number:val("ctitle")||null,verification_status:status,verified_by:status==="VERIFIED"?user:null,verified_at:status==="VERIFIED"?new Date().toISOString():null,created_by:user});if(error)throw error;ctx.toast(status==="VERIFIED"?"Collateral recorded as verified.":"Collateral record saved.");await reviewApplication(a);}catch(e){alert(e.message);}};
      }
      function commentForm(applicationId,loanAccountId){const ed=document.getElementById("lm-editor");ed.insertAdjacentHTML("beforeend",`<div class="panel"><h4>Add comment</h4><textarea id="lm-comment-text" rows="3" placeholder="Write a note…" required></textarea>${btn("Save comment","btn btn-primary","id='lm-comment-save'")}</div>`);document.getElementById("lm-comment-save").onclick=async()=>{try{if(val("comment-text").trim().length<2)throw new Error("Enter a comment before saving.");const {error}=await db.from("gora2_loan_comments").insert({organization_id:org,application_id:applicationId,loan_account_id:loanAccountId,comment_text:val("comment-text").trim(),created_by:user});if(error)throw error;ctx.toast("Comment saved.");}catch(e){alert(e.message);}};}
      function documentForm(applicationId,loanAccountId){const ed=document.getElementById("lm-editor");ed.insertAdjacentHTML("beforeend",`<div class="panel"><h4>Add document record</h4><p class="small-note">This records a file already uploaded to the private GORA loan-documents bucket. It does not upload the file from this screen.</p><form id="lm-doc-form" class="form-grid">${field("Document type","dtype","","text","required")}${field("Filename","dname","","text","required")}${field("Storage path","dpath","","text","required")}${field("MIME type","dmime")}</form>${btn("Save document record","btn btn-primary","id='lm-doc-save'")}</div>`);document.getElementById("lm-doc-save").onclick=async()=>{try{const {error}=await db.from("gora2_loan_documents").insert({organization_id:org,application_id:applicationId,loan_account_id:loanAccountId,document_type:val("dtype"),original_filename:val("dname"),storage_path:val("dpath"),mime_type:val("dmime")||null,uploaded_by:user});if(error)throw error;ctx.toast("Document record saved.");}catch(e){alert(e.message);}};}

      function openDisburse(a){
        if(!a)return;const ed=document.getElementById("lm-editor");
        ed.innerHTML=`<div class="panel"><h3>Disburse ${esc(a.application_number)}</h3><form id="lm-disb-form" class="form-grid">${field("Release date","release",dateToday(),"date","required")}${field("First repayment date (blank = grace-period default)","due",a.approved_first_repayment_date||a.first_repayment_date||"","date")}${select("Disbursement method","method",["CASH","MPESA","BANK"],"MPESA")}${field("Payment reference","reference")}</form><p class="message" id="lm-disb-msg"></p>${btn("Confirm disbursement","btn btn-primary","id='lm-disb-confirm'")}</div>`;
        document.getElementById("lm-disb-confirm").onclick=async()=>{try{if(!document.getElementById("lm-disb-form").reportValidity())return;const {data,error}=await db.rpc("gora2_loan_disburse",{_application_id:a.id,_disbursed_on:val("release"),_first_due_date:val("due"),_payment_method:val("method"),_payment_reference:val("reference")||null});if(error)throw error;ctx.toast("Loan disbursed and schedule created.");ed.innerHTML="";await refresh();}catch(e){document.getElementById("lm-disb-msg").textContent=e.message;}};
      }

      function openRepayment(account=null){
        const eligible=accounts.filter(a=>a.status==="OPEN");
        const selected=account?.id||eligible[0]?.id;
        const ed=document.getElementById("lm-editor");
        if(!eligible.length){ed.innerHTML='<div class="panel"><h3>Record repayment</h3><p>No open loan accounts are available for repayment.</p></div>';return;}
        ed.innerHTML=`<div class="panel"><h3>Record repayment</h3><form id="lm-repay-form" class="form-grid">
          <label class="form-field">Loan account<select id="lm-account">${eligible.map(a=>`<option value="${a.id}" ${a.id===selected?"selected":""}>${esc(a.account_number)} · ${esc(borrowerName(a))}</option>`).join("")}</select></label>
          ${field("Payment date","paydate",dateToday(),"date","required")}
          ${field("Amount KES","payamount","","number",'min="0.01" step="0.01" required')}
          ${select("Method","paymethod",["CASH","MPESA","BANK"],"MPESA")}
          ${field("Reference / receipt","payref")}
          ${field("Idempotency key (optional)","paykey")}
          ${field("Notes","paynotes")}
        </form><p class="message" id="lm-repay-msg"></p>${btn("Post repayment","btn btn-primary","id='lm-repay-post'")}</div>`;
        document.getElementById("lm-repay-post").onclick=async()=>{try{if(!document.getElementById("lm-repay-form").reportValidity())return;const {data,error}=await db.rpc("gora2_loan_record_repayment",{_loan_account_id:val("account"),_payment_date:val("paydate"),_amount:Number(val("payamount")),_payment_method:val("paymethod"),_reference_number:val("payref")||null,_idempotency_key:val("paykey")||null,_notes:val("paynotes")||null});if(error)throw error;ctx.toast("Repayment posted and allocated.");ed.innerHTML="";await refresh();}catch(e){document.getElementById("lm-repay-msg").textContent=e.message;}};
      }


      async function showSchedule(account,schedules,allocations=[],postedRepaymentIds=new Set()){
        if(!account)return;
        const ed=document.getElementById("lm-editor");
        const rows=schedules.filter(s=>s.loan_account_id===account.id);
        const paidBySchedule=new Map();
        allocations.filter(x=>postedRepaymentIds.has(x.repayment_id)).forEach(x=>paidBySchedule.set(x.schedule_id,(paidBySchedule.get(x.schedule_id)||0)+Number(x.amount||0)));
        const outstanding=s=>Math.round(Math.max(0,Number(s.total_due||0)-(paidBySchedule.get(s.id)||0))*100)/100;
        ed.innerHTML=`<div class="panel"><div class="panel-head"><div><h3>Collection schedule · ${esc(account.account_number)}</h3><p>${esc(borrowerName(account))} · ${esc(productName(account.product_id))}</p></div>${btn("Close","btn btn-neutral","id='lm-schedule-close'")}</div>
          <table class="data-table"><thead><tr><th>Inst.</th><th>Due date</th><th>Principal</th><th>Interest</th><th>Fees</th><th>Penalty</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Status</th><th></th></tr></thead><tbody>
          ${rows.map(s=>`<tr><td>${s.installment_number}</td><td>${fmtDate(s.due_date)}</td><td>${money(s.principal_due)}</td><td>${money(s.interest_due)}</td><td>${money(s.fee_due)}</td><td>${money(s.penalty_due)}</td><td>${money(s.total_due)}</td><td>${money(paidBySchedule.get(s.id)||0)}</td><td><b>${money(outstanding(s))}</b></td><td>${pill(s.status)}</td><td>${s.due_date<dateToday()&&s.status!=="PAID"&&s.status!=="WAIVED"&&outstanding(s)>0?btn("Apply penalty","btn btn-soft lm-penalty",`data-id="${s.id}"`):""}</td></tr>`).join("")}
          </tbody></table></div>`;
        document.getElementById("lm-schedule-close").onclick=()=>ed.innerHTML="";
        ed.querySelectorAll(".lm-penalty").forEach(b=>b.onclick=async()=>{try{const {error}=await db.rpc("gora2_loan_apply_penalty",{_schedule_id:b.dataset.id});if(error)throw error;ctx.toast("Late penalty applied.");await refresh();}catch(e){alert(e.message);}});
      }
      function adjustmentForm(account){
        if(!account)return;
        const ed=document.getElementById("lm-editor");
        ed.innerHTML=`<div class="panel"><h3>Loan adjustment request</h3><p>${esc(account.account_number)} · ${esc(borrowerName(account))}</p>
          <form id="lm-adjust-form" class="form-grid">${select("Adjustment type","adjtype",["RESTRUCTURE","REPRICE","EXTENSION","DUE_OVERRIDE","EARLY_SETTLEMENT","WAIVER"],"RESTRUCTURE")}${field("Requested new term / amount / reason","adjpayload","","text","required")}${field("Reason","adjreason","","text","required")}</form>${btn("Submit for manager approval","btn btn-primary","id='lm-adjust-save'")}</div>`;
        document.getElementById("lm-adjust-save").onclick=async()=>{try{const {error}=await db.from("gora2_loan_adjustments").insert({organization_id:org,loan_account_id:account.id,adjustment_type:val("adjtype"),request_payload:{details:val("adjpayload"),reason:val("adjreason")},requested_by:user,status:"PENDING"});if(error)throw error;ctx.toast("Adjustment request submitted for approval.");}catch(e){alert(e.message);}};
      }
      async function bulkRepayments(file){
        const text=await file.text();
        const lines=text.split(/\r?\n/).filter(Boolean);
        if(lines.length<2){ctx.toast("CSV has no repayment rows.","error");return;}
        const parseCsvRow=line=>{const out=[];let value="",quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'&&quoted&&line[i+1]==='"'){value+='"';i++;}else if(ch==='"'){quoted=!quoted;}else if(ch===","&&!quoted){out.push(value.trim());value="";}else value+=ch;}out.push(value.trim());return out;};
        const headers=parseCsvRow(lines[0]).map(x=>x.trim().toLowerCase());
        const index=k=>headers.indexOf(k);
        const required=["loan_account_number","payment_date","amount","payment_method"];
        if(required.some(k=>index(k)<0)){alert("CSV columns required: loan_account_number,payment_date,amount,payment_method (reference_number is optional).");return;}
        let ok=0,failed=[];
        for(let i=1;i<lines.length;i++){
          const cols=parseCsvRow(lines[i]);
          const loan=accounts.find(a=>a.account_number===cols[index("loan_account_number")]);
          if(!loan){failed.push(`Line ${i+1}: loan number not found`);continue;}
          const amount=Number(cols[index("amount")]),paymentDate=cols[index("payment_date")],method=String(cols[index("payment_method")]||"").toUpperCase();
          if(!Number.isFinite(amount)||amount<=0||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(paymentDate)||!["CASH","MPESA","BANK"].includes(method)){failed.push(`Line ${i+1}: invalid amount, date, or payment method`);continue;}
          try{
            const {error}=await db.rpc("gora2_loan_record_repayment",{_loan_account_id:loan.id,_payment_date:paymentDate,_amount:amount,_payment_method:method,_reference_number:index("reference_number")>=0?cols[index("reference_number")]||null:null,_idempotency_key:`CSV-${file.name}-${i}`,_notes:"Bulk CSV import"});
            if(error)throw error;ok++;
          }catch(err){failed.push(`Line ${i+1}: ${err.message}`);}
        }
        alert(`Bulk repayments processed. Posted: ${ok}. Failed: ${failed.length}${failed.length?"\\n"+failed.slice(0,10).join("\\n"):""}`);
        await refresh();
      }
      async function printStatement(account,schedules){
        if(!account)return;
        const rep=(await readOne("gora2_loan_repayments","loan_account_id",account.id)).filter(r=>r.status==="POSTED");
        const ss=schedules.filter(s=>s.loan_account_id===account.id);
        const win=window.open("","_blank");if(!win){ctx.toast("Allow pop-ups to print the statement.","error");return;}
        win.document.write(`<html><head><title>Loan statement ${esc(account.account_number)}</title><style>body{font:14px Arial;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px;text-align:left}</style></head><body><h2>GORA Loan Statement</h2><p>Account: ${esc(account.account_number)}</p><p>Borrower: ${esc(borrowerName(account))}</p><p>Product: ${esc(productName(account.product_id))}</p><p>Principal: ${money(account.principal_amount)}</p><h3>Schedule</h3><table><tr><th>Inst.</th><th>Due date</th><th>Due</th><th>Status</th></tr>${ss.map(s=>`<tr><td>${s.installment_number}</td><td>${fmtDate(s.due_date)}</td><td>${money(s.total_due)}</td><td>${esc(s.status)}</td></tr>`).join("")}</table><h3>Repayments</h3><table><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th></tr>${rep.map(r=>`<tr><td>${fmtDate(r.payment_date)}</td><td>${money(r.amount)}</td><td>${esc(r.payment_method)}</td><td>${esc(r.reference_number||"—")}</td></tr>`).join("")}</table><script>window.print();</script></body></html>`);
        win.document.close();
      }

      function prepareSms(rows){
        const recipients=rows.map(a=>members.find(m=>m.id===a.member_id)).filter(m=>m?.phone);
        const csv=recipients.map(m=>`${m.full_name||memberName(m.id)},${m.phone}`).join("\n");
        exportText("gora2-bulk-sms-recipients.csv","Name,Phone\n"+csv);
        alert(`Prepared ${recipients.length} borrower phone numbers as a CSV. Bulk SMS sending needs a connected SMS gateway; this file does not send messages.`);
      }
      function exportCsv(filename,rows){
        if(!rows?.length){ctx.toast("No rows to export.","error");return;}
        const keys=Object.keys(rows[0]);
        const csv=[keys.join(","),...rows.map(r=>keys.map(k=>`"${String(r[k]??"").replaceAll('"','""')}"`).join(","))].join("\r\n");
        exportText(filename,csv);
      }
      function exportText(filename,text){
        const blob=new Blob([text],{type:"text/csv;charset=utf-8"});
        const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
      }
    }
  };
})();
