
/* =========================================================
   GORA 2.0 — APPLICATION
   Supabase authentication, dashboard and operational views.
   Never place a service-role or secret key in this file.
========================================================= */

const SUPABASE_URL = "https://ptqenrbebssgfrhcuyuw.supabase.co";

/* Replace this with your Supabase publishable/anon key. */
const SUPABASE_ANON_KEY = "sb_publishable_gwZ329lAhcPo87GEMpaqsg_5TI6wPuS";

if (!window.supabase) {
  document.body.innerHTML = "<h2>GORA could not load Supabase. Check your internet connection.</h2>";
  throw new Error("Supabase library unavailable");
}

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = selector => document.querySelector(selector);

const money = value =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2
  }).format(Number(value || 0));

const esc = value =>
  String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);

const titleCase = value =>
  String(value).replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());

const config = {
  members: {
    title: "Members",
    table: "members",
    cols: [
      "member_number", "full_name", "phone",
      "national_id", "status", "registration_date"
    ]
  },

  chama_groups: {
    title: "Chama groups",
    table: "chama_groups",
    cols: [
      "group_code", "group_name", "status",
      "meeting_frequency", "target_weekly_savings", "location"
    ]
  },

  savings_accounts: {
    title: "Savings accounts",
    table: "savings_accounts",
    cols: [
      "account_number", "member_id", "status", "opened_at"
    ]
  },

  loan_applications: {
    title: "Loan applications",
    table: "loan_applications",
    cols: [
      "application_number", "borrower_type",
      "requested_amount", "status", "applied_at"
    ]
  },

  loan_accounts: {
    title: "Loan accounts",
    table: "loan_accounts",
    cols: [
      "id", "loan_application_id", "principal_amount",
      "status", "created_at"
    ]
  },

  loan_repayments: {
    title: "Loan repayments",
    table: "loan_repayments",
    cols: [
      "loan_account_id", "payment_date", "amount",
      "payment_method", "reference_number", "status"
    ]
  },

  financial_approval_requests: {
    title: "Financial approvals",
    table: "financial_approval_requests",
    cols: [
      "request_type", "amount", "description",
      "status", "maker_user_id", "submitted_at"
    ]
  },

  capital_transactions: {
    title: "Capital transactions",
    table: "capital_transactions",
    cols: [
      "transaction_type", "amount", "transaction_date",
      "payment_method", "reference", "description"
    ]
  },

  daily_reconciliations: {
    title: "Daily reconciliation",
    table: "daily_reconciliations",
    cols: [
      "reconciliation_date", "opening_cash",
      "opening_mpesa", "opening_bank",
      "actual_closing_cash", "actual_closing_mpesa",
      "actual_closing_bank", "status"
    ]
  },

  journal_entries: {
    title: "General ledger",
    table: "journal_entries",
    cols: [
      "entry_number", "entry_date", "description",
      "source_type", "status", "posted_at"
    ]
  }
};

let currentUser = null;
let organizationId = null;
let roleCode = null;
let currentPage = "dashboard";
let authReady = false;

/* ---------------- NOTIFICATIONS ---------------- */

function toast(message) {
  const element = $("#toast");
  if (!element) return;

  element.textContent = message;
  element.style.display = "block";

  clearTimeout(window.goraToastTimer);
  window.goraToastTimer = setTimeout(() => {
    element.style.display = "none";
  }, 3500);
}

/* ---------------- AUTHENTICATION ---------------- */

async function sessionStart(session) {
  if (!session) {
    currentUser = null;
    organizationId = null;
    roleCode = null;

    $("#app")?.classList.add("hidden");
    $("#login")?.classList.remove("hidden");
    return;
  }

  if (authReady && currentUser?.id === session.user.id) return;

  currentUser = session.user;

  const { data: userRoles, error } = await db
    .from("user_roles")
    .select("organization_id, roles(role_code, role_name)")
    .eq("user_id", currentUser.id)
    .eq("is_active", true);

  if (error) {
    console.error("Role lookup failed:", error);
    $("#msg").textContent = "Unable to verify your GORA account permissions.";
    await db.auth.signOut();
    return;
  }

  if (!userRoles || userRoles.length === 0) {
    $("#msg").textContent =
      "Your account has no active GORA role. Contact the system administrator.";
    await db.auth.signOut();
    return;
  }

  organizationId = userRoles[0].organization_id;
  roleCode = userRoles[0].roles?.role_code || "STAFF";

  authReady = true;

  $("#who").textContent = currentUser.email;
$("#role").textContent = roleCode;
$("#topWho").textContent = currentUser.email;
  $("#login").classList.add("hidden");
  $("#app").classList.remove("hidden");

  navigate("dashboard");
}

