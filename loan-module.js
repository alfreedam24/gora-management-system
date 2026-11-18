
/* =========================================================
   GORA 2.0 — LOAN MODULE
   Read-only loan operations and portfolio monitoring.
   Uses the existing Supabase schema.
   No financial records are created or changed here.
========================================================= */

(() => {
  "use strict";

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const sections = [
    ["overview", "Overview"],
    ["products", "Loan products"],
    ["applications", "Applications"],
    ["fees", "Processing fees"],
    ["accounts", "Loan accounts"],
    ["schedules", "Repayment schedules"],
    ["repayments", "Repayments"],
    ["accounting", "Loan accounting"],
    ["reports", "Loan reports"]
  ];

  let currentSection = "overview";
  let requestNumber = 0;

  function getContext() {
    return {
      database: typeof db !== "undefined" ? db : null,
      organization: typeof organizationId !== "undefined"
        ? organizationId
        : null
    };
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function money(value) {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 2
    }).format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return escapeHTML(value);
    }

    return date.toLocaleDateString("en-KE", {
      timeZone: "Africa/Nairobi",
      dateStyle: "medium"
    });
  }

  function formatStatus(value) {
    const status = String(value || "UNKNOWN").toUpperCase();

    return `<span class="pill">${escapeHTML(status)}</span>`;
  }

  function cell(value) {
    return `<td>${escapeHTML(value ?? "—")}</td>`;
  }

  function cashCell(value) {
    return `<td>${money(value)}</td>`;
  }

  function makeTable(headers, rows) {
    return `
      <div class="tablebox">
        <table>
          <thead>
            <tr>
              ${headers.map(header =>
                `<th>${escapeHTML(header)}</th>`
              ).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.length
              ? rows.join("")
              : `<tr>
                  <td colspan="${headers.length}" class="empty">
                    No records found.
                  </td>
                </tr>`
            }
          </tbody>
        </table>
      </div>
    `;
  }

  function panel(title, content) {
    return `
      <section class="panel">
        <h3>${escapeHTML(title)}</h3>
        ${content}
      </section>
    `;
  }

  function metric(title, value) {
    return `
      <article class="stat">
        <small>${escapeHTML(title)}</small>
        <strong>${escapeHTML(value)}</strong>
      </article>
    `;
  }

  async function getRecords(tableName, orderColumn = "created_at") {
    const { database, organization } = getContext();

    if (!database || !organization) {
      throw new Error(
        "Your session or organisation could not be verified. Sign in again."
      );
    }

    let query = database
      .from(tableName)
      .select("*")
      .eq("organization_id", organization)
      .limit(500);

    if (orderColumn) {
      query = query.order(orderColumn, {
        ascending: false
      });
    }

    const { data, error } = await query;

    if (error) throw error;

    return data || [];
  }

  function setPageTitle() {
    const title = $("#title");

    if (title) {
      title.textContent = "Loan Module";
    }
  }

  function renderLayout() {
    const content = $("#content");

    if (!content) {
      console.error("GORA Loan Module: #content was not found.");
      return;
    }

    setPageTitle();

    const tabs = sections.map(([id, label]) => `
      <button
        type="button"
        class="secondary"
        data-loan-tab="${id}"
        aria-pressed="${currentSection === id}"
      >
        ${escapeHTML(label)}
      </button>
    `).join("");

    content.innerHTML = `
      <div class="page-head">
        <div>
          <h2>Loan management</h2>
          <p>Monitor loan products, applications, accounts and repayments.</p>
        </div>
      </div>

      <div class="loan-tabs">
        ${tabs}
      </div>

      <div id="loan-content">
        <div class="loading">Loading loan records...</div>
      </div>

      <div class="hint">
        Read-only monitoring mode. Financial transactions require
        separately secured approval and posting workflows.
      </div>
    `;

    content.querySelectorAll("[data-loan-tab]").forEach(button => {
      button.addEventListener("click", () => {
        currentSection = button.dataset.loanTab;
        renderLayout();
        renderSection();
      });
    });
  }

  function showError(error) {
    const host = $("#loan-content");
    if (!host) return;

    host.innerHTML = panel(
      "Unable to load loan records",
      `
        <p>${escapeHTML(
          error?.message || "An unexpected error occurred."
        )}</p>
        <button type="button" class="secondary" id="loan-retry">
          Try again
        </button>
      `
    );

    $("#loan-retry")?.addEventListener("click", renderSection);
  }

  async function renderOverview() {
    const [products, applications, accounts, repayments] =
      await Promise.all([
        getRecords("loan_products"),
        getRecords("loan_applications", "applied_at"),
        getRecords("loan_accounts"),
        getRecords("loan_repayments", "payment_date")
      ]);

    const pending = applications.filter(application =>
      ["PENDING", "SUBMITTED", "PENDING_REVIEW"]
        .includes(String(application.status).toUpperCase())
    );

    return `
      <div class="stats">
        ${metric("Loan products", products.length)}
        ${metric("Applications", applications.length)}
        ${metric("Pending applications", pending.length)}
        ${metric("Loan accounts", accounts.length)}
        ${metric("Repayments recorded", repayments.length)}
      </div>

      ${panel("Recent applications", makeTable(
        ["Application", "Borrower type", "Requested amount", "Status", "Date"],
        applications.slice(0, 10).map(item => `
          <tr>
            ${cell(item.application_number)}
            ${cell(item.borrower_type)}
            ${cashCell(item.requested_amount)}
            <td>${formatStatus(item.status)}</td>
            ${cell(formatDate(item.applied_at))}
          </tr>
        `)
      ))}

      ${panel("Financial safeguards", `
        <ul>
          <li>Member savings are liabilities, not lending capital.</li>
          <li>An approved application is not automatically a disbursed loan.</li>
          <li>Repayments must be allocated to repayment schedules.</li>
          <li>Financial postings must be traceable and authorised.</li>
        </ul>
      `)}
    `;
  }

  async function renderProducts() {
    const rows = await getRecords("loan_products");

    return panel("Loan products", makeTable(
      [
        "Code", "Product", "Minimum", "Maximum",
        "Interest rate", "Method", "Duration",
        "Repayment frequency", "Status"
      ],
      rows.map(item => `
        <tr>
          ${cell(item.product_code)}
          ${cell(item.product_name)}
          ${cashCell(item.minimum_amount)}
          ${cashCell(item.maximum_amount)}
          ${cell(item.interest_rate)}
          ${cell(item.interest_method)}
          ${cell(`${item.duration_min}–${item.duration_max} ${item.duration_unit}`)}
          ${cell(item.repayment_frequency)}
          <td>${formatStatus(item.status)}</td>
        </tr>
      `)
    ));
  }

  async function renderApplications() {
    const rows = await getRecords(
      "loan_applications",
      "applied_at"
    );

    return panel("Loan applications", makeTable(
      [
        "Application", "Borrower type", "Requested",
        "Approved", "Duration", "Status", "Date"
      ],
      rows.map(item => `
        <tr>
          ${cell(item.application_number)}
          ${cell(item.borrower_type)}
          ${cashCell(item.requested_amount)}
          ${cashCell(item.approved_amount)}
          ${cell(item.approved_duration
            ? `${item.approved_duration} ${item.approved_duration_unit || ""}`
            : "Not approved")}
          <td>${formatStatus(item.status)}</td>
          ${cell(formatDate(item.applied_at))}
        </tr>
      `)
    ));
  }

  async function renderFees() {
    const rows = await getRecords(
      "loan_applications",
      "applied_at"
    );

    return panel("Processing fee information", `
      <p>
        This screen displays processing-fee terms recorded on
        loan applications. It does not record or verify payments.
      </p>
      ${makeTable(
        [
          "Application", "Fee type", "Fee value",
          "Approved amount", "Status"
        ],
        rows.map(item => `
          <tr>
            ${cell(item.application_number)}
            ${cell(item.approved_processing_fee_type)}
            ${cell(item.approved_processing_fee_value)}
            ${cashCell(item.approved_amount)}
            <td>${formatStatus(item.status)}</td>
          </tr>
        `)
      )}
      <p class="hint">
        A separate verified payment register is needed before
        processing-fee collections can be recorded here.
      </p>
    `);
  }

  async function renderAccounts() {
    const rows = await getRecords("loan_accounts");

    return panel("Loan accounts", makeTable(
      [
        "Account reference", "Borrower type", "Principal",
        "Total interest", "Total repayment",
        "Disbursed on", "Status"
      ],
      rows.map(item => `
        <tr>
          ${cell(String(item.id || "").slice(0, 8))}
          ${cell(item.borrower_type)}
          ${cashCell(item.principal_amount)}
          ${cashCell(item.total_interest)}
          ${cashCell(item.total_repayment)}
          ${cell(formatDate(item.disbursed_on))}
          <td>${formatStatus(item.status)}</td>
        </tr>
      `)
    ));
  }

  async function renderSchedules() {
    const rows = await getRecords(
      "loan_repayment_schedules",
      "due_date"
    );

    return panel("Repayment schedules", makeTable(
      [
        "Loan account", "Installment", "Due date",
        "Principal due", "Interest due", "Total due", "Status"
      ],
      rows.map(item => `
        <tr>
          ${cell(String(item.loan_account_id || "").slice(0, 8))}
          ${cell(item.installment_number)}
          ${cell(formatDate(item.due_date))}
          ${cashCell(item.principal_due)}
          ${cashCell(item.interest_due)}
          ${cashCell(item.total_due)}
          <td>${formatStatus(item.status)}</td>
        </tr>
      `)
    ));
  }

  async function renderRepayments() {
    const rows = await getRecords(
      "loan_repayments",
      "payment_date"
    );

    return panel("Repayments", makeTable(
      [
        "Loan account", "Payment date", "Amount",
        "Method", "Reference", "Status"
      ],
      rows.map(item => `
        <tr>
          ${cell(String(item.loan_account_id || "").slice(0, 8))}
          ${cell(formatDate(item.payment_date))}
          ${cashCell(item.amount)}
          ${cell(item.payment_method)}
          ${cell(item.reference_number)}
          <td>${formatStatus(item.status)}</td>
        </tr>
      `)
    ));
  }

  async function renderAccounting() {
    const rows = await getRecords(
      "journal_entries",
      "entry_date"
    );

    const loanEntries = rows.filter(item =>
      String(item.source_type || "")
        .toLowerCase()
        .includes("loan")
    );

    return panel("Loan journal entries", makeTable(
      [
        "Entry number", "Date", "Description",
        "Source", "Status"
      ],
      loanEntries.map(item => `
        <tr>
          ${cell(item.entry_number)}
          ${cell(formatDate(item.entry_date))}
          ${cell(item.description)}
          ${cell(item.source_type)}
          <td>${formatStatus(item.status)}</td>
        </tr>
      `)
    ));
  }

  async function renderReports() {
    const [accounts, schedules, repayments] =
      await Promise.all([
        getRecords("loan_accounts"),
        getRecords("loan_repayment_schedules", "due_date"),
        getRecords("loan_repayments", "payment_date")
      ]);

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Nairobi"
    }).format(new Date());

    const overdue = schedules.filter(item =>
      item.due_date < today &&
      !["PAID", "WAIVED"].includes(
        String(item.status).toUpperCase()
      )
    );

    const overdueScheduled = overdue.reduce(
      (sum, item) => sum + Number(item.total_due || 0),
      0
    );

    const postedRepayments = repayments
      .filter(item =>
        String(item.status).toUpperCase() === "POSTED"
      )
      .reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0
      );

    return `
      <div class="stats">
        ${metric("Loan accounts", accounts.length)}
        ${metric("Overdue scheduled instalments", overdue.length)}
        ${metric("Gross overdue scheduled", money(overdueScheduled))}
        ${metric("Posted repayments", money(postedRepayments))}
      </div>

      ${panel("Portfolio risk monitoring", `
        <p>
          These figures show gross scheduled amounts, not verified
          outstanding arrears. Repayment allocations must be
          deducted before calculating accurate arrears or PAR.
        </p>
        <p>
          No PAR percentage is displayed until allocation-level
          balances can be verified.
        </p>
      `)}

      ${panel("Overdue instalments", makeTable(
        [
          "Loan account", "Instalment", "Due date",
          "Scheduled amount", "Status"
        ],
        overdue.map(item => `
          <tr>
            ${cell(String(item.loan_account_id || "").slice(0, 8))}
            ${cell(item.installment_number)}
            ${cell(formatDate(item.due_date))}
            ${cashCell(item.total_due)}
            <td>${formatStatus(item.status)}</td>
          </tr>
        `)
      ))}
    `;
  }

  async function renderSection() {
    const host = $("#loan-content");
    if (!host) return;

    const thisRequest = ++requestNumber;

    host.innerHTML = '<div class="loading">Loading...</div>';

    try {
      let html;

      switch (currentSection) {
        case "overview":
          html = await renderOverview();
          break;
        case "products":
          html = await renderProducts();
          break;
        case "applications":
          html = await renderApplications();
          break;
        case "fees":
          html = await renderFees();
          break;
        case "accounts":
          html = await renderAccounts();
          break;
        case "schedules":
          html = await renderSchedules();
          break;
        case "repayments":
          html = await renderRepayments();
          break;
        case "accounting":
          html = await renderAccounting();
          break;
        case "reports":
          html = await renderReports();
          break;
        default:
          throw new Error("Unknown Loan Module section.");
      }

      if (thisRequest !== requestNumber) return;

      host.innerHTML = html;

    } catch (error) {
      if (thisRequest === requestNumber) {
        showError(error);
      }
    }
  }

  function open() {
    currentSection = "overview";
    renderLayout();
    renderSection();
  }

  function installNavigation() {
    const nav = $("#nav");

    if (!nav || nav.querySelector('[data-page="Loan Module"]')) {
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-item";
    button.dataset.page = "Loan Module";
    button.textContent = "Loan Module";

    const creditLabel = [...nav.querySelectorAll(".nav-label")]
      .find(item =>
        item.textContent.trim().toUpperCase() === "CREDIT"
      );

    if (creditLabel) {
      creditLabel.insertAdjacentElement("afterend", button);
    } else {
      nav.appendChild(button);
    }

    nav.addEventListener("click", event => {
      const target = event.target.closest(
        '[data-page="Loan Module"]'
      );

      if (!target) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      nav.querySelectorAll(".nav-item").forEach(item => {
        item.classList.toggle("active", item === target);
      });

      $("#sidebar")?.classList.remove("open");
      open();
    }, true);
  }

  function installStyles() {
    if ($("#loan-module-style")) return;

    const style = document.createElement("style");
    style.id = "loan-module-style";

    style.textContent = `
      .loan-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 16px;
      }

      .loan-tabs button {
        font-size: 12px;
        padding: 9px 12px;
      }

      .loan-tabs button[aria-pressed="true"] {
        background: #075985;
        color: white;
      }

      #loan-content .panel {
        overflow-x: auto;
      }

      #loan-content ul {
        padding-left: 22px;
        line-height: 1.9;
        font-size: 13px;
      }
    `;

    document.head.appendChild(style);
  }

  window.GoraLoanModule = {
    open,
    refresh: renderSection
  };

  installStyles();
  installNavigation();

})();
