
(function () {
  'use strict';

  const money = value => new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0
  }).format(Number(value || 0));

  const escapeHTML = value => String(value ?? '').replace(
    /[&<>"']/g,
    char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char])
  );

  let organizationId = null;
  let products = [];
  let editingId = null;

  const getDB = () => {
    if (typeof db === 'undefined' || !db) {
      throw new Error('GORA database connection is unavailable. Please sign in again.');
    }
    return db;
  };

  const el = id => document.getElementById(id);

  async function checkAdministrator() {
    const client = getDB();

    const { data: authData, error: authError } =
      await client.auth.getUser();

    if (authError || !authData.user) {
      throw new Error('Please sign in to GORA again.');
    }

    const { data: assignments, error } = await client
      .from('user_roles')
      .select('organization_id, role_id')
      .eq('user_id', authData.user.id)
      .eq('is_active', true);

    if (error) throw error;

    const roleIds = (assignments || []).map(x => x.role_id);

    if (!roleIds.length) {
      throw new Error('Your account has no active organisation role.');
    }

    const { data: roles, error: roleError } = await client
      .from('roles')
      .select('id, role_code')
      .in('id', roleIds);

    if (roleError) throw roleError;

    const adminAssignments = (assignments || []).filter(assignment =>
      (roles || []).some(role =>
        role.id === assignment.role_id &&
        role.role_code === 'SUPER_ADMIN'
      )
    );

    if (!adminAssignments.length) {
      throw new Error(
        'Only a GORA SUPER_ADMIN can manage loan products.'
      );
    }

    const orgs = [...new Set(
      adminAssignments.map(x => x.organization_id).filter(Boolean)
    )];

    if (orgs.length !== 1) {
      throw new Error(
        'Your account must have exactly one active GORA administrator organisation for this screen.'
      );
    }

    organizationId = orgs[0];
  }

  function addNavigation() {
    const nav = el('nav');
    if (!nav || nav.querySelector('[data-page="Loan Products"]')) return;

    const applications = nav.querySelector('[data-page="Applications"]');

    const button = document.createElement('button');
    button.className = 'nav-item';
    button.dataset.page = 'Loan Products';
    button.innerHTML = '<span>⚙</span>Loan products';

    if (applications) {
      applications.insertAdjacentElement('afterend', button);
    } else {
      nav.appendChild(button);
    }

    nav.addEventListener('click', event => {
      const target = event.target.closest('[data-page="Loan Products"]');
      if (!target) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      nav.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item === target);
      });

      el('sidebar')?.classList.remove('open');

      if (typeof load === 'function') {
        load('Loan Products');
      }
    }, true);
  }

  function renderPage() {
    const content = el('content');
    if (!content) return;

    content.innerHTML = `
      <div class="page-heading">
        <div>
          <h2>Loan products</h2>
          <div class="sub">
            Configure loan limits, interest, duration and fees.
          </div>
        </div>
        <span class="pill">ADMIN ONLY</span>
      </div>

      <div class="notice">
        Product settings control the terms available for future loan
        applications. Saving a product does not approve or disburse a loan.
      </div>

      <div class="panel">
        <h3 id="loanFormTitle">Create loan product</h3>

        <form id="loanProductForm">
          <div class="grid-two">
            <label>
              Product code
              <input name="product_code" required maxlength="30"
                placeholder="e.g. EMERGENCY">
            </label>

            <label>
              Product name
              <input name="product_name" required maxlength="100"
                placeholder="e.g. Emergency Loan">
            </label>

            <label>
              Minimum loan amount (KSh)
              <input name="minimum_amount" type="number"
                min="1" step="1" required>
            </label>

            <label>
              Maximum loan amount (KSh)
              <input name="maximum_amount" type="number"
                min="1" step="1" required>
            </label>

            <label>
              Interest rate (%)
              <input name="interest_rate" type="number"
                min="0" step="0.01" required>
            </label>

            <label>
              Interest calculation method
              <select name="interest_method" required>
                <option value="FLAT">Flat rate</option>
                <option value="REDUCING_BALANCE">Reducing balance</option>
              </select>
            </label>

            <label>
              Interest period
              <select name="interest_period" required>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY" selected>Monthly</option>
                <option value="ANNUAL">Annual</option>
              </select>
            </label>

            <label>
              Minimum duration
              <input name="duration_min" type="number"
                min="1" step="1" required>
            </label>

            <label>
              Maximum duration
              <input name="duration_max" type="number"
                min="1" step="1" required>
            </label>

            <label>
              Duration unit
              <select name="duration_unit" required>
                <option value="DAYS">Days</option>
                <option value="WEEKS">Weeks</option>
                <option value="MONTHS" selected>Months</option>
              </select>
            </label>

            <label>
              Repayment frequency
              <select name="repayment_frequency" required>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Every two weeks</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </label>

            <label>
              Processing fee type
              <select name="processing_fee_type">
                <option value="NONE">No fee</option>
                <option value="FIXED">Fixed amount (KSh)</option>
                <option value="PERCENTAGE">Percentage (%)</option>
              </select>
            </label>

            <label>
              Processing fee value
              <input name="processing_fee_value" type="number"
                min="0" step="0.01" value="0">
            </label>

            <label>
              Late penalty type
              <select name="late_penalty_type">
                <option value="NONE">No penalty</option>
                <option value="FIXED">Fixed amount (KSh)</option>
                <option value="PERCENTAGE">Percentage (%)</option>
              </select>
            </label>

            <label>
              Late penalty value
              <input name="late_penalty_value" type="number"
                min="0" step="0.01" value="0">
            </label>

            <label>
              Product status
              <select name="status">
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
          </div>

          <label>
            Description
            <textarea name="description" rows="3"
              maxlength="1000"
              placeholder="Explain the purpose and conditions of this product."></textarea>
          </label>

          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:15px">
            <button class="primary" type="submit" id="saveLoanProduct">
              Save loan product
            </button>
            <button class="secondary" type="button" id="cancelLoanEdit"
              style="display:none">
              Cancel editing
            </button>
          </div>

          <p id="loanProductMessage" class="message" role="status"></p>
        </form>
      </div>

      <div class="tablebox">
        <div class="table-head">
          <h3>Configured loan products</h3>
        </div>
        <div id="loanProductsTable" style="padding:10px">
          Loading loan products...
        </div>
      </div>

      <div class="notice">
        Only authorised administrators can manage products.
        Deactivating a product prevents it being offered as an active
        product. Existing loans must retain their original agreed terms.
      </div>
    `;

    el('loanProductForm').addEventListener('submit', saveProduct);
    el('cancelLoanEdit').addEventListener('click', resetForm);
  }

  async function loadProducts() {
    const client = getDB();

    const { data, error } = await client
      .from('loan_products')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    products = data || [];
    renderProductsTable();
  }

  function renderProductsTable() {
    const target = el('loanProductsTable');
    if (!target) return;

    if (!products.length) {
      target.innerHTML = `
        <p class="sub">
          No loan products have been created yet.
          Use the form above to add your first product.
        </p>`;
      return;
    }

    target.innerHTML = `
      <div style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Loan limits</th>
              <th>Interest</th>
              <th>Duration</th>
              <th>Repayment</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${products.map(product => `
              <tr>
                <td>
                  <b>${escapeHTML(product.product_name)}</b><br>
                  <small>${escapeHTML(product.product_code)}</small>
                </td>
                <td>
                  ${money(product.minimum_amount)} –
                  ${money(product.maximum_amount)}
                </td>
                <td>
                  ${Number(product.interest_rate)}%
                  <br>
                  <small>
                    ${escapeHTML(product.interest_method)}
                    / ${escapeHTML(product.interest_period)}
                  </small>
                </td>
                <td>
                  ${product.duration_min}–${product.duration_max}
                  ${escapeHTML(product.duration_unit)}
                </td>
                <td>${escapeHTML(product.repayment_frequency)}</td>
                <td>${escapeHTML(product.status)}</td>
                <td>
                  <button class="secondary"
                    data-edit-product="${product.id}">
                    Edit
                  </button>
                  <button class="secondary"
                    data-toggle-product="${product.id}">
                    ${product.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    target.querySelectorAll('[data-edit-product]').forEach(button => {
      button.addEventListener('click', () => {
        editProduct(button.dataset.editProduct);
      });
    });

    target.querySelectorAll('[data-toggle-product]').forEach(button => {
      button.addEventListener('click', () => {
        toggleProduct(button.dataset.toggleProduct);
      });
    });
  }

  async function saveProduct(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const message = el('loanProductMessage');
    const button = el('saveLoanProduct');
    const values = Object.fromEntries(new FormData(form).entries());

    const minimum = Number(values.minimum_amount);
    const maximum = Number(values.maximum_amount);
    const durationMin = Number(values.duration_min);
    const durationMax = Number(values.duration_max);
    const interest = Number(values.interest_rate);
    const processingFee = Number(values.processing_fee_value || 0);
    const latePenalty = Number(values.late_penalty_value || 0);

    if (minimum <= 0 || maximum < minimum) {
      message.textContent =
        'Maximum loan amount must be equal to or greater than the minimum.';
      return;
    }

    if (durationMin <= 0 || durationMax < durationMin) {
      message.textContent =
        'Maximum duration must be equal to or greater than minimum duration.';
      return;
    }

    if (
      !Number.isFinite(interest) || interest < 0 ||
      !Number.isFinite(processingFee) || processingFee < 0 ||
      !Number.isFinite(latePenalty) || latePenalty < 0
    ) {
      message.textContent = 'Enter valid non-negative rates and fees.';
      return;
    }

    const payload = {
      organization_id: organizationId,
      product_code: values.product_code.trim().toUpperCase(),
      product_name: values.product_name.trim(),
      description: values.description.trim() || null,
      minimum_amount: minimum,
      maximum_amount: maximum,
      interest_rate: interest,
      interest_method: values.interest_method,
      interest_period: values.interest_period,
      duration_min: durationMin,
      duration_max: durationMax,
      duration_unit: values.duration_unit,
      repayment_frequency: values.repayment_frequency,
      processing_fee_type: values.processing_fee_type,
      processing_fee_value: processingFee,
      late_penalty_type: values.late_penalty_type,
      late_penalty_value: latePenalty,
      status: values.status,
      updated_at: new Date().toISOString()
    };

    button.disabled = true;
    message.textContent = 'Saving product...';

    try {
      const client = getDB();
      let result;

      if (editingId) {
        result = await client
          .from('loan_products')
          .update(payload)
          .eq('id', editingId)
          .eq('organization_id', organizationId);
      } else {
        result = await client
          .from('loan_products')
          .insert(payload);
      }

      if (result.error) throw result.error;

      message.textContent = editingId
        ? 'Loan product updated successfully.'
        : 'Loan product created successfully.';

      resetForm();
      await loadProducts();

      message.textContent = 'Loan product saved successfully.';
    } catch (error) {
      message.textContent =
        'Could not save product: ' + (error.message || error);
    } finally {
      button.disabled = false;
    }
  }

  function editProduct(id) {
    const product = products.find(item => item.id === id);
    if (!product) return;

    editingId = id;

    const form = el('loanProductForm');

    Object.entries(product).forEach(([key, value]) => {
      const field = form.elements.namedItem(key);
      if (field && value !== null && value !== undefined) {
        field.value = value;
      }
    });

    el('loanFormTitle').textContent = 'Edit loan product';
    el('saveLoanProduct').textContent = 'Update loan product';
    el('cancelLoanEdit').style.display = 'inline-block';

    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function toggleProduct(id) {
    const product = products.find(item => item.id === id);
    if (!product) return;

    const nextStatus =
      product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    if (!confirm(
      `Are you sure you want to ${nextStatus.toLowerCase()} ${product.product_name}?`
    )) return;

    try {
      const { error } = await getDB()
        .from('loan_products')
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('organization_id', organizationId);

      if (error) throw error;

      await loadProducts();
    } catch (error) {
      alert('Could not update product: ' + (error.message || error));
    }
  }

  function resetForm() {
    editingId = null;

    const form = el('loanProductForm');
    if (!form) return;

    form.reset();

    el('loanFormTitle').textContent = 'Create loan product';
    el('saveLoanProduct').textContent = 'Save loan product';
    el('cancelLoanEdit').style.display = 'none';

    form.elements.namedItem('processing_fee_value').value = 0;
    form.elements.namedItem('late_penalty_value').value = 0;
  }

  async function openLoanProducts() {
    renderPage();

    const message = el('loanProductMessage');

    try {
      await checkAdministrator();
      await loadProducts();
    } catch (error) {
      const target = el('loanProductsTable');
      if (target) {
        target.innerHTML = `
          <div class="notice">
            ${escapeHTML(error.message || error)}
          </div>`;
      }

      if (message) {
        message.textContent =
          'Loan product management is unavailable for this account.';
      }
    }
  }

  window.GORALoanProducts = {
    open: openLoanProducts
  };

  addNavigation();

  // The existing GORA load() function calls this page handler.
  // This wrapper preserves all other pages.
  const originalLoad = window.load;

  if (typeof originalLoad === 'function') {
    window.load = async function (page) {
      if (page === 'Loan Products') {
        el('title').textContent = page;
        await openLoanProducts();
        return;
      }

      return originalLoad(page);
    };
  }
})();
