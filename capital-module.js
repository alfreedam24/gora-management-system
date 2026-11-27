/* GORA 2.0 — Capital Management
 * Uses existing capital_transactions table.
 * Member savings are not included in owner capital.
 */
(() => {
  const money = (value) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 2
    }).format(Number(value || 0));

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) => ({
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

    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  };

  const TYPES = {
    capital_contribution: {
      label: "Capital contribution",
      sign: 1,
      category: "capital"
    },
    capital_withdrawal: {
      label: "Capital withdrawal",
      sign: -1,
      category: "capital"
    },
    owner_loan_in: {
      label: "Owner loan to GORA",
      sign: 1,
      category: "loan"
    },
    owner_loan_repayment: {
      label: "Repayment to owner",
      sign: -1,
      category: "loan"
    }
  };

  const CAN_POST = [
    "SUPER_ADMIN",
    "MANAGER",
    "ACCOUNTANT"
  ];

  function handles(moduleName) {
    return moduleName === "Capital Management";
  }

  async function getTransactions(db, organizationId) {
    const all = [];
    const pageSize = 1000;
    let offset = 0;

    while (true) {
      const { data, error } = await db
        .from("capital_transactions")
        .select(`
          id,
          transaction_type,
          amount,
          transaction_date,
          payment_method,
          reference,
          description,
          status,
          created_at
        `)
        .eq("organization_id", organizationId)
        .eq("status", "POSTED")
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error) throw error;

      const rows = data || [];
      all.push(...rows);

      if (rows.length < pageSize) break;
      offset += pageSize;
    }

    return all;
  }

  function calculate(transactions) {
    let capitalContributions = 0;
    let capitalWithdrawals = 0;
    let ownerLoans = 0;
    let ownerLoanRepayments = 0;

    for (const tx of transactions) {
      const amount = Number(tx.amount || 0);

      switch (tx.transaction_type) {
        case "capital_contribution":
          capitalContributions += amount;
          break;

        case "capital_withdrawal":
          capitalWithdrawals += amount;
          break;

        case "owner_loan_in":
          ownerLoans += amount;
          break;

        case "owner_loan_repayment":
          ownerLoanRepayments += amount;
          break;
      }
    }

    return {
      capitalContributions,
      capitalWithdrawals,
      capitalBalance:
        capitalContributions - capitalWithdrawals,

      ownerLoans,
      ownerLoanRepayments,
      ownerLoanBalance:
        ownerLoans - ownerLoanRepayments,

      netOwnerCash:
        capitalContributions +
        ownerLoans -
        capitalWithdrawals -
        ownerLoanRepayments
    };
  }

  function statCard(label, value, description) {
    return `
      <div class="stat-card stat-blue">
        <div class="stat-top">${esc(label)}</div>
        <strong>${money(value)}</strong>
        <small>${esc(description)}</small>
      </div>
    `;
  }

  function transactionLabel(type) {
    return TYPES[type]?.label || type || "Unknown";
  }

  function transactionRows(transactions) {
    return transactions.slice(0, 100).map(tx => {
      const isIn = TYPES[tx.transaction_type]?.sign === 1;
      const amountClass = isIn ? "text-success" : "text-danger";
      const sign = isIn ? "+" : "−";

      return `
        <tr>
          <td>${esc(tx.transaction_date || "—")}</td>
          <td>${esc(transactionLabel(tx.transaction_type))}</td>
          <td>${esc(tx.payment_method || "—").toUpperCase()}</td>
          <td>${esc(tx.reference || "—")}</td>
          <td>${esc(tx.description || "—")}</td>
          <td class="${amountClass}">
            <strong>${sign}${money(tx.amount)}</strong>
          </td>
        </tr>
      `;
    }).join("");
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
          <h2>Capital Management</h2>
          <p>Database or organization connection is missing.</p>
        </div>
      `;
      return;
    }

    const canPost = CAN_POST.includes(profile?.roleCode);

    page.innerHTML = `
      <div class="page-heading">
        <div>
          <h2>Capital Management</h2>
          <p>Manage owner capital and owner loans separately.</p>
        </div>
      </div>

      <div class="stats-grid" id="capitalStats">
        <div class="loading-panel">Loading capital records…</div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Record capital movement</h3>
            <p>Only record transactions supported by actual receipts or payments.</p>
          </div>
        </div>

        ${
          canPost
            ? `
              <form id="capitalForm" class="form-grid">
                <label>
                  Transaction type
                  <select id="capitalType" required>
                    <option value="capital_contribution">Capital contribution</option>
                    <option value="capital_withdrawal">Capital withdrawal</option>
                    <option value="owner_loan_in">Owner loan to GORA</option>
                    <option value="owner_loan_repayment">Repayment to owner</option>
                  </select>
                </label>

                <label>
                  Amount (KES)
                  <input id="capitalAmount" type="number"
                    min="0.01" step="0.01" required>
                </label>

                <label>
                  Transaction date
                  <input id="capitalDate" type="date"
                    value="${today()}" required>
                </label>

                <label>
                  Payment method
                  <select id="capitalMethod" required>
                    <option value="cash">Cash</option>
                    <option value="mpesa">M-Pesa</option>
                    <option value="bank">Bank</option>
                    <option value="other">Other</option>
                  </select>
                </label>

                <label>
                  Reference / receipt number
                  <input id="capitalReference" type="text"
                    maxlength="100" placeholder="Optional">
                </label>

                <label>
                  Description
                  <input id="capitalDescription" type="text"
                    maxlength="250" required
                    placeholder="Reason for this transaction">
                </label>

                <div class="form-actions">
                  <button class="btn btn-primary" type="submit">
                    Save transaction
                  </button>
                </div>
              </form>
            `
            : `
              <div class="note-box">
                Your role can view capital records but cannot post transactions.
                Contact a manager or accountant if a transaction needs to be entered.
              </div>
            `
        }
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Capital movement history</h3>
            <p>Showing the latest 100 posted transactions.</p>
          </div>
          <button class="btn btn-soft" id="capitalRefresh" type="button">
            Refresh
          </button>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Transaction</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Description</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody id="capitalRows">
              <tr><td colspan="6">Loading…</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="note-box">
        Capital balance represents owner equity.
        Owner loan balance represents money GORA owes the owner.
        These balances do not represent available lending cash.
      </div>
    `;

    async function refresh() {
      const stats = document.getElementById("capitalStats");
      const rows = document.getElementById("capitalRows");

      if (stats) stats.innerHTML = `
        <div class="loading-panel">Calculating balances…</div>
      `;

      if (rows) rows.innerHTML = `
        <tr><td colspan="6">Loading transactions…</td></tr>
      `;

      try {
        const transactions = await getTransactions(
          db,
          organization.id
        );

        const totals = calculate(transactions);

        if (stats) {
          stats.innerHTML = `
            ${statCard(
              "Owner capital balance",
              totals.capitalBalance,
              "Contributions less withdrawals"
            )}

            ${statCard(
              "Owner loan balance",
              totals.ownerLoanBalance,
              "Outstanding amount owed to owner"
            )}

            ${statCard(
              "Net owner cash received",
              totals.netOwnerCash,
              "Owner funds received less owner payments"
            )}

            ${statCard(
              "Total capital contributed",
              totals.capitalContributions,
              "Lifetime posted contributions"
            )}
          `;
        }

        if (rows) {
          rows.innerHTML = transactions.length
            ? transactionRows(transactions)
            : `<tr><td colspan="6">No capital transactions recorded yet.</td></tr>`;
        }
      } catch (error) {
        console.error("Capital Management load error:", error);

        if (stats) {
          stats.innerHTML = `
            <div class="note-box">
              Unable to load capital records:
              ${esc(error.message || "Unknown error")}
            </div>
          `;
        }

        if (rows) {
          rows.innerHTML = `
            <tr>
              <td colspan="6">Unable to load transaction history.</td>
            </tr>
          `;
        }
      }
    }

    const refreshButton =
      document.getElementById("capitalRefresh");

    refreshButton?.addEventListener("click", refresh);

    const form = document.getElementById("capitalForm");

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!CAN_POST.includes(profile?.roleCode)) {
        toast("Your role cannot post capital transactions.", "error");
        return;
      }

      const type =
        document.getElementById("capitalType").value;

      const amount = Number(
        document.getElementById("capitalAmount").value
      );

      const date =
        document.getElementById("capitalDate").value;

      const method =
        document.getElementById("capitalMethod").value;

      const reference =
        document.getElementById("capitalReference").value.trim();

      const description =
        document.getElementById("capitalDescription").value.trim();

      if (!TYPES[type]) {
        toast("Choose a valid transaction type.", "error");
        return;
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        toast("Enter an amount greater than zero.", "error");
        return;
      }

      if (!date || date > today()) {
        toast("Enter a valid transaction date.", "error");
        return;
      }

      if (!description) {
        toast("Enter a transaction description.", "error");
        return;
      }

      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = "Saving…";

      try {
        const { error } = await db
          .from("capital_transactions")
          .insert({
            organization_id: organization.id,
            transaction_type: type,
            amount,
            transaction_date: date,
            payment_method: method,
            reference: reference || null,
            description,
            created_by: authUser.id,
            status: "POSTED"
          });

        if (error) throw error;

        toast("Capital transaction saved.");
        form.reset();

        document.getElementById("capitalDate").value = today();
        await refresh();
      } catch (error) {
        console.error("Capital transaction save error:", error);

        toast(
          error.message ||
            "Unable to save capital transaction.",
          "error"
        );
      } finally {
        button.disabled = false;
        button.textContent = "Save transaction";
      }
    });

    await refresh();
  }

  window.GORACapitalModule = {
    handles,
    render
  };
})();
