const $=id=>document.getElementById(id);let db=null,profile=null;
const cash=n=>new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES',maximumFractionDigits:0}).format(Number(n||0));

function connect(){
  const u=localStorage.getItem('gora_url');
  const k=localStorage.getItem('gora_key');

  if(!u||!k||!window.supabase)return false;

  db=window.supabase.createClient(u.replace(/\/+$/,''),k);
  return true;
}

$('save').onclick=async()=>{
  const u=$('url').value.trim().replace(/\/+$/,'');
  const k=$('key').value.trim();

  if(!u||!k){
    $('msg').textContent='Enter both the Supabase URL and public key.';
    return;
  }

  localStorage.setItem('gora_url',u);
  localStorage.setItem('gora_key',k);

  if(!connect()){
    $('msg').textContent='Supabase client could not be loaded.';
    return;
  }

  $('msg').textContent='Testing Supabase connection...';

  try{
    const response=await fetch(u+'/auth/v1/health',{
      headers:{apikey:k}
    });

    if(!response.ok){
      throw new Error('HTTP '+response.status);
    }

    $('msg').textContent='Supabase is responding. Connection settings saved.';
  }catch(error){
    $('msg').textContent='Supabase connection failed: '+error.message;
  }
};

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
  if(page==='Loans'){
  window.__goraRequestedLoanView=b.dataset.loanView||'accounts';
  }
