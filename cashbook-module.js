
/* GORA 2.0 — Cashbook & Expenses
 * Uses existing petty_cash_transactions and expense_requests.
 * Submissions are pending until an authorized approval/posting
 * workflow is connected.
 */
(() => {
  const money = value =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 2
    }).format(Number(value || 0));

  const esc = value =>
    String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));

  const today = () => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Nairobi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());

    const p = Object.fromEntries(
      parts.map(x => [x.type, x.value])
    );

    return `${p.year}-${p.month}-${p.day}`;
  };

  const CASH_TYPES = {
    OPENING_BALANCE: "Opening balance",
    CASH_RECEIVED: "Cash received",
    EXPENSE_PAID: "Expense paid",
    CASH_RETURNED: "Cash returned"
  };

  const METHODS = {
    CASH: "Cash",
    MPESA: "M-Pesa",
    BANK: "Bank",
    OTHER: "Other"
  };

  const SUBMIT_ROLES = [
    "SUPER_ADMIN",
    "MANAGER",
    "ACCOUNTANT",
    "CASHIER"
  ];

  function handles(moduleName) {
    return moduleName === "Cashbook";
  }

  function statusLabel(status) {
    return String(status || "UNKNOWN")
      .replaceAll("_", " ");
  }

function statCard(label, value, description, type = "money") {
  const displayValue = type === "count"
    ? Number(value || 0).toLocaleString("en-KE")
    : money(value);

  return `
    <div class="stat-card stat-blue">
      <div class="stat-top">${esc(label)}</div>
      <strong>${displayValue}</strong>
      <small>${esc(description)}</small>
    </div>
  `;
}


  async function getCashTransactions(db, organizationId) {
    const { data, error } = await db
      .from("petty_cash_transactions")
      .select(`
        id,
        transaction_date,
        transaction_type,
        amount,
        category,
        payment_method,
        reference,
        description,
        status,
        created_at
      `)
      .eq("organization_id", organizationId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) throw error;
    return data || [];
  }

