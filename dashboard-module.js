
(() => {
  const $ = (id) => document.getElementById(id);

  const money = (value) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 0
    }).format(Number(value || 0));

  const count = (value) =>
    new Intl.NumberFormat("en-KE").format(Number(value || 0));

  const percent = (value) =>
    value == null ? "—" : `${(Number(value) * 100).toFixed(1)}%`;

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));

  function getRange(period) {
    const now = new Date();
    const today = new Date(
      now.getFullYear(), now.getMonth(), now.getDate()
    );

    const iso = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    let from = new Date(today);

    if (period === "lastMonth") {
      from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const to = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: iso(from), to: iso(to) };
    }

    if (period === "90days") {
      from.setDate(from.getDate() - 89);
    } else if (period === "ytd") {
      from = new Date(today.getFullYear(), 0, 1);
    } else {
      from = new Date(today.getFullYear(), today.getMonth(), 1);
    }

    return { from: iso(from), to: iso(today) };
  }

  function card(label, value, note = "") {
    return `
      <article class="stat-card">
        <div class="stat-top">${esc(label)}</div>
        <strong>${esc(value)}</strong>
        <small>${esc(note)}</small>
      </article>`;
  }

  function bar(label, value, max, colorClass) {
    const width = max > 0
      ? Math.min(100, Math.max(0, Number(value || 0) / max * 100))
      : 0;

    return `
      <div class="gora-bar-row">
        <div class="gora-bar-label">
          <span>${esc(label)}</span>
          <b>${money(value)}</b>
        </div>
        <div class="gora-bar-track">
          <div class="gora-bar-fill ${colorClass}"
               style="width:${width.toFixed(1)}%"></div>
        </div>
      </div>`;
  }

  async function render(moduleName, ctx) {
    const host = $("pageContent");
    if (!host) return;

    host.innerHTML = `
      <section class="gora-dashboard">
        <div class="dashboard-heading">
          <div>
            <h2>CEO Dashboard</h2>
            <p>Live figures from GORA's records and posted ledger.</p>
          </div>
          <select id="goraDashboardPeriod" aria-label="Dashboard period">
            <option value="thisMonth">This month</option>
            <option value="lastMonth">Last month</option>
            <option value="90days">Last 90 days</option>
            <option value="ytd">Year to date</option>
          </select>
        </div>
        <div id="goraDashboardContent">
          <div class="loading-panel">Loading verified figures…</div>
        </div>
      </section>`;

    const select = $("goraDashboardPeriod");

    async function load() {
      const range = getRange(select.value);
      const target = $("goraDashboardContent");

      target.innerHTML =
        '<div class="loading-panel">Loading dashboard…</div>';

      try {
        const { data, error } = await ctx.db.rpc(
          "gora2_dashboard_summary",
          {
            _organization_id: ctx.organization.id,
            _from: range.from,
            _to: range.to
          }
        );

        if (error) throw error;
        if (!data) throw new Error("Dashboard returned no data.");

        const maxCollection = Math.max(
          Number(data.expected_collection || 0),
          Number(data.actual_collection || 0),
          1
        );

        const profit = Number(data.period_net_profit || 0);
        const profitLabel = data.profit_available
          ? money(profit)
          : "Not verified";

        target.innerHTML = `
          <div class="gora-dashboard-grid">
            ${card("Active members", count(data.active_members),
              `${count(data.new_members)} new in selected period`)}
            ${card("Active chamas", count(data.active_chamas))}
            ${card("Active loan accounts", count(data.active_loan_accounts))}
            ${card("Applications awaiting action",
              count(data.applications_awaiting_action))}
            ${card("Outstanding principal",
              money(data.outstanding_principal))}
            ${card("Disbursed in period",
              money(data.disbursed_in_period))}
            ${card("Expected collection",
              money(data.expected_collection))}
            ${card("Actual collection",
              money(data.actual_collection))}
            ${card("Collection rate",
              percent(data.collection_rate))}
            ${card("PAR 30",
              percent(data.par30),
              money(data.overdue_principal_30) + " overdue principal 30+")}
            ${card("Ledger cash / bank",
              money(data.ledger_cash_bank),
              "Posted ledger balance")}
            ${card("Net profit",
              profitLabel,
              data.profit_available
                ? (profit >= 0 ? "Positive posted result" : "Negative posted result")
                : "No posted journal data")}
          </div>

          <section class="gora-dashboard-panel">
            <h3>Expected vs actual collection</h3>
            <p class="muted">
              Selected period: ${esc(range.from)} to ${esc(range.to)}
            </p>
            ${bar("Expected", data.expected_collection,
              maxCollection, "gora-bar-expected")}
            ${bar("Actual received", data.actual_collection,
              maxCollection, "gora-bar-actual")}
          </section>

          <section class="gora-dashboard-panel">
            <h3>Arrears</h3>
            <div class="gora-dashboard-grid">
              ${card("Overdue amount", money(data.overdue_amount))}
              ${card("Overdue principal 30+",
                money(data.overdue_principal_30))}
            </div>
          </section>

          <div class="note-box">
            <b>Cash available to lend:</b> Not calculated yet.
            ${esc(data.cash_available_note || "")}
          </div>

          <p class="small-note">
            Collection figures are loan collections, not profit.
            Profit uses posted ledger income minus posted ledger expenses.
          </p>
        `;
      } catch (err) {
        target.innerHTML = `
          <div class="warning-box">
            <b>Dashboard could not load.</b>
            <p>${esc(err.message || "Please check your access and connection.")}</p>
            <button class="btn btn-primary" id="goraDashboardRetry">
              Retry
            </button>
          </div>`;
        $("goraDashboardRetry").onclick = load;
      }
    }

    select.onchange = load;
    await load();
  }

  window.GORADashboardModule = {
    handles: (name) => name === "Dashboard",
    render
  };
})();
