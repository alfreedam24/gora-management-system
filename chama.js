/* GORA 2.0 — CHAMAS MODULE: GROUP DIRECTORY */

let chamaSearch = '';
let chamaStatusFilter = 'ALL';

async function renderChamas() {
  const page = $('pageContent');

  page.innerHTML = `
    <section class="module-section">
      <div class="module-header">
        <div>
          <h2>Chamas & Groups</h2>
          <p>Manage GORA groups, membership and group activity.</p>
        </div>
        <button class="btn btn-primary" id="addChamaBtn">
          + Register Group
        </button>
      </div>

      <div class="toolbar">
        <input
          id="chamaSearch"
          type="search"
          placeholder="Search group name, code or location..."
          value="${esc(chamaSearch)}"
        >

        <select id="chamaStatusFilter">
          <option value="ALL">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="ACTIVE">Active</option>
          <option value="PAUSED">Paused</option>
          <option value="REJECTED">Rejected</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>

      <div id="chamaDirectory">
        <p>Loading groups...</p>
      </div>
    </section>
  `;

  $('chamaStatusFilter').value = chamaStatusFilter;

  $('addChamaBtn').onclick = openRegisterChama;

  $('chamaSearch').addEventListener('input', async e => {
    chamaSearch = e.target.value.trim();
    await loadChamaDirectory();
  });

  $('chamaStatusFilter').addEventListener('change', async e => {
    chamaStatusFilter = e.target.value;
    await loadChamaDirectory();
  });

  await loadChamaDirectory();
}

async function loadChamaDirectory() {
  const container = $('chamaDirectory');
  if (!container) return;

  try {
    let query = db
      .from('chama_groups')
      .select(`
        id,
        group_code,
        group_name,
        status,
        location,
        meeting_frequency,
        meeting_day,
        target_weekly_savings,
        maximum_members,
        registered_on
      `)
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false });

    if (chamaStatusFilter !== 'ALL') {
      query = query.eq('status', chamaStatusFilter);
    }

    if (chamaSearch) {
      const search = chamaSearch.replace(/[%_]/g, '');
      query = query.or(
        `group_name.ilike.%${search}%,` +
        `group_code.ilike.%${search}%,` +
        `location.ilike.%${search}%`
      );
    }

    const groups = await safeQuery(query);

    if (!groups || groups.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No groups found</h3>
          <p>Register a group or change your search.</p>
        </div>
      `;
      return;
    }

    const groupIds = groups.map(g => g.id);

    const memberships = await safeQuery(
      db.from('chama_memberships')
        .select('group_id,member_id')
        .eq('organization_id', organization.id)
        .eq('status', 'ACTIVE')
        .in('group_id', groupIds)
    );

    const counts = {};
    (memberships || []).forEach(row => {
      counts[row.group_id] = (counts[row.group_id] || 0) + 1;
    });

    container.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Group</th>
              <th>Location</th>
              <th>Members</th>
              <th>Weekly target</th>
              <th>Meeting</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${groups.map(group => `
              <tr>
                <td>
                  <strong>${esc(group.group_name)}</strong>
                  <small>${esc(group.group_code)}</small>
                </td>
                <td>${esc(group.location || '—')}</td>
                <td>
                  ${number(counts[group.id] || 0)}
                  ${group.maximum_members
                    ? `/ ${number(group.maximum_members)}`
                    : ''}
                </td>
                <td>${money(group.target_weekly_savings)}</td>
                <td>
                  ${esc(group.meeting_frequency || '—')}
                  ${group.meeting_day
                    ? ' · ' + esc(group.meeting_day)
                    : ''}
                </td>
                <td>${statusPill(group.status)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    container.innerHTML = `
      <div class="error-box">
        Unable to load groups: ${esc(error.message)}
      </div>
    `;
  }
}