async function getCashbookSummary(db, organizationId) {
  const { data, error } = await db.rpc(
    "get_cashbook_summary",
    {
      p_organization_id: organizationId
    }
  );

  if (error) throw error;

  return data || {
    balances: {},
    posted_count: 0,
    pending_count: 0,
    expense_open_count: 0
  };
}
  
  async function getExpenseRequests(db, organizationId) {
    const { data, error } = await db
      .from("expense_requests")
      .select(`
        id,
        expense_date,
        category,
        payee,
        amount_requested,
        payment_method,
        reference,
        description,
        status,
        settled_amount,
        journal_entry_id,
        created_at
      `)
      .eq("organization_id", organizationId)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) throw error;
    return data || [];
  }

  function calculateCashBalance(transactions) {
    let balance = 0;

    for (const tx of transactions) {
      if (tx.status !== "POSTED") continue;

      const amount = Number(tx.amount || 0);

      switch (tx.transaction_type) {
        case "OPENING_BALANCE":
        case "CASH_RECEIVED":
        case "CASH_RETURNED":
          balance += amount;
          break;

        case "EXPENSE_PAID":
          balance -= amount;
          break;
      }
    }

    return balance;
  }

  function cashRows(transactions) {
    return transactions.map(tx => {
      const isIn = [
        "OPENING_BALANCE",
        "CASH_RECEIVED",
        "CASH_RETURNED"
      ].includes(tx.transaction_type);

      const sign = isIn ? "+" : "−";
      const amountClass = isIn
        ? "text-success"
        : "text-danger";

      return `
        <tr>
          <td>${esc(tx.transaction_date)}</td>
          <td>${esc(CASH_TYPES[tx.transaction_type] || tx.transaction_type)}</td>
          <td>${esc(tx.payment_method || "—")}</td>
          <td>${esc(tx.category || "—")}</td>
          <td>${esc(tx.reference || "—")}</td>
          <td>${esc(tx.description || "—")}</td>
          <td>
            <span class="status-pill">${esc(statusLabel(tx.status))}</span>
          </td>
          <td class="${amountClass}">
            <strong>${sign}${money(tx.amount)}</strong>
          </td>
        </tr>
      `;
    }).join("");
  }

  function expenseRows(expenses) {
    return expenses.map(expense => `
      <tr>
        <td>${esc(expense.expense_date)}</td>
        <td>${esc(expense.category)}</td>
        <td>${esc(expense.payee || "—")}</td>
        <td>${esc(expense.payment_method)}</td>
        <td>${esc(expense.reference || "—")}</td>
        <td>${esc(expense.description)}</td>
        <td>
          <span class="status-pill">${esc(statusLabel(expense.status))}</span>
        </td>
        <td><strong>${money(expense.amount_requested)}</strong></td>
      </tr>
    `).join("");
  }

  async function render(moduleName, context) {
    const {
      db,
      organization,
      authUser,
      profile,
      toast
    } = context;

    const page = document.getElementById("pageContent");
    if (!page) return;

    if (!db || !organization?.id || !authUser?.id) {
      page.innerHTML = `
        <div class="panel">
          <h2>Cashbook & Expenses</h2>
          <p>Database or organization connection is missing.</p>
        </div>
      `;
      return;
    }

    const canSubmit = SUBMIT_ROLES.includes(
      profile?.roleCode
    );

    page.innerHTML = `
      <div class="page-heading">
        <div>
          <h2>Cashbook & Expenses</h2>
          <p>Record cash movements and submit expenses for review.</p>
        </div>
      </div>

      <div class="stats-grid" id="cashbookStats">
        <div class="loading-panel">Loading cashbook…</div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Record cash movement</h3>
            <p>Submit a movement supported by an actual receipt or payment.</p>
          </div>
        </div>

        ${
          canSubmit
            ? `
              <form id="cashbookForm" class="form-grid">
                <label>
                  Transaction type
                  <select id="cashType" required>
                    <option value="CASH_RECEIVED">Cash received</option>
                    <option value="EXPENSE_PAID">Expense paid</option>
                    <option value="CASH_RETURNED">Cash returned</option>
                    <option value="OPENING_BALANCE">Opening balance</option>
                  </select>
                </label>

                <label>
                  Amount (KES)
                  <input id="cashAmount" type="number"
                    min="0.01" step="0.01" required>
                </label>

                <label>
                  Transaction date
                  <input id="cashDate" type="date"
                    value="${today()}" required>
                </label>

                <label>
                  Payment method
                  <select id="cashMethod" required>
                    <option value="CASH">Cash</option>
                    <option value="MPESA">M-Pesa</option>
                    <option value="BANK">Bank</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>

                <label>
                  Category
                  <input id="cashCategory" type="text"
                    maxlength="100" placeholder="e.g. Transport">
                </label>

                <label>
                  Reference / receipt number
                  <input id="cashReference" type="text"
                    maxlength="100" placeholder="Optional">
                </label>

                <label class="form-span-2">
                  Description
                  <input id="cashDescription" type="text"
                    maxlength="500" required
                    placeholder="Reason for this movement">
                </label>

                <div class="form-actions">
                  <button class="btn btn-primary" type="submit">
                    Submit cash movement
                  </button>
                </div>
              </form>
            `
            : `
              <div class="note-box">
                Your role can view cashbook records but cannot submit
                transactions.
              </div>
            `
        }
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Submit expense request</h3>
            <p>Requests are submitted for review before settlement.</p>
          </div>
        </div>

        ${
          canSubmit
            ? `
              <form id="expenseForm" class="form-grid">
                <label>
                  Expense date
                  <input id="expenseDate" type="date"
                    value="${today()}" required>
                </label>

                <label>
                  Category
                  <input id="expenseCategory" type="text"
                    maxlength="100" required
                    placeholder="e.g. Transport">
                </label>

                <label>
                  Payee / supplier
                  <input id="expensePayee" type="text"
                    maxlength="200" placeholder="Optional">
                </label>

                <label>
                  Amount requested (KES)
                  <input id="expenseAmount" type="number"
                    min="0.01" step="0.01" required>
                </label>

                <label>
                  Payment method
                  <select id="expenseMethod" required>
                    <option value="CASH">Cash</option>
                    <option value="MPESA">M-Pesa</option>
                    <option value="BANK">Bank</option>
                    <option value="PETTY_CASH">Petty cash</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>

                <label>
                  Reference
                  <input id="expenseReference" type="text"
                    maxlength="100" placeholder="Optional">
                </label>

                <label class="form-span-2">
                  Description
                  <textarea id="expenseDescription"
                    rows="3" maxlength="1000"
                    required placeholder="Explain the expense"></textarea>
                </label>

                <div class="form-actions">
                  <button class="btn btn-primary" type="submit">
                    Submit expense request
                  </button>
                </div>
              </form>
            `
            : `
              <div class="note-box">
                Your role can view expense requests but cannot submit them.
              </div>
            `
        }
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Cashbook history</h3>
            <p>Latest 300 cash movements.</p>
          </div>
          <button class="btn btn-soft" id="cashbookRefresh" type="button">
            Refresh
          </button>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Method</th>
                <th>Category</th>
                <th>Reference</th>
                <th>Description</th>
                <th>Status</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody id="cashbookRows">
              <tr><td colspan="8">Loading…</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Expense requests</h3>
            <p>Latest 300 submitted expense requests.</p>
          </div>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Payee</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Description</th>
                <th>Status</th>
                <th>Requested</th>
              </tr>
            </thead>
            <tbody id="expenseRows">
              <tr><td colspan="8">Loading…</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="note-box">
        Pending or submitted records do not change the posted cash balance.
        Approval, settlement and ledger posting will be enabled after
        the secure workflow is connected.
      </div>
    `;

    async function refresh() {
      const stats = document.getElementById("cashbookStats");
      const cashRowsElement =
        document.getElementById("cashbookRows");
      const expenseRowsElement =
        document.getElementById("expenseRows");

      try {
        
const [cashTransactions, expenses, summary] =
  await Promise.all([
    getCashTransactions(db, organization.id),
    getExpenseRequests(db, organization.id),
    getCashbookSummary(db, organization.id)
  ]);

const cashBalance = Number(
  summary.balances?.CASH || 0
);

const postedCount = Number(
  summary.posted_count || 0
);

const pendingCash = Number(
  summary.pending_count || 0
);

const pendingExpenses = expenses.filter(
  expense => [
    "SUBMITTED",
    "VALIDATED",
    "FLAGGED",
    "APPROVED",
    "PARTIALLY_SETTLED",
    "SETTLED"
  ].includes(expense.status)
).length;

if (stats) {
  stats.innerHTML = `
    ${statCard(
      "Cash balance",
      cashBalance,
      "Posted CASH movements"
    )}

    ${statCard(
      "Posted cash transactions",
      postedCount,
      "All posted cashbook transactions",
      "count"
    )}

    ${statCard(
      "Pending cash movements",
      pendingCash,
      "Awaiting review or posting",
      "count"
    )}

    ${statCard(
      "Expense requests",
      summary.expense_open_count || 0,
      "Not posted or rejected",
      "count"
    )}
  `;
}


            
            ${statCard(
              "Pending cash movements",
              pendingCash,
              "Awaiting review or posting"
            )}

            ${statCard(
              "Open expense requests",
              pendingExpenses,
              "Requests not yet fully completed"
            )}
          `;
        }

        if (cashRowsElement) {
          cashRowsElement.innerHTML =
            cashTransactions.length
              ? cashRows(cashTransactions)
              : `<tr><td colspan="8">No cash movements recorded yet.</td></tr>`;
        }

        if (expenseRowsElement) {
          expenseRowsElement.innerHTML =
            expenses.length
              ? expenseRows(expenses)
              : `<tr><td colspan="8">No expense requests submitted yet.</td></tr>`;
        }
      } catch (error) {
        console.error("Cashbook load error:", error);

        if (stats) {
          stats.innerHTML = `
            <div class="note-box">
              Unable to load cashbook:
              ${esc(error.message || "Unknown error")}
            </div>
          `;
        }

        if (cashRowsElement) {
          cashRowsElement.innerHTML =
            `<tr><td colspan="8">Unable to load cashbook history.</td></tr>`;
        }

        if (expenseRowsElement) {
          expenseRowsElement.innerHTML =
            `<tr><td colspan="8">Unable to load expense requests.</td></tr>`;
        }
      }
    }

    document
      .getElementById("cashbookRefresh")
      ?.addEventListener("click", refresh);

    const cashForm =
      document.getElementById("cashbookForm");

    cashForm?.addEventListener("submit", async event => {
      event.preventDefault();

      if (!SUBMIT_ROLES.includes(profile?.roleCode)) {
        toast("Your role cannot submit cash movements.", "error");
        return;
      }

      const transactionType =
        document.getElementById("cashType").value;

      const amount = Number(
        document.getElementById("cashAmount").value
      );

      const transactionDate =
        document.getElementById("cashDate").value;

      const paymentMethod =
        document.getElementById("cashMethod").value;

      const category =
        document.getElementById("cashCategory").value.trim();

      const reference =
        document.getElementById("cashReference").value.trim();

      const description =
        document.getElementById("cashDescription").value.trim();

      if (!CASH_TYPES[transactionType]) {
        toast("Choose a valid transaction type.", "error");
        return;
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        toast("Enter an amount greater than zero.", "error");
        return;
      }

      if (!transactionDate || transactionDate > today()) {
        toast("Enter a valid transaction date.", "error");
        return;
      }

      if (!description) {
        toast("Enter a description.", "error");
        return;
      }

      const button =
        cashForm.querySelector('button[type="submit"]');

      button.disabled = true;
      button.textContent = "Submitting…";

      try {
        const { data, error } = await db.rpc(
          "submit_petty_cash_transaction",
          {
            p_organization_id: organization.id,
            p_transaction_date: transactionDate,
            p_transaction_type: transactionType,
            p_amount: amount,
            p_category: category || null,
            p_payment_method: paymentMethod,
            p_reference: reference || null,
            p_description: description
          }
        );

        if (error) throw error;

        toast(
          "Cash movement submitted. It is pending approval/posting."
        );

        cashForm.reset();
        document.getElementById("cashDate").value = today();

        await refresh();
      } catch (error) {
        console.error("Cash movement submit error:", error);

        toast(
          error.message || "Unable to submit cash movement.",
          "error"
        );
      } finally {
        button.disabled = false;
        button.textContent = "Submit cash movement";
      }
    });

    const expenseForm =
      document.getElementById("expenseForm");

    expenseForm?.addEventListener("submit", async event => {
      event.preventDefault();

      if (!SUBMIT_ROLES.includes(profile?.roleCode)) {
        toast("Your role cannot submit expenses.", "error");
        return;
      }

      const expenseDate =
        document.getElementById("expenseDate").value;

      const category =
        document.getElementById("expenseCategory").value.trim();

      const payee =
        document.getElementById("expensePayee").value.trim();

      const amount = Number(
        document.getElementById("expenseAmount").value
      );

      const paymentMethod =
        document.getElementById("expenseMethod").value;

      const reference =
        document.getElementById("expenseReference").value.trim();

      const description =
        document.getElementById("expenseDescription").value.trim();

      if (!expenseDate || expenseDate > today()) {
        toast("Enter a valid expense date.", "error");
        return;
      }

      if (!category) {
        toast("Enter an expense category.", "error");
        return;
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        toast("Enter an amount greater than zero.", "error");
        return;
      }

      if (!description) {
        toast("Enter an expense description.", "error");
        return;
      }

      const button =
        expenseForm.querySelector('button[type="submit"]');

      button.disabled = true;
      button.textContent = "Submitting…";

      try {
        const { error } = await db.rpc(
          "submit_expense_request",
          {
            p_organization_id: organization.id,
            p_branch_id: null,
            p_expense_date: expenseDate,
            p_category: category,
            p_payee: payee || null,
            p_amount: amount,
            p_payment_method: paymentMethod,
            p_reference: reference || null,
            p_description: description,
            p_receipt_path: null
          }
        );

        if (error) throw error;

        toast(
          "Expense request submitted for review."
        );

        expenseForm.reset();
        document.getElementById("expenseDate").value = today();

        await refresh();
      } catch (error) {
        console.error("Expense request submit error:", error);

        toast(
          error.message || "Unable to submit expense request.",
          "error"
        );
      } finally {
        button.disabled = false;
        button.textContent = "Submit expense request";
      }
    });

    await refresh();
  }

  window.GORACashbookModule = {
    handles,
    render
  };
})();