$("#signin")?.addEventListener("click", async () => {
  const message = $("#msg");
  const email = $("#email")?.value.trim();
  const password = $("#password")?.value;

  if (!email || !password) {
    message.textContent = "Enter your email and password.";
    return;
  }

  message.textContent = "Signing in…";

  const { error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    message.textContent = error.message;
  } else {
    message.textContent = "Login successful. Loading workspace…";
  }
});

$("#logout")?.addEventListener("click", async () => {
  authReady = false;
  const { error } = await db.auth.signOut();

  if (error) toast(error.message);
});

db.auth.onAuthStateChange((_event, session) => {
  setTimeout(() => sessionStart(session), 0);
});

/* ---------------- NAVIGATION ---------------- */

$("#nav")?.addEventListener("click", event => {
  const button = event.target.closest("[data-page]");
  if (button) navigate(button.dataset.page);
});

$("#menuToggle")?.addEventListener("click", () => {
  $("#sidebar")?.classList.toggle("open");
});

function navigate(page) {
  if (page !== "dashboard" && page !== "reports" && !config[page]) {
    toast("This module is not available.");
    return;
  }

  currentPage = page;

  $("#sidebar")?.classList.remove("open");

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  if (page === "dashboard") {
    renderDashboard();
  } else if (page === "reports") {
    renderReports();
  } else {
    renderTablePage(page);
  }
}

/* ---------------- DATABASE HELPERS ---------------- */

async function fetchRows(table, limit = 100) {
  return await db
    .from(table)
    .select("*")
    .eq("organization_id", organizationId)
    .limit(limit);
}

function showDatabaseError(title, error) {
  $("#content").innerHTML = `
    <div class="panel error">
      <b>${esc(title)}</b>
      <p>${esc(error?.message || "An unexpected database error occurred.")}</p>
      <p class="muted">
        Check your Supabase connection, table permissions and Row Level Security.
      </p>
      <button class="secondary" onclick="navigate('dashboard')">
        Return to dashboard
      </button>
    </div>
  `;
}

/* ---------------- DASHBOARD ---------------- */

async function renderDashboard() {
  $("#pageTitle").textContent = "Dashboard";
  $("#crumb").textContent = "OVERVIEW";

  $("#content").innerHTML =
    '<div class="loading">Loading your GORA portfolio…</div>';

  try {
    const results = await Promise.all([
      fetchRows("members"),
      fetchRows("chama_groups"),
      fetchRows("loan_accounts"),
      fetchRows("savings_accounts"),
      fetchRows("financial_approval_requests")
    ]);

    const failed = results.find(result => result.error);

    if (failed) {
      showDatabaseError("Dashboard data unavailable", failed.error);
      return;
    }

    const [members, groups, loans, savings, approvals] =
      results.map(result => result.data || []);

    const activeMembers =
      members.filter(member => member.status === "ACTIVE").length;

    const pendingApprovals =
      approvals.filter(item => item.status === "PENDING").length;

    $("#content").innerHTML = `
      <div class="page-head">
        <div>
          <h2>Good day</h2>
          <p>Welcome to your GORA operations dashboard.</p>
        </div>
        <span class="badge active">CONNECTED</span>
      </div>

      <div class="stats">
        <div class="stat">
          <small>Total members</small>
          <strong>${members.length}</strong>
        </div>

        <div class="stat">
          <small>Active members</small>
          <strong>${activeMembers}</strong>
        </div>

        <div class="stat">
          <small>Chama groups</small>
          <strong>${groups.length}</strong>
        </div>

        <div class="stat">
          <small>Loan accounts</small>
          <strong>${loans.length}</strong>
        </div>
      </div>

      <div class="grid2">
        <div class="panel">
          <h3>Pending approvals</h3>
          <strong style="font-size:28px">${pendingApprovals}</strong>
          <p class="muted">Requests awaiting owner review.</p>
          <button class="secondary"
            onclick="navigate('financial_approval_requests')">
            View approvals
          </button>
        </div>

        <div class="panel">
          <h3>Savings accounts</h3>
          <strong style="font-size:28px">${savings.length}</strong>
          <p class="muted">
            Member savings are liabilities, not GORA lending capital.
          </p>
          <button class="secondary"
            onclick="navigate('savings_accounts')">
            View savings
          </button>
        </div>
      </div>

      <div class="hint">
        Dashboard counts are live database records. They are not cash balances
        or proof of financial reconciliation.
      </div>
    `;
  } catch (error) {
    showDatabaseError("Unable to load dashboard", error);
  }
}

/* ---------------- MODULE TABLES ---------------- */