function openRegisterChama() {
  const body = `
    <form id="registerChamaForm">
      <div class="form-grid">
        <label class="form-field">
          Group name *
          <input name="group_name" required maxlength="120">
        </label>

        <label class="form-field">
          Location
          <input name="location" maxlength="150">
        </label>

        <label class="form-field">
          Group purpose
          <input name="purpose" maxlength="250">
        </label>

        <label class="form-field">
          Maximum members
          <input
            name="maximum_members"
            type="number"
            min="5"
            value="15"
          >
        </label>

        <label class="form-field">
          Weekly savings target (KES)
          <input
            name="target_weekly_savings"
            type="number"
            min="0"
            step="1"
            value="100"
            required
          >
        </label>

        <label class="form-field">
          Meeting frequency
          <select name="meeting_frequency">
            <option value="WEEKLY">Weekly</option>
            <option value="BIWEEKLY">Biweekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </label>

        <label class="form-field">
          Meeting day
          <select name="meeting_day">
            <option value="">Select day</option>
            ${[
              'Monday', 'Tuesday', 'Wednesday',
              'Thursday', 'Friday', 'Saturday', 'Sunday'
            ].map(day => `<option>${day}</option>`).join('')}
          </select>
        </label>

        <label class="form-field">
          Meeting time
          <input name="meeting_time" type="time">
        </label>

        <label class="form-field">
          Meeting venue
          <input name="meeting_venue" maxlength="150">
        </label>

        <label class="form-field">
          Chairperson
          <input name="chairperson_name" maxlength="120">
        </label>

        <label class="form-field">
          Chairperson phone
          <input name="chairperson_phone" type="tel">
        </label>

        <label class="form-field">
          Secretary
          <input name="secretary_name" maxlength="120">
        </label>

        <label class="form-field">
          Secretary phone
          <input name="secretary_phone" type="tel">
        </label>

        <label class="form-field">
          Treasurer
          <input name="treasurer_name" maxlength="120">
        </label>

        <label class="form-field">
          Treasurer phone
          <input name="treasurer_phone" type="tel">
        </label>
      </div>

      <p class="note-box">
        Newly registered groups will be submitted for approval.
      </p>

      <p id="chamaRegisterMessage"></p>
    </form>
  `;

  openModal(
    'Register New Group',
    'Create a new GORA chama',
    body,
    `<button class="btn btn-primary" id="saveChamaBtn">
      Submit Group
    </button>`,
    true
  );

  $('saveChamaBtn').onclick = saveNewChama;
}

async function saveNewChama() {
  const form = $('registerChamaForm');
  if (!form.reportValidity()) return;

  const data = Object.fromEntries(new FormData(form).entries());

  const groupName = data.group_name.trim();
  if (!groupName) {
    setMessage('chamaRegisterMessage', 'Enter the group name.');
    return;
  }

  const groupCode =
    'GRP-' + Date.now().toString().slice(-8);

  const payload = {
    organization_id: organization.id,
    group_code: groupCode,
    group_name: groupName,
    status: 'PENDING',
    created_by: authUser.id,
    location: data.location || null,
    purpose: data.purpose || null,
    maximum_members: data.maximum_members
      ? Number(data.maximum_members)
      : 15,
    target_weekly_savings:
      Number(data.target_weekly_savings || 100),
    meeting_frequency: data.meeting_frequency,
    meeting_day: data.meeting_day || null,
    meeting_time: data.meeting_time || null,
    meeting_venue: data.meeting_venue || null,
    chairperson_name: data.chairperson_name || null,
    chairperson_phone: data.chairperson_phone || null,
    secretary_name: data.secretary_name || null,
    secretary_phone: data.secretary_phone || null,
    treasurer_name: data.treasurer_name || null,
    treasurer_phone: data.treasurer_phone || null
  };

  const button = $('saveChamaBtn');
  button.disabled = true;
  button.textContent = 'Saving...';

  try {
    const { error } = await db
      .from('chama_groups')
      .insert(payload);

    if (error) throw error;

    closeModal();
    toast('Group registered and submitted for approval.');
    await loadChamaDirectory();
  } catch (error) {
    setMessage(
      'chamaRegisterMessage',
      error.message || 'Unable to register group.'
    );
    button.disabled = false;
    button.textContent = 'Submit Group';
  }
}