if(page==='Member Profiles'){location.href='member-profiles.html';return}
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

  if(page==='Transactions'){
    const [repayments,savings,capital]=await Promise.all([
      safe(db.from('loan_repayments')
        .select('payment_date,amount,payment_method,reference_number,notes,status')
        .order('payment_date',{ascending:false})
        .limit(100)),
      safe(db.from('savings_transactions')
        .select('transaction_date,transaction_type,amount,payment_method,reference_number,description,status')
        .order('transaction_date',{ascending:false})
        .limit(100)),
      safe(db.from('capital_transactions')
        .select('transaction_date,transaction_type,amount,payment_method,reference,description,status')
        .order('transaction_date',{ascending:false})
        .limit(100))
    ]);

    const rows=[
      ...(repayments.data||[]).map(x=>({
        date:x.payment_date,
        type:'Loan repayment',
        amount:cash(x.amount),
        method:x.payment_method,
        reference:x.reference_number,
        status:x.status,
        description:x.notes
      })),
      ...(savings.data||[]).map(x=>({
        date:x.transaction_date,
        type:'Savings - '+x.transaction_type,
        amount:cash(x.amount),
        method:x.payment_method,
        reference:x.reference_number,
        status:x.status,
        description:x.description
      })),
      ...(capital.data||[]).map(x=>({
        date:x.transaction_date,
        type:'Capital - '+x.transaction_type,
        amount:cash(x.amount),
        method:x.payment_method,
        reference:x.reference,
        status:x.status,
        description:x.description
      }))
    ].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,100);

    c.innerHTML=`
      <div class="page-heading">
        <div>
          <h2>Transactions</h2>
          <div class="sub">Recent financial activity across GORA.</div>
        </div>
      </div>
      <div class="notice">
        This is a view-only activity list from loan repayments,
        savings transactions and capital transactions.
        Income, expenses and petty cash will be connected
        through their dedicated workflows.
      </div>
      ${table('Recent transaction activity',
        ['date','type','amount','method','reference','status','description'],
        rows)}
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

  if(page==='Income'){
    const {data:authData,error:authError}=await db.auth.getUser();

    if(authError || !authData?.user){
      throw new Error('Please sign in again.');
    }

    const assignments=await safe(
      db.from('user_roles')
        .select('organization_id')
        .eq('user_id',authData.user.id)
        .eq('is_active',true)
    );

    const orgIds=[...new Set(
      (assignments.data||[])
        .map(x=>x.organization_id)
        .filter(Boolean)
    )];

    if(orgIds.length!==1){
      throw new Error(
        'Your staff account must have exactly one active organisation assignment.'
      );
    }

    const result=await safe(
      db.from('journal_entries')
        .select(`
          entry_date,
          entry_number,
          description,
          source_type,
          status,
          journal_lines(
            debit,
            credit,
            financial_accounts(
              account_code,
              account_name,
              account_type,
              normal_balance
            )
          )
        `)
        .eq('organization_id',orgIds[0])
        .eq('status','POSTED')
        .order('entry_date',{ascending:false})
        .limit(200)
    );

    const entries=result.data||[];

    const incomeRows=entries.map(entry=>{
      const lines=(entry.journal_lines||[]).filter(line=>{
        const account=Array.isArray(line.financial_accounts)
          ? line.financial_accounts[0]
          : line.financial_accounts;

        return account && account.account_type==='INCOME';
      });

      const amount=lines.reduce(
        (sum,line)=>
          sum+Number(line.credit||0)-Number(line.debit||0),
        0
      );

      return {
        date:entry.entry_date,
        entry:entry.entry_number,
        source:entry.source_type||'Journal entry',
        amount,
        description:entry.description||''
      };
    }).filter(x=>x.amount!==0);

    const monthKey=new Intl.DateTimeFormat('en-CA',{
      timeZone:'Africa/Nairobi',
      year:'numeric',
      month:'2-digit'
    }).format(new Date());

    const recentTotal=incomeRows.reduce(
      (sum,x)=>sum+x.amount,
      0
    );

    const monthTotal=incomeRows
      .filter(x=>String(x.date||'').startsWith(monthKey))
      .reduce((sum,x)=>sum+x.amount,0);

    const rows=incomeRows.map(x=>({
      date:esc(x.date),
      entry:esc(x.entry),
      source:esc(x.source),
      amount:cash(x.amount),
      description:esc(x.description)
    }));

    c.innerHTML=`
      <div class="page-heading">
        <div>
          <h2>Income</h2>
          <div class="sub">
            Verified income from posted accounting journal entries.
          </div>
        </div>
      </div>

      <div class="stats">
        ${stat(
          'Recent posted income',
          cash(recentTotal),
          'From up to 200 posted journal entries',
          'good'
        )}
        ${stat(
          'Month-to-date income',
          cash(monthTotal),
          'Within the loaded journal entries',
          'blue'
        )}
      </div>

      <div class="notice">
        Only posted journal entries linked to INCOME accounts are included.
        Loan principal, member savings and GORA capital are not income.
        Totals cover the loaded entries only; they are not a complete
        lifetime income total.
      </div>

      ${table(
        'Recent income entries',
        ['date','entry','source','amount','description'],
        rows
      )}
    `;

    return;
  }
    
  if(page==='Expenses'){
    const {data:authData,error:authError}=await db.auth.getUser();

    if(authError || !authData?.user){
      throw new Error('Please sign in again.');
    }

    const assignments=await safe(
      db.from('user_roles')
        .select('organization_id')
        .eq('user_id',authData.user.id)
        .eq('is_active',true)
    );

    const orgIds=[...new Set(
      (assignments.data||[])
        .map(x=>x.organization_id)
        .filter(Boolean)
    )];

    if(orgIds.length!==1){
      throw new Error(
        'Your staff account must have exactly one active organisation assignment.'
      );
    }

    const result=await safe(
      db.from('journal_entries')
        .select(`
          entry_date,
          entry_number,
          description,
          source_type,
          status,
          journal_lines(
            debit,
            credit,
            financial_accounts(
              account_code,
              account_name,
              account_type,
              normal_balance
            )
          )
        `)
        .eq('organization_id',orgIds[0])
        .eq('status','POSTED')
        .order('entry_date',{ascending:false})
        .limit(200)
    );

    const entries=result.data||[];

    const expenseRows=entries.map(entry=>{
      const lines=(entry.journal_lines||[]).filter(line=>{
        const account=Array.isArray(line.financial_accounts)
          ? line.financial_accounts[0]
          : line.financial_accounts;

        return account && account.account_type==='EXPENSE';
      });

      const amount=lines.reduce(
        (sum,line)=>
          sum+Number(line.debit||0)-Number(line.credit||0),
        0
      );

      return {
        date:entry.entry_date,
        entry:entry.entry_number,
        source:entry.source_type||'Journal entry',
        amount,
        description:entry.description||''
      };
    }).filter(x=>x.amount!==0);

    const totalExpenses=expenseRows.reduce(
      (sum,x)=>sum+x.amount,
      0
    );

    const rows=expenseRows.map(x=>({
      date:esc(x.date),
      entry:esc(x.entry),
      source:esc(x.source),
      amount:cash(x.amount),
      description:esc(x.description)
    }));

    c.innerHTML=`
      <div class="page-heading">
        <div>
          <h2>Expenses</h2>
          <div class="sub">
            Verified expenses from posted accounting journal entries.
          </div>
        </div>
      </div>
      <div class="panel">
        <h3>Submit an expense</h3>
        <p class="sub">Enter the details for review and approval.</p>

        <form id="expenseSubmitForm" class="form-grid">
          <label>Expense date
            <input type="date" name="expense_date" required>
          </label>

          <label>Category
            <input type="text" name="category" placeholder="e.g. Transport" required>
          </label>

          <label>Payee / Supplier
            <input type="text" name="payee" placeholder="Who is being paid?">
          </label>

          <label>Amount (KSh)
            <input type="number" name="amount" min="0.01" step="0.01" required>
          </label>

          <label>Payment method
            <select name="payment_method" required>
              <option value="CASH">Cash</option>
              <option value="MPESA">M-Pesa</option>
              <option value="BANK">Bank</option>
              <option value="PETTY_CASH">Petty Cash</option>
              <option value="OTHER">Other</option>
            </select>
          </label>

          <label>Reference
            <input type="text" name="reference" placeholder="Optional reference">
          </label>

          <label>Description
            <textarea name="description" required placeholder="What is this expense for?"></textarea>
          </label>

          <button type="submit">Submit expense</button>
          <div id="expenseSubmitMsg" class="notice"></div>
        </form>
      </div>
      <div class="stats">
        ${stat(
          'Recent posted expenses',
          cash(totalExpenses),
          'From up to 200 posted journal entries',
          'blue'
        )}
      </div>

      <div class="notice">
        Only posted journal entries linked to EXPENSE accounts are included.
        Expense totals cover the loaded entries only.
        Expense requests can be submitted here for review. Only posted journal entries appear in the expense report below.
      </div>

      ${table(
        'Recent expense entries',
        ['date','entry','source','amount','description'],
        rows
      )}
    `;

    const expenseSubmitForm=c.querySelector('#expenseSubmitForm');

    if(expenseSubmitForm){
      expenseSubmitForm.addEventListener('submit',async e=>{
        e.preventDefault();

        const f=new FormData(expenseSubmitForm);
        const submitBtn=expenseSubmitForm.querySelector('button[type="submit"]');
        const msg=c.querySelector('#expenseSubmitMsg');

        submitBtn.disabled=true;
        msg.textContent='Submitting expense for review...';

        try{
          const {data:authData,error:authError}=await db.auth.getUser();

          if(authError || !authData?.user){
            throw new Error('Please sign in again.');
          }

          const assignments=await safe(
            db.from('user_roles')
              .select('organization_id')
              .eq('user_id',authData.user.id)
              .eq('is_active',true)
          );

          const orgIds=[...new Set(
            (assignments.data||[])
              .map(x=>x.organization_id)
              .filter(Boolean)
          )];

          if(orgIds.length!==1){
            throw new Error(
              'Your staff account must have exactly one active organisation assignment.'
            );
          }

          await safe(
            db.rpc('submit_expense_request',{
              p_organization_id:orgIds[0],
              p_branch_id:null,
              p_expense_date:f.get('expense_date'),
              p_category:f.get('category').trim(),
              p_payee:f.get('payee')?.trim()||null,
              p_amount:Number(f.get('amount')),
              p_payment_method:f.get('payment_method'),
              p_reference:f.get('reference')?.trim()||null,
              p_description:f.get('description').trim(),
              p_receipt_path:null
            })
          );

          msg.textContent=
            'Expense submitted successfully. It is pending review and approval.';

          expenseSubmitForm.reset();

        }catch(err){
          msg.textContent='Could not submit: '+(err.message||err);
        }finally{
          submitBtn.disabled=false;
        }
      });
    }
    
    return;
          }
  
  
  if(page==='Petty Cash'){
    c.innerHTML=`
      
      <div class="page-heading">
        <div>
          <h2>Petty Cash</h2>
          <div class="sub">Record petty cash movements for approval.</div>
        </div>
      </div>

      <form id="pettyCashForm" class="form-grid">
        <label>Transaction type
          <select name="transaction_type" required>
            <option value="">Choose type</option>
            <option value="OPENING_BALANCE">Opening balance</option>
            <option value="CASH_RECEIVED">Cash received</option>
            <option value="EXPENSE_PAID">Expense paid</option>
            <option value="CASH_RETURNED">Cash returned</option>
          </select>
        </label>

        <label>Date
          <input type="date" name="transaction_date" required>
        </label>

        <label>Amount (KSh)
          <input type="number" name="amount" min="1" step="0.01" required>
        </label>

        <label>Category
          <input type="text" name="category" placeholder="e.g. Transport">
        </label>

        <label>Payment method
          <select name="payment_method" required>
            <option value="CASH">Cash</option>
            <option value="MPESA">M-Pesa</option>
            <option value="BANK">Bank</option>
            <option value="OTHER">Other</option>
          </select>
        </label>

        <label>Reference
          <input type="text" name="reference" placeholder="Optional reference">
        </label>

        <label>Description
          <input type="text" name="description" placeholder="What is this transaction for?" required>
        </label>

        <button type="submit">Submit for approval</button>
        <div id="pettyCashMsg" class="notice"></div>
      </form>

    `;
    
    const pettyCashForm=$('pettyCashForm');
    const pettyCashMsg=$('pettyCashMsg');

    pettyCashForm.onsubmit=async e=>{
      e.preventDefault();

      const f=new FormData(pettyCashForm);
      const submitBtn=pettyCashForm.querySelector('button[type="submit"]');

      submitBtn.disabled=true;
      pettyCashMsg.textContent='Submitting for approval...';

      try{
        const {data:authData,error:authError}=await db.auth.getUser();

        if(authError || !authData?.user){
          throw new Error('Please sign in again.');
        }

        const assignments=await safe(
          db.from('user_roles')
            .select('organization_id')
            .eq('user_id',authData.user.id)
            .eq('is_active',true)
        );

        const orgIds=[...new Set(
          (assignments.data||[])
            .map(x=>x.organization_id)
            .filter(Boolean)
        )];

        if(orgIds.length!==1){
          throw new Error(
            'Your staff account must have exactly one active organisation assignment.'
          );
        }

        await safe(
          db.rpc('submit_petty_cash_transaction',{
            p_organization_id:orgIds[0],
            p_transaction_date:f.get('transaction_date'),
            p_transaction_type:f.get('transaction_type'),
            p_amount:Number(f.get('amount')),
            p_category:f.get('category')||null,
            p_payment_method:f.get('payment_method'),
            p_reference:f.get('reference')||null,
            p_description:f.get('description')
          })
        );

        pettyCashMsg.textContent=
          'Submitted successfully. Your transaction is pending approval.';
        pettyCashForm.reset();

      }catch(err){
        pettyCashMsg.textContent=
          'Could not submit: '+(err.message||err);
      }finally{
        submitBtn.disabled=false;
      }
    };

    return;
;
  }

    
  

  
  
  if(page==='Accounting'){
    const showMenu = () => {
      c.innerHTML=`
        <div class="page-heading">
          <div>
            <h2>Accounting &amp; Reconciliation Centre</h2>
            <div class="sub">
              Double-entry accounting, reconciliation, cash controls and financial reporting.
            </div>
          </div>
        </div>

        <div class="notice">
          Select a module to open its available workflow.
          Opening a screen does not change account balances.
        </div>

        <div style="display:grid;gap:12px">
          <details class="panel" open>
            <summary><strong>Accounting &amp; General Ledger</strong></summary>
            <ul>
              <li>
                <button type="button" data-open-coa>
                  Chart of Accounts
                </button>
              </li>
              <li>
  <button type="button" data-open-journals>
    Journal Entries
  </button>