async function renderTablePage(page) {
  const module = config[page];
  if (!module) return;

  $("#pageTitle").textContent = module.title;
  $("#crumb").textContent = "OPERATIONS";

  $("#content").innerHTML =
    `<div class="loading">Loading ${esc(module.title)}…</div>`;

  try {
    const { data, error } = await fetchRows(module.table, 200);

    if (error) {
      showDatabaseError(`Unable to load ${module.title}`, error);
      return;
    }

    const rows = data || [];

    const columns = module.cols.filter(column =>
      rows.length === 0 || Object.prototype.hasOwnProperty.call(rows[0], column)
    );

    const tableContent = rows.length
      ? rows.map(row => `
          <tr>
            ${columns.map(column =>
              `<td>${formatCell(column, row[column])}</td>`
            ).join("")}
          </tr>
        `).join("")
      : `<tr><td colspan="${Math.max(columns.length, 1)}"
           class="empty">No records found.</td></tr>`;

    $("#content").innerHTML = `
      <div class="page-head">
        <div>
          <h2>${esc(module.title)}</h2>
          <p>${rows.length} records · maximum 200 displayed</p>
        </div>
        <button class="secondary" onclick="navigate('dashboard')">
          Back to dashboard
        </button>
      </div>

      <div class="panel">
        <div class="toolbar">
          <input id="filterRows" placeholder="Search records…">
          <span class="muted">Read-only view</span>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                ${columns.map(column =>
                  `<th>${esc(titleCase(column))}</th>`
                ).join("")}
              </tr>
            </thead>
            <tbody id="tableBody">${tableContent}</tbody>
          </table>
        </div>
      </div>

      ${page === "financial_approval_requests" ? `
        <div class="hint">
          This page displays approval requests. Approval decisions and
          financial posting must use secure server-side workflows.
        </div>
      ` : ""}

      ${page === "daily_reconciliations" ? `
        <div class="hint">
          This page displays reconciliation records. A saved closing balance
          is not automatically proof that cash, M-Pesa and bank balances agree.
        </div>
      ` : ""}
    `;

    $("#filterRows")?.addEventListener("input", event => {
      const search = event.target.value.toLowerCase();

      $("#tableBody")?.querySelectorAll("tr").forEach(row => {
        row.style.display =
          row.textContent.toLowerCase().includes(search) ? "" : "none";
      });
    });

  } catch (error) {
    showDatabaseError(`Unable to load ${module.title}`, error);
  }
}

/* ---------------- TABLE CELL FORMATTING ---------------- */

function formatCell(column, value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (column === "status") {
    return `
      <span class="badge ${esc(String(value).toLowerCase())}">
        ${esc(value)}
      </span>
    `;
  }

  const moneyColumns = [
    "amount",
    "requested_amount",
    "principal_amount",
    "target_weekly_savings",
    "opening_cash",
    "opening_mpesa",
    "opening_bank",
    "actual_closing_cash",
    "actual_closing_mpesa",
    "actual_closing_bank"
  ];

  if (moneyColumns.includes(column)) {
    return esc(money(value));
  }

  if (typeof value === "object") {
    return esc(JSON.stringify(value));
  }

  const text = String(value);

  if (text.length > 45) {
    return esc(text.slice(0, 42) + "…");
  }

  return esc(text);
}

/* ---------------- REPORTS ---------------- */

function renderReports() {
  $("#pageTitle").textContent = "Reports";
  $("#crumb").textContent = "INSIGHTS";

  $("#content").innerHTML = `
    <div class="page-head">
      <div>
        <h2>Reports &amp; controls</h2>
        <p>Review GORA's operational and financial records.</p>
      </div>
    </div>

    <div class="grid2">
      <div class="panel">
        <h3>Portfolio monitoring</h3>
        <p class="muted">
          Loan schedules and repayment allocations are needed to calculate
          outstanding principal, arrears and PAR 1/7/30.
        </p>
        <button class="secondary"
          onclick="navigate('loan_accounts')">
          Loan accounts
        </button>
      </div>

      <div class="panel">
        <h3>Financial control</h3>
        <p class="muted">
          Review posted journal entries and daily reconciliation records.
        </p>
        <button class="secondary"
          onclick="navigate('journal_entries')">
          Open ledger
        </button>
      </div>

      <div class="panel">
        <h3>Savings protection</h3>
        <p class="muted">
          Member savings must remain separate from owner capital and
          available lending funds.
        </p>
        <button class="secondary"
          onclick="navigate('savings_accounts')">
          Savings accounts
        </button>
      </div>

      <div class="panel">
        <h3>Approval history</h3>
        <p class="muted">
          Financial requests should have a traceable maker, approver
          and posting record.
        </p>
        <button class="secondary"
          onclick="navigate('financial_approval_requests')">
          Approval queue
        </button>
      </div>
    </div>

    <div class="hint">
      These are reporting navigation links, not completed automated
      financial reports. Official financial totals must come from
      validated posted transactions.
    </div>
  `;
}

/* ---------------- START APPLICATION ---------------- */

async function initializeGora() {
  const { data, error } = await db.auth.getSession();

  if (error) {
    console.error("Session error:", error);
    $("#msg").textContent = "Unable to check your login session.";
    return;
  }

  await sessionStart(data.session);
}

initializeGora();