</li>
              <li>
  <button type="button" data-open-general-ledger>
    General Ledger
  </button>
</li>
              <li>Trial Balance</li>
              <li>Profit &amp; Loss Statement</li>
              <li>Balance Sheet</li>
              <li>Cash Flow Statement</li>
              <li>Sub-Ledger to GL Verification</li>
              <li>Adjusting Journal Entries</li>
            </ul>
          </details>

          <details class="panel">
            <summary><strong>Bank, M-Pesa &amp; Reconciliation</strong></summary>
            <ul>
              <li>Bank Reconciliation</li>
              <li>M-Pesa Reconciliation</li>
              <li>Cash Reconciliation</li>
              <li>Statement Import &amp; Matching</li>
              <li>Exact and Fuzzy Transaction Matching</li>
              <li>Many-to-One and One-to-Many Matching</li>
              <li>Suspense &amp; Exceptions</li>
              <li>Transaction Fees &amp; Tax</li>
              <li>Reconciliation Aging</li>
              <li>Duplicate and Reversal Detection</li>
            </ul>
          </details>

          <details class="panel">
            <summary><strong>Cash &amp; Branch Control</strong></summary>
            <ul>
              <li>Daily Cashbook</li>
              <li>Cash &amp; M-Pesa Balances</li>
              <li>Branch Cash Limits</li>
              <li>Petty Cash Control</li>
              <li>Daily Reconciliation</li>
            </ul>
          </details>
        </div>
      `;
            c.querySelector('[data-open-coa]').addEventListener('click', showChartOfAccounts);
      c.querySelector('[data-open-journals]').addEventListener('click', showJournalEntries);
      c.querySelector('[data-open-general-ledger]').addEventListener('click', showGeneralLedger);
    };
    const showChartOfAccounts = async () => {
      c.innerHTML=`
        <div class="page-heading">
          <div>
            <h2>Chart of Accounts</h2>
            <div class="sub">GORA's registered accounting accounts</div>
          </div>
        </div>
        <button type="button" data-back-accounting>
          ← Back to Accounting
        </button>
        <div class="panel">Loading accounts…</div>
      `;

      c.querySelector('[data-back-accounting]').addEventListener('click', showMenu);

      try {
        const {data,error}=await db
          .from('gora_chart_of_accounts')
          .select('account_code,account_name,account_type,is_active')
          .order('account_code');

        if(error) throw error;

        c.innerHTML=`
          <div class="page-heading">
            <div>
              <h2>Chart of Accounts</h2>
              <div class="sub">${data.length} accounts registered</div>
            </div>
          </div>
          <button type="button" data-back-accounting>
            ← Back to Accounting
          </button>
          <div class="tablebox" style="overflow-x:auto">
            <table style="min-width:650px;width:100%">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account Name</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${data.map(a=>`
                  <tr>
                    <td>${esc(a.account_code)}</td>
                    <td>${esc(a.account_name)}</td>
                    <td>${esc(a.account_type)}</td>
                    <td>${a.is_active?'Active':'Inactive'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;

        c.querySelector('[data-back-accounting]').addEventListener('click', showMenu);
      } catch(e) {
        c.innerHTML=`
          <div class="panel">
            <h3>Could not load Chart of Accounts</h3>
            <p>${esc(e.message||e)}</p>
            <button type="button" data-back-accounting>
              ← Back to Accounting
            </button>
          </div>
        `;
        c.querySelector('[data-back-accounting]').addEventListener('click', showMenu);
      }
    };

    const showGeneralLedger = async () => {
      c.innerHTML = `
        <div class="page-heading">
          <div>
            <h2>General Ledger</h2>
            <div class="sub">
              View posted journal activity and account balances.
            </div>
          </div>
        </div>

        <button type="button" data-back-accounting>
          ← Back to Accounting
        </button>

        <div class="panel">
          <label>
            Select account
            <select data-ledger-account>
              <option value="">Loading accounts…</option>
            </select>
          </label>
        </div>

        <div data-ledger-results class="panel">
          Choose an account to view its ledger.
        </div>
      `;

      c.querySelector('[data-back-accounting]')
        .addEventListener('click', showMenu);

      const accountSelect =
        c.querySelector('[data-ledger-account]');

      const results =
        c.querySelector('[data-ledger-results]');

      try {
        const { data: accounts, error: accountsError } =
          await db
            .from('gora_chart_of_accounts')
            .select('id,account_code,account_name,account_type')
            .eq('is_active', true)
            .order('account_code');

        if (accountsError) throw accountsError;

        accountSelect.innerHTML = `
          <option value="">Choose account</option>
          ${(accounts || []).map(a => `
            <option value="${esc(a.id)}">
              ${esc(a.account_code)} - ${esc(a.account_name)}
            </option>
          `).join('')}
        `;

        accountSelect.addEventListener('change', async () => {
          const accountId = accountSelect.value;

          if (!accountId) {
            results.textContent =
              'Choose an account to view its ledger.';
            return;
          }

          results.textContent = 'Loading ledger…';

          try {
            const { data: lines, error: linesError } =
              await db
                .from('gora_journal_entry_lines')
                .select(`
                const selectedAccount = (accounts || []).find(
  account => account.id === accountId
);

const isCreditNormal = [
  'liability',
  'equity',
  'income'
].includes(
  String(selectedAccount?.account_type || '').toLowerCase()
);
                  debit,
                  credit,
                  account:gora_chart_of_accounts(
                    account_code,
                    account_name
                  ),
                  journal:gora_journal_entries!inner(
                    journal_number,
                    entry_date,
                    description,
                    status
                  )
                `)
                .eq('account_id', accountId)
                .eq('journal.status', 'posted');

            if (linesError) throw linesError;

            const rows = (lines || []).sort((a, b) => {
              const dateCompare = String(
                a.journal.entry_date
              ).localeCompare(String(b.journal.entry_date));

              if (dateCompare !== 0) return dateCompare;

              return Number(a.journal.journal_number) -
                Number(b.journal.journal_number);
            });

            let runningBalance = 0;
            let totalDebit = 0;
            let totalCredit = 0;

            const ledgerRows = rows.map(line => {
              const debit = Number(line.debit || 0);
              const credit = Number(line.credit || 0);

              totalDebit += debit;
              totalCredit += credit;
              runningBalance += debit - credit;

              const balanceSide =
  runningBalance === 0
    ? '—'
    : isCreditNormal
      ? runningBalance > 0 ? 'Cr' : 'Dr'
      : runningBalance > 0 ? 'Dr' : 'Cr';

              return `
                <tr>
                  <td>${esc(line.journal.entry_date || '')}</td>
                  <td>${esc(line.journal.journal_number || '')}</td>
                  <td>${esc(line.journal.description || '')}</td>
                  <td style="text-align:right">
                    ${debit.toLocaleString('en-KE',{
                      minimumFractionDigits:2,
                      maximumFractionDigits:2
                    })}
                  </td>
                  <td style="text-align:right">
                    ${credit.toLocaleString('en-KE',{
                      minimumFractionDigits:2,
                      maximumFractionDigits:2
                    })}
                  </td>
                  <td style="text-align:right">
                    ${Math.abs(runningBalance).toLocaleString('en-KE',{
                      minimumFractionDigits:2,
                      maximumFractionDigits:2
                    })} ${balanceSide}
                  </td>
                </tr>
              `;
            }).join('');

            results.innerHTML = `
              <h3>
                ${esc(rows[0]?.account?.account_code || '')}
                ${esc(rows[0]?.account?.account_name || '')}
              </h3>

              <p>
                Posted transactions: ${rows.length}
              </p>

              <div style="overflow-x:auto">
                <table style="min-width:750px;width:100%">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Journal No.</th>
                      <th>Description</th>
                      <th style="text-align:right">Debit (KSh)</th>
                      <th style="text-align:right">Credit (KSh)</th>
                      <th style="text-align:right">Running balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${ledgerRows || `
                      <tr>
                        <td colspan="6">
                          No posted transactions for this account.
                        </td>
                      </tr>
                    `}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colspan="3">Total</th>
                      <th style="text-align:right">
                        ${totalDebit.toLocaleString('en-KE',{
                          minimumFractionDigits:2,
                          maximumFractionDigits:2
                        })}
                      </th>
                      <th style="text-align:right">
                        ${totalCredit.toLocaleString('en-KE',{
                          minimumFractionDigits:2,
                          maximumFractionDigits:2
                        })}
                      </th>
                      <th style="text-align:right">
                        ${Math.abs(runningBalance).toLocaleString('en-KE',{
                          minimumFractionDigits:2,
                          maximumFractionDigits:2
                        })} ${runningBalance > 0 ? 'Dr' :
                             runningBalance < 0 ? 'Cr' : '—'}
                      </th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            `;
          } catch (err) {
            results.innerHTML = `
              <h3>Could not load ledger</h3>
              <p>${esc(err.message || err)}</p>
            `;
          }
        });

      } catch (err) {
        results.innerHTML = `
          <h3>Could not load accounts</h3>
          <p>${esc(err.message || err)}</p>
        `;
      }
    };
      
    const showJournalEntries = async () => {
      c.innerHTML = `
        <div class="page-heading">
          <div>
            <h2>Journal Entries</h2>
            <div class="sub">Create balanced journal entries and post them securely.</div>
          </div>
        </div>
        <button type="button" data-back-accounting>
          ← Back to Accounting
        </button>
        <div class="panel">Loading journal entries…</div>
      `;

      c.querySelector('[data-back-accounting]')
        .addEventListener('click', showMenu);

      try {
        const [accountsResult, journalsResult] = await Promise.all([
          db.from('gora_chart_of_accounts')
            .select('id,account_code,account_name')
            .eq('is_active', true)
            .order('account_code'),

          db.from('gora_journal_entries')
            .select('id,journal_number,entry_date,description,status')
            .order('created_at', {ascending:false})
        ]);

        if(accountsResult.error) throw accountsResult.error;
        if(journalsResult.error) throw journalsResult.error;

        const accounts = accountsResult.data || [];
        const journals = journalsResult.data || [];

        c.innerHTML = `
          <div class="page-heading">
            <div>
              <h2>Journal Entries</h2>
              <div class="sub">Create and manage double-entry records.</div>
            </div>
          </div>

          <button type="button" data-back-accounting>
            ← Back to Accounting
          </button>

          <div class="panel">
            <h3>Create Journal Entry</h3>

            <form data-journal-form>
              <label>
                Entry date
                <input name="entry_date" type="date"
                  value="${new Date().toISOString().slice(0,10)}"
                  required>
              </label>

              <label>
                Description
                <input name="description" maxlength="250"
                  placeholder="Reason for this transaction"
                  required>
              </label>

              <label>
                Debit account
                <select name="debit_account" required>
                  <option value="">Choose account</option>
                  ${accounts.map(a=>`
                    <option value="${esc(a.id)}">
                      ${esc(a.account_code)} - ${esc(a.account_name)}
                    </option>
                  `).join('')}
                </select>
              </label>

              <label>
                Credit account
                <select name="credit_account" required>
                  <option value="">Choose account</option>
                  ${accounts.map(a=>`
                    <option value="${esc(a.id)}">
                      ${esc(a.account_code)} - ${esc(a.account_name)}
                    </option>
                  `).join('')}
                </select>
              </label>

              <label>
                Amount (KSh)
                <input name="amount" type="number"
                  min="0.01" step="0.01" required>
              </label>

              <button class="primary" type="submit">
                Save Draft
              </button>
              <p data-journal-message class="message"></p>
            </form>
          </div>

          <div class="panel">
            <h3>Journal History</h3>
            <div class="tablebox" style="overflow-x:auto">
              <table style="min-width:650px;width:100%">
                <thead>
                  <tr>
                    <th>Journal No.</th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${journals.map(j=>`
                    <tr>
                      <td>${esc(j.journal_number)}</td>
                      <td>${esc(j.entry_date)}</td>
                      <td>${esc(j.description)}</td>
                      <td>${esc(j.status)}</td>
                      <td>
                        ${j.status==='draft'?`
                          <button type="button"
                            data-post-journal="${esc(j.id)}">
                            Post
                          </button>
                        `:'—'}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;

        c.querySelector('[data-back-accounting]')
          .addEventListener('click', showMenu);

        c.querySelector('[data-journal-form]')
          .addEventListener('submit', async e=>{
            e.preventDefault();

            const form = e.currentTarget;
            const msg = c.querySelector('[data-journal-message]');
            const values = new FormData(form);

            const debitAccount = values.get('debit_account');
            const creditAccount = values.get('credit_account');
            const amount = Number(values.get('amount'));

            if(debitAccount===creditAccount){
              msg.textContent='Choose two different accounts.';
              return;
            }

            if(!Number.isFinite(amount)||amount<=0){
              msg.textContent='Enter a valid amount.';
              return;
            }

            const {data:authData,error:authError} =
              await db.auth.getUser();

            if(authError||!authData.user){
              msg.textContent='Please sign in again.';
              return;
            }

            const {data:entry,error:entryError}=await db
              .from('gora_journal_entries')
              .insert({
                entry_date:values.get('entry_date'),
                description:values.get('description').trim(),
                created_by:authData.user.id,
                status:'draft'
              })
              .select('id')
              .single();

            if(entryError){
              msg.textContent=entryError.message;
              return;
            }

            const {error:linesError}=await db
              .from('gora_journal_entry_lines')
              .insert([
                {
                  journal_entry_id:entry.id,
                  account_id:debitAccount,
                  debit:amount,
                  credit:0
                },
                {
                  journal_entry_id:entry.id,
                  account_id:creditAccount,
                  debit:0,
                  credit:amount
                }
              ]);

            if(linesError){
              msg.textContent='Draft saved, but lines failed: '
                +linesError.message;
              return;
            }

            await showJournalEntries();
          });

        c.querySelectorAll('[data-post-journal]')
          .forEach(button=>{
            button.addEventListener('click',async()=>{
              button.disabled=true;

              const {error}=await db.rpc(
                'gora_post_journal_entry',
                {
                  p_journal_entry_id:button.dataset.postJournal
                }
              );

              if(error){
                alert('Could not post journal: '+error.message);
                button.disabled=false;
                return;
              }

              await showJournalEntries();
            });
          });

      } catch(e) {
        c.innerHTML=`
          <div class="panel">
            <h3>Could not load Journal Entries</h3>
            <p>${esc(e.message||e)}</p>
            <button type="button" data-back-accounting>
              ← Back to Accounting
            </button>
          </div>
        `;

        c.querySelector('[data-back-accounting]')
          .addEventListener('click', showMenu);
      }
    };
                  
    showMenu();
    return;
  }


  const descriptions={
    'Finance Overview':'A consolidated view of GORA financial performance.',
    'Income':'Income will be calculated from verified posted accounting entries.',
    'Expenses':'Expenses will be calculated from verified posted accounting entries.',
    'Petty Cash':'Petty cash records require a dedicated, secure transaction workflow.',
    'Financial Reports':'Financial reports will use verified posted accounting entries.'
  };

  c.innerHTML=`
    <div class="page-heading">
      <div>
        <h2>${page}</h2>
        <div class="sub">${descriptions[page]||'Finance workspace'}</div>
      </div>
    </div>
    <div class="notice">
      This section is being prepared. No figures will be invented or treated as official profit before the required accounting records and controls are available.
    </div>
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
        .select('id,application_number,borrower_type,member_id,individual_borrower_id,loan_product_id,requested_amount,requested_duration,requested_duration_unit,purpose,status,applied_at,approved_amount,approved_interest_rate,approved_interest_method,approved_interest_period,approved_duration,approved_duration_unit,approved_repayment_frequency,approved_total_interest,approved_total_repayment,approved_processing_fee_type,approved_processing_fee_value,reviewed_by,reviewed_at,approved_by,approved_at')
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


    async function loanAccountsPage(c) {
  try {
    const { data: authData, error: authError } = await db.auth.getUser();
    if (authError || !authData?.user) throw new Error('Please sign in again.');

    const assignmentResult = await safe(db.from('user_roles').select('organization_id')
      .eq('user_id', authData.user.id).eq('is_active', true));
    if (assignmentResult.error) throw assignmentResult.error;
    const orgIds = [...new Set((assignmentResult.data || []).map(x => x.organization_id).filter(Boolean))];
    if (orgIds.length !== 1) throw new Error('Your staff account must have exactly one active organisation assignment.');
    const orgId = orgIds[0];

    const [loansResult, membersResult, individualsResult, productsResult, applicationsResult, repaymentsResult] = await Promise.all([
      safe(db.from('loan_accounts').select('id,loan_account_number,application_id,borrower_type,member_id,individual_borrower_id,loan_product_id,principal_amount,total_interest,total_repayment,repayment_frequency,duration_count,duration_unit,disbursed_on,first_due_date,status,created_at').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(1000)),
      safe(db.from('members').select('id,member_number,full_name,phone').eq('organization_id', orgId)),
      safe(db.from('individual_borrowers').select('id,borrower_number,full_name,phone').eq('organization_id', orgId)),
      safe(db.from('loan_products').select('id,product_name').eq('organization_id', orgId)),
      safe(db.from('loan_applications').select('id,application_number,borrower_type,member_id,individual_borrower_id,loan_product_id,approved_amount,approved_interest_rate,approved_interest_method,approved_duration,approved_duration_unit,approved_repayment_frequency,approved_total_interest,approved_total_repayment,status,approved_at').eq('organization_id', orgId).eq('status', 'approved').limit(1000)),
      
safe(db.from('loan_repayments').select('id,loan_account_id,payment_date,amount,payment_method,reference_number,notes,status,created_at').eq('organization_id', orgId).order('payment_date', { ascending: false }).limit(5000))

    const loans = loansResult.data || [];
    const members = membersResult.data || [];
    const individuals = individualsResult.data || [];
    const products = productsResult.data || [];
    const approvedApplications = applicationsResult.data || [];
    const repayments = repaymentsResult.data || [];
    const memberMap = Object.fromEntries(members.map(x => [x.id, x]));
    const individualMap = Object.fromEntries(individuals.map(x => [x.id, x]));
    const productMap = Object.fromEntries(products.map(x => [x.id, x.product_name]));
    const money = n => cash(Number(n || 0));
    const paidFor = loanId => repayments.filter(r => r.loan_account_id === loanId && String(r.status || '').toUpperCase() === 'POSTED').reduce((sum, r) => sum + Number(r.amount || 0), 0);
    
    const rows = loans.map(loan => {
      const borrower = String(loan.borrower_type || '').toUpperCase() === 'MEMBER'
        ? memberMap[loan.member_id] : individualMap[loan.individual_borrower_id];
      const paid = paidFor(loan.id);

      let maturityDate = '—';
      if (loan.disbursed_on) {
        const maturity = new Date(`${loan.disbursed_on}T00:00:00`);
        const duration = Number(loan.duration_count || 1);
        const unit = String(loan.duration_unit || 'months').toLowerCase();

        if (unit.startsWith('day')) maturity.setDate(maturity.getDate() + duration);
        else if (unit.startsWith('week')) maturity.setDate(maturity.getDate() + duration * 7);
        else if (unit.startsWith('year')) maturity.setFullYear(maturity.getFullYear() + duration);
        else maturity.setMonth(maturity.getMonth() + duration);

        maturityDate = maturity.toISOString().slice(0, 10);
      }

      return {
        loan,
        borrower: borrower?.full_name || 'Borrower not found',
        borrowerNo: borrower?.member_number || borrower?.borrower_number || '—',
        borrowerCategory: loan.borrower_type || '—',
        phone: borrower?.phone || '',
        product: productMap[loan.loan_product_id] || '—',
        maturityDate,
        paid,
        outstanding: Math.max(0, Number(loan.total_repayment || 0) - paid)
      };
    });


    const availableApps = approvedApplications.filter(a => !loans.some(l => l.application_id === a.id));
    const borrowerFor = app => String(app.borrower_type || '').toUpperCase() === 'MEMBER'
      ? memberMap[app.member_id] : individualMap[app.individual_borrower_id];
    const accountNo = () => `GORA-LN-${Date.now().toString().slice(-8)}`;

    if (!c.dataset.loanAccountsBound) {
      c.dataset.loanAccountsBound = '1';
      c.addEventListener('click', async ev => {
        const createBtn = ev.target.closest('#gora-create-loan-account');
        const cancelBtn = ev.target.closest('#gora-cancel-loan-account');
        const submitBtn = ev.target.closest('#gora-save-loan-account');
        const detailBtn = ev.target.closest('[data-loan-account-detail]');
        if (cancelBtn) {
          c.querySelector('#gora-loan-account-form-wrap')?.classList.add('hidden');
          return;
        }
        if (createBtn) {
          const wrap = c.querySelector('#gora-loan-account-form-wrap');
          if (!wrap) return;
          wrap.classList.remove('hidden');
          wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        if (detailBtn) {
          const id = detailBtn.getAttribute('data-loan-account-detail');
          const item = rows.find(x => x.loan.id === id);
          const detail = c.querySelector('#gora-loan-account-detail');
          if (item && detail) {
            const total = Number(item.loan.total_repayment || 0);
const principal = Number(item.loan.principal_amount || 0);
const interest = Number(item.loan.total_interest || 0);
const paid = Number(item.paid || 0);
const outstanding = Number(item.outstanding || 0);
const paidPercent = total > 0 ? Math.min(100, Math.max(0, paid / total * 100)) : 0;

detail.innerHTML = `
  <h3>Loan account profile</h3>

  <div class="stats">
    ${stat('Account number', esc(item.loan.loan_account_number || '—'), 'Loan reference', 'blue')}
    ${stat('Borrower', esc(item.borrower), esc(item.borrowerNo), 'blue')}
    ${stat('Borrower category', esc(item.borrowerCategory), 'Account classification', 'blue')}
    ${stat('Loan product', esc(item.product), 'Approved product', 'blue')}
  </div>

  <h4>Loan financial position</h4>
  <div class="stats">
    ${stat('Principal', money(principal), 'Amount disbursed', 'blue')}
    ${stat('Interest & charges', money(interest), 'Recorded total interest', 'warn')}
    ${stat('Total repayment', money(total), 'Principal plus interest', 'blue')}
    ${stat('Amount paid', money(paid), 'Posted repayments only', 'good')}
    ${stat('Outstanding balance', money(outstanding), 'Remaining to repay', 'warn')}
  </div>

  <div class="panel">
    <b>Repayment progress</b>
    <p>${paidPercent.toFixed(1)}% repaid</p>
    <div style="height:12px;background:var(--border,#ddd);border-radius:10px;overflow:hidden">
      <div style="height:100%;width:${paidPercent}%;background:var(--primary,#2563eb);border-radius:10px"></div>
    </div>
  </div>

  <h4>Loan dates & terms</h4>
  <p><b>Disbursement date:</b> ${esc(item.loan.disbursed_on || '—')}</p>
  <p><b>First repayment date:</b> ${esc(item.loan.first_due_date || '—')}</p>
  <p><b>Maturity date:</b> ${esc(item.maturityDate || '—')}</p>
  <p><b>Repayment frequency:</b> ${esc(item.loan.repayment_frequency || '—')}</p>
  <p><b>Loan duration:</b> ${esc(item.loan.duration_count || '—')} ${esc(item.loan.duration_unit || '')}</p>
  <p><b>Loan status:</b> ${esc(item.loan.status || '—')}</p>
`;
            detail.classList.remove('hidden');
            detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          return;
        }
        if (!submitBtn) return;
        const form = c.querySelector('#gora-loan-account-form');
        const msg = c.querySelector('#gora-loan-account-message');
        const applicationId = form?.elements.application_id.value;
        const disbursedOn = form?.elements.disbursed_on.value;
        const firstDueDate = form?.elements.first_due_date.value;
        const amount = Number(form?.elements.disbursed_amount.value || 0);
        const application = availableApps.find(a => a.id === applicationId);
        if (!application) { msg.textContent = 'Select an approved application that has not already been disbursed.'; return; }
        if (!disbursedOn || !firstDueDate || amount <= 0) { msg.textContent = 'Complete the required account and disbursement dates and amount.'; return; }
        if (firstDueDate < disbursedOn) { msg.textContent = 'First repayment date cannot be before disbursement date.'; return; }
        if (amount !== Number(application.approved_amount || 0)) { msg.textContent = 'Disbursed amount must match the approved amount. Amend the approval first if needed.'; return; }
        if (loans.some(l => l.application_id === applicationId)) { msg.textContent = 'This application already has a loan account.'; return; }
        submitBtn.disabled = true;
        msg.textContent = 'Creating loan account…';
        try {
          const borrower = borrowerFor(application);
          if (!borrower) throw new Error('Borrower details could not be found for this application.');
          const principal = Number(application.approved_amount || 0);
          const interest = Number(application.approved_total_interest || 0);
          const totalRepayment = Number(application.approved_total_repayment || (principal + interest));
          const loanNumber = accountNo();
          const insertData = {
            organization_id: orgId,
            application_id: application.id,
            loan_product_id: application.loan_product_id,
            borrower_type: application.borrower_type,
            member_id: application.member_id || null,
            individual_borrower_id: application.individual_borrower_id || null,
            principal_amount: principal,
            total_interest: interest,
            total_repayment: totalRepayment,
            repayment_frequency: application.approved_repayment_frequency || 'monthly',
            duration_count: Number(application.approved_duration || 1),
            duration_unit: application.approved_duration_unit || 'months',
            disbursed_on: disbursedOn,
            first_due_date: firstDueDate,
            status: 'ACTIVE',
            loan_account_number: loanNumber
          };
          const insertResult = await safe(db.from('loan_accounts').insert(insertData).select('id').single());
          if (insertResult.error) throw insertResult.error;
          msg.textContent = `Loan account ${loanNumber} created. Refreshing account register…`;
          await loanAccountsPage(c);
        } catch (err) {
          msg.textContent = `Could not create loan account: ${err.message || err}. No further action was taken.`;
          submitBtn.disabled = false;
        }
      });
      c.addEventListener('input', ev => {
        if (ev.target.id !== 'gora-loan-account-search') return;
        const term = ev.target.value.toLowerCase().trim();
        const filtered = rows.filter(x => `${x.loan.loan_account_number} ${x.borrower} ${x.borrowerNo} ${x.product} ${x.loan.status}`.toLowerCase().includes(term));
        renderRows(filtered);
      });
    }

    
    function renderRows(list) {
      const tbody = c.querySelector('#gora-loan-account-rows');
      if (!tbody) return;

      tbody.innerHTML = list.length ? list.map(x => `<tr>
        <td>${esc(x.loan.loan_account_number || '—')}</td>
        <td>${esc(x.borrower)}
          <div class="sub">${esc(x.borrowerNo)}</div>
          <div class="sub">${esc(x.borrowerCategory)}</div>
        </td>
        <td>${esc(x.product)}</td>
        <td>${money(x.loan.principal_amount)}</td>
        <td>${money(x.loan.total_interest)}</td>
        <td>${money(x.loan.total_repayment)}</td>
        <td>${money(x.paid)}</td>
        <td>${money(x.outstanding)}</td>
        <td>${esc(x.loan.disbursed_on || '—')}</td>
        <td>${esc(x.loan.first_due_date || '—')}</td>
        <td>${esc(x.maturityDate || '—')}</td>
        <td>${esc(x.loan.status || '—')}</td>
        <td>
  <details>
    <summary style="cursor:pointer;font-weight:600">Actions ▾</summary>
    <div style="display:flex;flex-direction:column;gap:6px;padding:8px;min-width:150px">
      <button class="secondary" data-loan-account-detail="${esc(x.loan.id)}">View details</button>
      <button class="secondary" disabled>Repayment schedule</button>
      <button class="secondary" disabled>Loan statement</button>
      <button class="secondary" disabled>Record repayment</button>
      <button class="secondary" disabled>Guarantors &amp; collateral</button>
      <button class="secondary" disabled>Loan agreement</button>
      <button class="secondary" disabled>Restructure / settle</button>
    </div>
  </details>
</td>
      </tr>`).join('') : '<tr><td colspan="13" class="empty">No loan accounts found.</td></tr>';
    }


    c.innerHTML = `<div class="page-heading"><div><h2>Loan Accounts</h2><div class="sub">Disbursed loan accounts and balances. Accounts are created only from approved applications.</div></div></div>
      <div class="stats">${stat('Loan accounts', loans.length, 'All recorded accounts', 'blue')}${stat('Principal disbursed', money(loans.reduce((s,l)=>s+Number(l.principal_amount||0),0)), 'Recorded principal', 'blue')}${stat('Posted repayments', money(repayments.filter(r=>String(r.status||'').toUpperCase()==='POSTED').reduce((s,r)=>s+Number(r.amount||0),0)), 'Payments posted', 'good')}${stat('Outstanding', money(rows.reduce((s,x)=>s+x.outstanding,0)), 'Total repayment less posted payments', 'warn')}</div>
      <div class="panel"><div class="table-head"><h3>Loan account register</h3><button id="gora-create-loan-account">Create loan account</button></div>
      <label for="gora-loan-account-search">Search accounts</label><input id="gora-loan-account-search" type="search" placeholder="Borrower, account number, product or status" style="width:100%;max-width:480px;margin:6px 0 14px;padding:10px;border:1px solid var(--border,#ddd);border-radius:8px">
      <div class="tablebox" style="overflow-x:auto"><table style="min-width:1500px;width:100%">
<thead>
  <tr>
    <th>Account number</th>
    <th>Borrower / Category</th>
    <th>Loan product</th>
    <th>Principal</th>
    <th>Interest &amp; charges</th>
    <th>Total repayment</th>
    <th>Amount paid</th>
    <th>Outstanding</th>
    <th>Disbursement date</th>
    <th>First repayment</th>
    <th>Maturity date</th>
    <th>Loan status</th>
    <th>Actions</th>
  </tr>
</thead>
<tbody id="gora-loan-account-rows"></tbody></table></div></div>
      <div id="gora-loan-account-form-wrap" class="panel hidden"><h3>Create loan account from approved application</h3><p class="sub">This records the approved loan disbursement. The amount must match the approved amount.</p>
        <form id="gora-loan-account-form">
          <label>Approved application</label><select name="application_id" required style="width:100%;padding:10px;margin:6px 0 12px"><option value="">Select approved application</option>${availableApps.map(a=>{const b=borrowerFor(a);return `<option value="${esc(a.id)}">${esc(a.application_number||a.id)} — ${esc(b?.full_name||'Borrower')} — ${money(a.approved_amount)}</option>`;}).join('')}</select>
          <label>Disbursed amount (KES)</label><input name="disbursed_amount" type="number" min="1" step="0.01" required style="width:100%;padding:10px;margin:6px 0 12px">
          <label>Disbursement date</label><input name="disbursed_on" type="date" required style="width:100%;padding:10px;margin:6px 0 12px">
          <label>First repayment date</label><input name="first_due_date" type="date" required style="width:100%;padding:10px;margin:6px 0 12px">
          <div id="gora-loan-account-message" class="notice" role="status"></div>
          <button type="button" id="gora-save-loan-account">Confirm disbursement &amp; create account</button> <button type="button" class="secondary" id="gora-cancel-loan-account">Cancel</button>
        </form>
      </div><div id="gora-loan-account-detail" class="panel hidden"></div>
      <div class="notice">This first stage creates the loan account and records the approved principal and dates. Disbursement method/reference ledger, repayment schedule generation, and restructuring will be added in later stages.</div>`;

    renderRows(rows);
  } catch (e) {
    c.innerHTML = `<div class="panel"><h3>Could not load Loan Accounts</h3><p>${esc(e.message || e)}</p><p>No loan data has been changed.</p></div>`;
  }
}
            
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
async function load(page){$('title').textContent=page;const c=$('content');c.innerHTML='<div class="panel">Loading records…</div>';try{if(page==='Dashboard'){await dashboard(c);return}if(['Finance Overview','Transactions','Income','Expenses','Petty Cash','Capital Management','Daily Reconciliation','Accounting','Financial Reports'].includes(page)){await financePage(page,c);return}if(page==='Chamas'){await chamaPage(c);return}if(page==='Members'){await membersPage(c);return}if(page==='Applications'){await applicationsPage(c);return}if(page==='Performance'){await performancePage(c);return}if(page==='Settings'){c.innerHTML='<div class="panel"><h3>System settings</h3><p>Loan product rates and fees must be administered by the GORA admin only. Configuration controls will be enabled after permission policies are verified.</p></div>';return}if(page==='Loans'){
  await loanAccountsPage(c);
  return;
}
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
