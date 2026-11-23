/* GORA 2.0 — CHAMA GROUP MANAGEMENT MODULE
 * Depends on app.js globals:
 * $, db, organization, authUser, esc, money, number, toast,
 * openModal, closeModal, safeQuery, statusPill, setMessage
 *
 * Requires the SQL migration chama_collection_entries.sql for weekly
 * collection register records. Financial ledger posting should use the
 * approved GORA savings/loan posting workflow, not bypass it here.
 */

let chamaSearch = '';
let chamaStatusFilter = 'ALL';
let chamaSelectedGroupId = null;
let chamaCollectionWeek = chamaWeekStart(new Date());

function chamaWeekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // Monday
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function chamaWeekEnd(start) {
  const d = new Date(`${start}T00:00:00`);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

function chamaDate(value) {
  if (!value) return '—';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function chamaMoney(value) {
  return money(Number(value || 0));
}

function chamaSafeError(error) {
  return esc(error?.message || 'An unexpected error occurred.');
}

async function chamaCheck(result) {
  if (result?.error) throw result.error;
  return result?.data ?? null;
}

async function renderChamas() {
  const page = $('pageContent');
  if (!page) return;

  page.innerHTML = `
    <section class="module-section">
      <div class="module-header">
        <div>
          <h2>Chamas & Groups</h2>
          <p>Manage group registration, members, savings and loan collections.</p>
        </div>
        <button class="btn btn-primary" id="addChamaBtn" type="button">+ Register Group</button>
      </div>
      <div class="toolbar">
        <input id="chamaSearch" type="search"
          placeholder="Search group name, code or location..."
          value="${esc(chamaSearch)}">
        <select id="chamaStatusFilter">
          <option value="ALL">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="ACTIVE">Active</option>
          <option value="PAUSED">Paused</option>
          <option value="REJECTED">Rejected</option>
          <option value="CLOSED">Closed</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>
      <div id="chamaDirectory"><p>Loading groups…</p></div>
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
    let query = db.from('chama_groups')
      .select('id,group_code,group_name,status,location,meeting_frequency,meeting_day,target_weekly_savings,maximum_members,registered_on')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false });

    if (chamaStatusFilter !== 'ALL') query = query.eq('status', chamaStatusFilter);
    query = query.limit(500);
    const fetchedGroups = await safeQuery(query);
    const term = chamaSearch.toLowerCase();
    const groups = term ? (fetchedGroups || []).filter(g =>
      [g.group_name, g.group_code, g.location, g.status]
        .some(value => String(value || '').toLowerCase().includes(term))
    ) : (fetchedGroups || []);
    if (!groups?.length) {
      container.innerHTML = `<div class="empty-state"><h3>No groups found</h3><p>Register a group or change your search.</p></div>`;
      return;
    }

    const ids = groups.map(g => g.id);
    const memberships = await safeQuery(
      db.from('chama_memberships').select('group_id,member_id')
        .eq('organization_id', organization.id).eq('status', 'ACTIVE').in('group_id', ids)
    ) || [];
    const counts = {};
    memberships.forEach(m => counts[m.group_id] = (counts[m.group_id] || 0) + 1);

    container.innerHTML = `
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Group</th><th>Location</th><th>Members</th><th>Weekly target</th><th>Meeting</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>${groups.map(g => `
          <tr>
            <td><strong>${esc(g.group_name)}</strong><small>${esc(g.group_code)}</small></td>
            <td>${esc(g.location || '—')}</td>
            <td>${number(counts[g.id] || 0)}${g.maximum_members ? ` / ${number(g.maximum_members)}` : ''}</td>
            <td>${chamaMoney(g.target_weekly_savings)}</td>
            <td>${esc(g.meeting_frequency || '—')}${g.meeting_day ? ` · ${esc(g.meeting_day)}` : ''}</td>
            <td>${statusPill(g.status)}</td>
            <td><button class="btn btn-soft btn-sm" type="button" data-chama-open="${esc(g.id)}">Open profile</button></td>
          </tr>`).join('')}</tbody>
      </table></div>`;

    container.querySelectorAll('[data-chama-open]').forEach(btn => {
      btn.onclick = () => openChamaProfile(btn.getAttribute('data-chama-open'));
    });
  } catch (error) {
    container.innerHTML = `<div class="error-box">Unable to load groups: ${chamaSafeError(error)}</div>`;
  }
}

function openRegisterChama() {
  const body = `
    <form id="registerChamaForm">
      <div class="form-grid">
        <label class="form-field">Group name *<input name="group_name" required maxlength="120"></label>
        <label class="form-field">Location<input name="location" maxlength="150"></label>
        <label class="form-field">Group purpose<input name="purpose" maxlength="250"></label>
        <label class="form-field">Maximum members<input name="maximum_members" type="number" min="5" max="100" value="15"></label>
        <label class="form-field">Weekly savings target (KES)<input name="target_weekly_savings" type="number" min="0" step="1" value="100" required></label>
        <label class="form-field">Meeting frequency<select name="meeting_frequency"><option value="WEEKLY">Weekly</option><option value="BIWEEKLY">Biweekly</option><option value="MONTHLY">Monthly</option></select></label>
        <label class="form-field">Meeting day<select name="meeting_day"><option value="">Select day</option>${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d=>`<option>${d}</option>`).join('')}</select></label>
        <label class="form-field">Meeting time<input name="meeting_time" type="time"></label>
        <label class="form-field">Meeting venue<input name="meeting_venue" maxlength="150"></label>
        <label class="form-field">Chairperson<input name="chairperson_name" maxlength="120"></label>
        <label class="form-field">Chairperson phone<input name="chairperson_phone" type="tel" maxlength="30"></label>
        <label class="form-field">Secretary<input name="secretary_name" maxlength="120"></label>
        <label class="form-field">Secretary phone<input name="secretary_phone" type="tel" maxlength="30"></label>
        <label class="form-field">Treasurer<input name="treasurer_name" maxlength="120"></label>
        <label class="form-field">Treasurer phone<input name="treasurer_phone" type="tel" maxlength="30"></label>
      </div>
      <p class="note-box">New groups are submitted for approval.</p>
      <p id="chamaRegisterMessage"></p>
    </form>`;
  openModal('Register New Group', 'Create a new GORA chama', body,
    `<button class="btn btn-primary" id="saveChamaBtn" type="button">Submit Group</button>`, true);
  $('saveChamaBtn').onclick = saveNewChama;
}

async function saveNewChama() {
  const form = $('registerChamaForm');
  if (!form?.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form).entries());
  const button = $('saveChamaBtn');
  button.disabled = true;
  button.textContent = 'Saving…';

  try {
    const payload = {
      organization_id: organization.id,
      group_code: 'GRP-' + Date.now().toString().slice(-8),
      group_name: data.group_name.trim(),
      status: 'PENDING',
      created_by: authUser?.id || null,
      location: data.location || null,
      purpose: data.purpose || null,
      maximum_members: Number(data.maximum_members || 15),
      target_weekly_savings: Number(data.target_weekly_savings || 100),
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
    const { error } = await db.from('chama_groups').insert(payload);
    if (error) throw error;
    closeModal();
    toast('Group registered and submitted for approval.');
    await loadChamaDirectory();
  } catch (error) {
    setMessage('chamaRegisterMessage', error.message || 'Unable to register group.');
    button.disabled = false;
    button.textContent = 'Submit Group';
  }
}

async function openChamaProfile(groupId) {
  chamaSelectedGroupId = groupId;
  const groups = await safeQuery(db.from('chama_groups').select('*')
    .eq('organization_id', organization.id).eq('id', groupId).single());
  if (!groups) return toast('Group not found.');

  const g = groups;
  const body = `
    <div class="chama-profile">
      <div class="module-header">
        <div><h3>${esc(g.group_name)}</h3><p>${esc(g.group_code)} · ${statusPill(g.status)}</p></div>
        <button class="btn btn-soft" id="chamaEditBtn" type="button">Edit group</button>
      </div>
      <div class="form-grid">
        <div class="stat-card"><small>Members</small><h3 id="chamaMetricMembers">—</h3></div>
        <div class="stat-card"><small>Total savings</small><h3 id="chamaMetricSavings">—</h3></div>
        <div class="stat-card"><small>Loans disbursed</small><h3 id="chamaMetricDisbursed">—</h3></div>
        <div class="stat-card"><small>Loan repayments</small><h3 id="chamaMetricRepayments">—</h3></div>
        <div class="stat-card"><small>Outstanding loans</small><h3 id="chamaMetricOutstanding">—</h3></div>
        <div class="stat-card"><small>Savings collected this week</small><h3 id="chamaMetricWeeklySavings">—</h3></div>
        <div class="stat-card"><small>Loan repayments this week</small><h3 id="chamaMetricWeeklyLoans">—</h3></div>
        <div class="stat-card"><small>Total weekly collection</small><h3 id="chamaMetricWeekly">—</h3></div>
      </div>
      <div class="toolbar">
        <button class="btn btn-soft" id="chamaMembersTab" type="button">Members</button>
        <button class="btn btn-soft" id="chamaCollectionTab" type="button">Weekly collection</button>
        <button class="btn btn-soft" id="chamaHistoryTab" type="button">Transaction history</button>
        <button class="btn btn-soft" id="chamaSavingsTab" type="button">Savings</button>
        <button class="btn btn-soft" id="chamaLoansTab" type="button">Group loans</button>
        <button class="btn btn-soft" id="chamaWithdrawalsTab" type="button">Withdrawal requests</button>
        <button class="btn btn-soft" id="chamaOfficerTab" type="button">Loan officer</button>
        <button class="btn btn-soft" id="chamaSheetBtn" type="button">Collection sheet</button>
        <button class="btn btn-soft" id="chamaReportBtn" type="button">Export report</button>
      </div>
      <div id="chamaProfileContent"><p>Loading profile…</p></div>
      <div class="toolbar" id="chamaApprovalActions"></div>
    </div>`;
  openModal('Group Profile', g.group_name, body,
    `<button class="btn btn-soft" id="chamaProfileClose" type="button">Close</button>`, true);

  $('chamaProfileClose').onclick = closeModal;
  $('chamaEditBtn').onclick = () => openEditChama(g);
  $('chamaMembersTab').onclick = () => renderChamaMembers(g);
  $('chamaCollectionTab').onclick = () => renderChamaWeeklyCollection(g);
  $('chamaHistoryTab').onclick = () => renderChamaCollectionHistory(g);
  $('chamaSavingsTab').onclick = () => renderChamaSavings(g);
  $('chamaLoansTab').onclick = () => renderChamaLoans(g);
  $('chamaWithdrawalsTab').onclick = () => renderChamaWithdrawals(g);
  $('chamaOfficerTab').onclick = () => renderChamaOfficerAssignment(g);
  $('chamaSheetBtn').onclick = () => exportChamaCollectionSheet(g);
  $('chamaReportBtn').onclick = () => renderChamaReports(g);
  await loadChamaMetrics(g);
  await renderChamaMembers(g);

  const actions = $('chamaApprovalActions');
  if (g.status === 'PENDING') {
    actions.innerHTML = `<button class="btn btn-primary" id="chamaApproveBtn" type="button">Approve group</button><button class="btn btn-danger" id="chamaRejectBtn" type="button">Reject group</button>`;
    $('chamaApproveBtn').onclick = () => updateChamaStatus(g.id, 'ACTIVE');
    $('chamaRejectBtn').onclick = () => rejectChama(g.id);
  } else if (g.status === 'ACTIVE') {
    actions.innerHTML = `<button class="btn btn-soft" id="chamaPauseBtn" type="button">Pause group</button><button class="btn btn-soft" id="chamaCloseBtn" type="button">Close group</button>`;
    $('chamaPauseBtn').onclick = () => updateChamaStatus(g.id, 'PAUSED');
    $('chamaCloseBtn').onclick = () => updateChamaStatus(g.id, 'CLOSED');
  } else if (g.status === 'PAUSED') {
    actions.innerHTML = `<button class="btn btn-primary" id="chamaReactivateBtn" type="button">Reactivate group</button>`;
    $('chamaReactivateBtn').onclick = () => updateChamaStatus(g.id, 'ACTIVE');
  }
}

async function loadChamaMetrics(group) {
  try {
    const memberships = await safeQuery(db.from('chama_memberships').select('member_id,status')
      .eq('organization_id', organization.id).eq('group_id', group.id)) || [];
    const activeMemberCount = memberships.filter(x => x.status === 'ACTIVE').length;
    const memberIds = [...new Set(memberships.map(x => x.member_id))];
    const accounts = memberIds.length ? await safeQuery(db.from('savings_accounts').select('id,member_id')
      .eq('organization_id', organization.id).in('member_id', memberIds)) || [] : [];
    const accountIds = accounts.map(x => x.id);
    const savingsTx = accountIds.length ? await safeQuery(db.from('savings_transactions')
      .select('transaction_type,amount,status').eq('organization_id', organization.id)
      .in('savings_account_id', accountIds).eq('status', 'POSTED')) || [] : [];
    const savingsNet = savingsTx.reduce((sum, t) => {
      if (t.transaction_type === 'DEPOSIT') return sum + Number(t.amount || 0);
      if (t.transaction_type === 'WITHDRAWAL') return sum - Number(t.amount || 0);
      return sum;
    }, 0);

    const memberLoans = memberIds.length ? await safeQuery(db.from('loan_accounts')
      .select('id,principal_amount,status,member_id,group_id,total_repayment')
      .eq('organization_id', organization.id).in('member_id', memberIds)) || [] : [];
    const groupLoans = await safeQuery(db.from('loan_accounts')
      .select('id,principal_amount,status,member_id,group_id,total_repayment')
      .eq('organization_id', organization.id).eq('group_id', group.id)) || [];
    const loanMap = new Map();
    [...memberLoans, ...groupLoans].forEach(l => {
      if (!l.group_id || l.group_id === group.id) loanMap.set(l.id, l);
    });
    const loans = [...loanMap.values()];
    const loanIds = loans.map(l => l.id);
    const repayments = loanIds.length ? await safeQuery(db.from('loan_repayments')
      .select('loan_account_id,amount,status,payment_date').eq('organization_id', organization.id)
      .in('loan_account_id', loanIds).eq('status', 'POSTED')) || [] : [];
    const disbursed = loans.filter(l => !['CANCELLED','REJECTED','PENDING'].includes(l.status))
      .reduce((s,l) => s + Number(l.principal_amount || 0), 0);
    const repaid = repayments.reduce((s,r) => s + Number(r.amount || 0), 0);
    const outstanding = Math.max(0, loans.filter(l => ['ACTIVE','OVERDUE'].includes(l.status))
      .reduce((s,l) => s + Number(l.total_repayment || l.principal_amount || 0), 0) -
      repayments.filter(r => loans.some(l => l.id === r.loan_account_id)).reduce((s,r) => s + Number(r.amount || 0), 0));

    const weekStart = chamaWeekStart(new Date());
    const weekEnd = chamaWeekEnd(weekStart);
    const weeklySavings = savingsTx.filter(t => t.transaction_date >= `${weekStart}T00:00:00` && t.transaction_date <= `${weekEnd}T23:59:59`).reduce((sum,t) => {
      if (t.transaction_type === 'DEPOSIT') return sum + Number(t.amount || 0);
      if (t.transaction_type === 'WITHDRAWAL') return sum - Number(t.amount || 0);
      return sum;
    }, 0);
    const weeklyRepayments = repayments.filter(r => r.payment_date >= weekStart && r.payment_date <= weekEnd)
      .reduce((s,r)=>s+Number(r.amount||0),0);

    $('chamaMetricMembers').textContent = number(activeMemberCount);
    $('chamaMetricSavings').textContent = chamaMoney(savingsNet);
    $('chamaMetricDisbursed').textContent = chamaMoney(disbursed);
    $('chamaMetricRepayments').textContent = chamaMoney(repaid);
    $('chamaMetricOutstanding').textContent = chamaMoney(outstanding);
    $('chamaMetricWeekly').textContent = chamaMoney(weeklySavings + weeklyRepayments);
  } catch (error) {
    console.warn('Chama metrics could not be loaded:', error);
  }
}

function openEditChama(g) {
  const body = `<form id="editChamaForm"><div class="form-grid">
    <label class="form-field">Group name *<input name="group_name" required value="${esc(g.group_name)}"></label>
    <label class="form-field">Location<input name="location" value="${esc(g.location||'')}"></label>
    <label class="form-field">Purpose<input name="purpose" value="${esc(g.purpose||'')}"></label>
    <label class="form-field">Maximum members<input name="maximum_members" type="number" min="5" max="100" value="${Number(g.maximum_members||15)}"></label>
    <label class="form-field">Weekly savings target<input name="target_weekly_savings" type="number" min="0" value="${Number(g.target_weekly_savings||100)}"></label>
    <label class="form-field">Meeting frequency<select name="meeting_frequency"><option value="WEEKLY">Weekly</option><option value="BIWEEKLY">Biweekly</option><option value="MONTHLY">Monthly</option></select></label>
    <label class="form-field">Meeting day<input name="meeting_day" value="${esc(g.meeting_day||'')}"></label>
    <label class="form-field">Meeting time<input name="meeting_time" type="time" value="${esc(g.meeting_time||'')}"></label>
    <label class="form-field">Venue<input name="meeting_venue" value="${esc(g.meeting_venue||'')}"></label>
    <label class="form-field">Chairperson<input name="chairperson_name" value="${esc(g.chairperson_name||'')}"></label>
    <label class="form-field">Chairperson phone<input name="chairperson_phone" value="${esc(g.chairperson_phone||'')}"></label>
    <label class="form-field">Secretary<input name="secretary_name" value="${esc(g.secretary_name||'')}"></label>
    <label class="form-field">Secretary phone<input name="secretary_phone" value="${esc(g.secretary_phone||'')}"></label>
    <label class="form-field">Treasurer<input name="treasurer_name" value="${esc(g.treasurer_name||'')}"></label>
    <label class="form-field">Treasurer phone<input name="treasurer_phone" value="${esc(g.treasurer_phone||'')}"></label>
  </div><p id="chamaEditMessage"></p></form>`;
  openModal('Edit Group', g.group_name, body,
    `<button class="btn btn-primary" id="chamaSaveEdit" type="button">Save changes</button>`, true);
  $('editChamaForm').elements.meeting_frequency.value = g.meeting_frequency || 'WEEKLY';
  $('chamaSaveEdit').onclick = async () => {
    const form = $('editChamaForm');
    if (!form.reportValidity()) return;
    const d = Object.fromEntries(new FormData(form).entries());
    const { error } = await db.from('chama_groups').update({
      group_name:d.group_name.trim(),location:d.location||null,purpose:d.purpose||null,
      maximum_members:Number(d.maximum_members||15),target_weekly_savings:Number(d.target_weekly_savings||0),
      meeting_frequency:d.meeting_frequency,meeting_day:d.meeting_day||null,meeting_time:d.meeting_time||null,
      meeting_venue:d.meeting_venue||null,chairperson_name:d.chairperson_name||null,
      chairperson_phone:d.chairperson_phone||null,secretary_name:d.secretary_name||null,
      secretary_phone:d.secretary_phone||null,treasurer_name:d.treasurer_name||null,
      treasurer_phone:d.treasurer_phone||null,updated_at:new Date().toISOString()
    }).eq('organization_id',organization.id).eq('id',g.id);
    if (error) return setMessage('chamaEditMessage',error.message);
    toast('Group details updated.');
    await openChamaProfile(g.id);
  };
}

async function updateChamaStatus(groupId, status) {
  const patch = { status, updated_at: new Date().toISOString() };
  if (status === 'ACTIVE') {
    patch.approved_by = authUser?.id || null;
    patch.approved_at = new Date().toISOString();
    patch.rejected_by = null; patch.rejected_at = null; patch.rejection_reason = null;
  }
  if (status === 'CLOSED') patch.updated_at = new Date().toISOString();
  const { error } = await db.from('chama_groups').update(patch)
    .eq('organization_id', organization.id).eq('id', groupId);
  if (error) return toast(error.message);
  toast(`Group status changed to ${status}.`);
  await openChamaProfile(groupId);
  await loadChamaDirectory();
}

async function rejectChama(groupId) {
  const reason = prompt('Reason for rejecting this group (at least 5 characters):');
  if (!reason || reason.trim().length < 5) return toast('Please enter a rejection reason.');
  const { error } = await db.from('chama_groups').update({
    status:'REJECTED',rejected_by:authUser?.id||null,rejected_at:new Date().toISOString(),
    rejection_reason:reason.trim(),updated_at:new Date().toISOString()
  }).eq('organization_id',organization.id).eq('id',groupId);
  if (error) return toast(error.message);
  toast('Group rejected.');
  await openChamaProfile(groupId);
  await loadChamaDirectory();
}

async function renderChamaMembers(g) {
  const target = $('chamaProfileContent');
  if (!target) return;
  target.innerHTML = `<div class="module-header"><h3>Group members</h3><button class="btn btn-primary" id="chamaAddMember" type="button">+ Add existing member</button></div><p>Loading members…</p>`;
  $('chamaAddMember').onclick = () => openAddChamaMember(g);
  try {
    const links = await safeQuery(db.from('chama_memberships').select('id,member_id,joined_at,status')
      .eq('organization_id',organization.id).eq('group_id',g.id).order('created_at',{ascending:false})) || [];
    const ids = [...new Set(links.map(x=>x.member_id))];
    const members = ids.length ? await safeQuery(db.from('members').select('id,member_number,full_name,phone,status')
      .eq('organization_id',organization.id).in('id',ids)) || [] : [];
    const map = Object.fromEntries(members.map(m=>[m.id,m]));
    target.innerHTML = `<div class="module-header"><h3>Group members (${links.filter(x=>x.status==='ACTIVE').length})</h3><button class="btn btn-primary" id="chamaAddMember" type="button">+ Add existing member</button></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Member</th><th>Phone</th><th>Member status</th><th>Group status</th><th>Joined</th><th>Action</th></tr></thead><tbody>
      ${links.map(l=>{const m=map[l.member_id]||{};return `<tr><td>${esc(m.full_name||'Member')}<small>${esc(m.member_number||'')}</small></td><td>${esc(m.phone||'—')}</td><td>${statusPill(m.status||'—')}</td><td>${statusPill(l.status)}</td><td>${chamaDate(l.joined_at)}</td><td>${l.status==='ACTIVE'?`<button class="btn btn-soft btn-sm" data-chama-remove="${esc(l.id)}" type="button">Remove / transfer</button>`:'—'}</td></tr>`}).join('')}
      </tbody></table></div>`;
    $('chamaAddMember').onclick = () => openAddChamaMember(g);
    target.querySelectorAll('[data-chama-remove]').forEach(btn=>btn.onclick=()=>openRemoveTransfer(g,btn.getAttribute('data-chama-remove')));
  } catch(error) {
    target.innerHTML = `<div class="error-box">Could not load members: ${chamaSafeError(error)}</div>`;
  }
}

async function openAddChamaMember(g) {
  const existing = await safeQuery(db.from('chama_memberships').select('member_id')
    .eq('organization_id',organization.id).eq('group_id',g.id).eq('status','ACTIVE')) || [];
  const exclude = existing.map(x=>x.member_id);
  let query = db.from('members').select('id,member_number,full_name,phone,status')
    .eq('organization_id',organization.id).in('status',['ACTIVE','APPROVED']).order('full_name');
  if (exclude.length) query = query.not('id','in',`(${exclude.join(',')})`);
  const members = await safeQuery(query) || [];
  const body = `<form id="chamaAddMemberForm"><label class="form-field">Select member *<select name="member_id" required><option value="">Choose member</option>${members.map(m=>`<option value="${esc(m.id)}">${esc(m.member_number||'')} — ${esc(m.full_name)} (${esc(m.phone||'no phone')})</option>`).join('')}</select></label><p id="chamaAddMemberMessage"></p></form>`;
  openModal('Add Group Member',g.group_name,body,`<button class="btn btn-primary" id="chamaConfirmAdd" type="button">Add member</button>`,true);
  $('chamaConfirmAdd').onclick=async()=>{
    const memberId=$('chamaAddMemberForm').elements.member_id.value;
    if(!memberId)return setMessage('chamaAddMemberMessage','Select a member.');
    const {error}=await db.from('chama_memberships').insert({organization_id:organization.id,group_id:g.id,member_id:memberId,status:'ACTIVE',recorded_by:authUser?.id||null});
    if(error)return setMessage('chamaAddMemberMessage',error.message);
    toast('Member added to group.');
    await openChamaProfile(g.id);
  };
}

async function openRemoveTransfer(g, membershipId) {
  const body = `<form id="chamaMoveForm">
    <label class="form-field">Action<select name="action"><option value="REMOVE">Remove from group</option><option value="TRANSFER">Transfer to another group</option></select></label>
    <label class="form-field">Destination group<select name="destination" disabled><option value="">Select destination</option></select></label>
    <label class="form-field">Reason<input name="reason" maxlength="200"></label>
    <p class="note-box">Transfer is processed atomically by the database. Removal only ends the current membership.</p>
    <p id="chamaMoveMessage"></p></form>`;
  openModal('Remove or Transfer Member', g.group_name, body,
    `<button class="btn btn-primary" id="chamaMoveConfirm" type="button">Confirm</button>`, true);
  const groups = await safeQuery(db.from('chama_groups')
    .select('id,group_name,group_code')
    .eq('organization_id', organization.id)
    .eq('status', 'ACTIVE')
    .neq('id', g.id)) || [];
  const form = $('chamaMoveForm');
  form.elements.destination.innerHTML = `<option value="">Select destination</option>${groups.map(x => `<option value="${esc(x.id)}">${esc(x.group_name)} (${esc(x.group_code)})</option>`).join('')}`;
  form.elements.action.onchange = e => form.elements.destination.disabled = e.target.value !== 'TRANSFER';
  $('chamaMoveConfirm').onclick = async () => {
    const d = Object.fromEntries(new FormData(form).entries());
    if (d.action === 'TRANSFER' && !d.destination) return setMessage('chamaMoveMessage', 'Choose a destination group.');
    if (!confirm(d.action === 'TRANSFER' ? 'Transfer this member to the selected group?' : 'Remove this member from the group?')) return;
    try {
      if (d.action === 'TRANSFER') {
        const { error } = await db.rpc('transfer_chama_member', {
          _membership_id: membershipId,
          _destination_group_id: d.destination,
          _reason: d.reason.trim() || null
        });
        if (error) throw error;
      } else {
        const { error } = await db.from('chama_memberships')
          .update({ status: 'LEFT', left_at: new Date().toISOString().slice(0, 10) })
          .eq('organization_id', organization.id).eq('id', membershipId).eq('status', 'ACTIVE');
        if (error) throw error;
      }
      toast(d.action === 'TRANSFER' ? 'Member transferred successfully.' : 'Member removed from group.');
      closeModal();
      await loadChamaDirectory();
      await openChamaProfile(g.id);
    } catch (error) {
      setMessage('chamaMoveMessage', error.message || 'Membership change failed.');
    }
  };
}

async function renderChamaWeeklyCollection(g) {
  const target=$('chamaProfileContent');
  const start=chamaCollectionWeek;
  const end=chamaWeekEnd(start);
  target.innerHTML=`<div class="module-header"><h3>Weekly savings & loan collection</h3><label class="form-field">Week starting<input id="chamaWeekPicker" type="date" value="${esc(start)}"></label></div><div id="chamaWeeklyCollectionBody"><p>Loading collection…</p></div>`;
  $('chamaWeekPicker').onchange=e=>{chamaCollectionWeek=chamaWeekStart(new Date(`${e.target.value}T00:00:00`));renderChamaWeeklyCollection(g);};
  try{
    const members=await safeQuery(db.from('chama_memberships').select('member_id').eq('organization_id',organization.id).eq('group_id',g.id).eq('status','ACTIVE'))||[];
    const ids=[...new Set(members.map(x=>x.member_id))];
    const memberRows=ids.length?await safeQuery(db.from('members').select('id,member_number,full_name').eq('organization_id',organization.id).in('id',ids).order('full_name'))||[]:[];
    const entries=await safeQuery(db.from('chama_collection_entries').select('*').eq('organization_id',organization.id).eq('group_id',g.id).gte('collection_date',start).lte('collection_date',end).order('created_at'))||[];
    const map={};entries.forEach(e=>{map[e.member_id]=map[e.member_id]||{savings:0,loan:0,entries:[]};map[e.member_id][e.collection_type==='SAVINGS'?'savings':'loan']+=Number(e.amount||0);map[e.member_id].entries.push(e);});
    const totals=entries.filter(e=>e.status==='RECORDED').reduce((a,e)=>{a[e.collection_type==='SAVINGS'?'savings':'loan']+=Number(e.amount||0);return a;},{savings:0,loan:0});
    $('chamaWeeklyCollectionBody').innerHTML=`
      <div class="form-grid"><div class="stat-card"><small>Recorded savings</small><h3>${chamaMoney(totals.savings)}</h3></div><div class="stat-card"><small>Recorded loan repayments</small><h3>${chamaMoney(totals.loan)}</h3></div><div class="stat-card"><small>Total recorded</small><h3>${chamaMoney(totals.savings+totals.loan)}</h3></div></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Member</th><th>Savings</th><th>Loan repayment</th><th>Actions</th></tr></thead><tbody>
      ${memberRows.map(m=>{const x=map[m.id]||{savings:0,loan:0};return `<tr><td>${esc(m.full_name)}<small>${esc(m.member_number||'')}</small></td><td>${chamaMoney(x.savings)}</td><td>${chamaMoney(x.loan)}</td><td><button class="btn btn-soft btn-sm" data-chama-collect="${esc(m.id)}" type="button">Record</button></td></tr>`}).join('')}
      </tbody></table></div>
      <p class="note-box">Collection register entries are tracked here. They do not post money to the accounting ledger until linked to the approved GORA transaction posting workflow.</p>`;
    $('chamaWeeklyCollectionBody').querySelectorAll('[data-chama-collect]').forEach(btn=>btn.onclick=()=>openRecordChamaCollection(g,btn.getAttribute('data-chama-collect'),start));
  }catch(error){
    $('chamaWeeklyCollectionBody').innerHTML=`<div class="error-box">Unable to load weekly collection. Apply the Chama collection SQL migration first. ${chamaSafeError(error)}</div>`;
  }
}

async function openRecordChamaCollection(g,memberId,weekStart) {
  const member=await safeQuery(db.from('members').select('full_name').eq('organization_id',organization.id).eq('id',memberId).single());
  const body=`<form id="chamaRecordCollectionForm"><label class="form-field">Member<input readonly value="${esc(member?.full_name||'Member')}"></label><label class="form-field">Collection type<select name="collection_type"><option value="SAVINGS">Weekly savings</option><option value="LOAN_REPAYMENT">Loan repayment</option></select></label><label class="form-field">Amount (KES)<input name="amount" type="number" min="1" step="0.01" required></label><label class="form-field">Collection date<input name="collection_date" type="date" value="${esc(weekStart)}" required></label><label class="form-field">Payment method<select name="payment_method"><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option><option value="BANK">Bank</option></select></label><label class="form-field">Reference / receipt<input name="reference_number" maxlength="100"></label><label class="form-field">Notes<input name="notes" maxlength="250"></label><p id="chamaCollectionMessage"></p></form>`;
  openModal('Record Weekly Collection',member?.full_name||g.group_name,body,`<button class="btn btn-primary" id="chamaCollectionSave" type="button">Save collection entry</button>`,true);
  $('chamaCollectionSave').onclick=async()=>{
    const f=$('chamaRecordCollectionForm');if(!f.reportValidity())return;
    const d=Object.fromEntries(new FormData(f).entries());
    const amount=Number(d.amount);if(!Number.isFinite(amount)||amount<=0)return setMessage('chamaCollectionMessage','Enter a valid amount.');
    const {error}=await db.from('chama_collection_entries').insert({
      organization_id:organization.id,group_id:g.id,member_id:memberId,
      collection_type:d.collection_type,amount,collection_date:d.collection_date,
      payment_method:d.payment_method,reference_number:d.reference_number||null,
      notes:d.notes||null,status:'RECORDED',recorded_by:authUser?.id||null
    });
    if(error)return setMessage('chamaCollectionMessage',error.message);
    toast('Collection entry recorded.');
    await openChamaProfile(g.id);
    await renderChamaWeeklyCollection(g);
  };
}

async function renderChamaCollectionHistory(g) {
  const target=$('chamaProfileContent');
  target.innerHTML='<h3>Collection history</h3><p>Loading history…</p>';
  try{
    const entries=await safeQuery(db.from('chama_collection_entries').select('collection_date,collection_type,amount,payment_method,reference_number,status,member_id,notes')
      .eq('organization_id',organization.id).eq('group_id',g.id).order('collection_date',{ascending:false}).limit(300))||[];
    const ids=[...new Set(entries.map(x=>x.member_id))];
    const members=ids.length?await safeQuery(db.from('members').select('id,full_name,member_number').eq('organization_id',organization.id).in('id',ids))||[]:[];
    const map=Object.fromEntries(members.map(m=>[m.id,m]));
    target.innerHTML=`<h3>Collection history</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Member</th><th>Type</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th></tr></thead><tbody>${entries.map(e=>`<tr><td>${chamaDate(e.collection_date)}</td><td>${esc(map[e.member_id]?.full_name||'Member')}</td><td>${esc(e.collection_type)}</td><td>${chamaMoney(e.amount)}</td><td>${esc(e.payment_method||'—')}</td><td>${esc(e.reference_number||'—')}</td><td>${esc(e.status)}</td></tr>`).join('')}</tbody></table></div>`;
  }catch(error){target.innerHTML=`<div class="error-box">Unable to load collection history: ${chamaSafeError(error)}</div>`;}
}

async function exportChamaReport(g) {
  try{
    const [links,entries]=await Promise.all([
      safeQuery(db.from('chama_memberships').select('member_id,status,joined_at').eq('organization_id',organization.id).eq('group_id',g.id)),
      safeQuery(db.from('chama_collection_entries').select('member_id,collection_date,collection_type,amount,payment_method,reference_number,status').eq('organization_id',organization.id).eq('group_id',g.id).order('collection_date',{ascending:false}))
    ]);
    const ids=[...new Set((links||[]).map(x=>x.member_id).concat((entries||[]).map(x=>x.member_id)))];
    const members=ids.length?await safeQuery(db.from('members').select('id,member_number,full_name,phone').eq('organization_id',organization.id).in('id',ids))||[]:[];
    const map=Object.fromEntries(members.map(m=>[m.id,m]));
    const rows=[['Group',g.group_name],['Group code',g.group_code],[],['Member number','Member name','Phone','Collection date','Type','Amount KES','Method','Reference','Status']];
    (entries||[]).forEach(e=>rows.push([map[e.member_id]?.member_number||'',map[e.member_id]?.full_name||'',map[e.member_id]?.phone||'',e.collection_date,e.collection_type,e.amount,e.payment_method||'',e.reference_number||'',e.status]));
    const csv=rows.map(row=>row.map(v=>{const s=String(v??'');return `"${s.replace(/"/g,'""')}"`;}).join(',')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${(g.group_code||'chama').replace(/[^a-z0-9-_]/gi,'_')}_report.csv`;a.click();URL.revokeObjectURL(url);
    toast('Group report exported.');
  }catch(error){toast(error.message||'Unable to export report.');}
}

async function renderChamaDashboard() {
  await renderChamas();
}


/* -------------------------------------------------------------------------
 * Chama Management enhancements — full group operations
 * Requires chama-management-enhancements.sql to be applied first.
 * Collection register entries are operational records; they do NOT post
 * savings or loan repayments to the financial ledger. Use GORA's approved
 * posting workflows for actual cash/account movements.
 * ------------------------------------------------------------------------- */

function chamaCsvCell(value) {
  // Prevent spreadsheet formula injection and correctly quote CSV cells.
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function chamaDownloadCsv(filename, rows) {
  const csv = rows.map(row => row.map(chamaCsvCell).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function chamaGroupFilename(g, suffix) {
  const code = String(g.group_code || g.group_name || 'chama')
    .normalize('NFKD').replace(/[^a-z0-9-_]/gi, '_').slice(0, 60);
  return `${code}_${suffix}.csv`;
}

async function chamaGetActiveMembers(groupId) {
  const links = await safeQuery(db.from('chama_memberships')
    .select('id,member_id,joined_at,status')
    .eq('organization_id', organization.id)
    .eq('group_id', groupId)
    .eq('status', 'ACTIVE')
    .order('joined_at', { ascending: true })) || [];
  const ids = [...new Set(links.map(x => x.member_id).filter(Boolean))];
  const memberRows = ids.length ? await safeQuery(db.from('members')
    .select('id,member_number,full_name,phone,status,branch_id')
    .eq('organization_id', organization.id)
    .in('id', ids)
    .order('full_name')) || [] : [];
  const memberMap = Object.fromEntries(memberRows.map(m => [m.id, m]));
  return links.map(link => ({ ...link, member: memberMap[link.member_id] || {} }))
    .filter(x => x.member && x.member.id);
}

/* Approval must go through the established database workflow/RPC.
   Do not change PENDING to ACTIVE directly from the browser. */
async function updateChamaStatus(groupId, status) {
  try {
    if (status === 'ACTIVE') {
      const links = await safeQuery(db.from('chama_memberships')
        .select('member_id,status')
        .eq('organization_id', organization.id)
        .eq('group_id', groupId)
        .eq('status', 'ACTIVE')) || [];
      const ids = [...new Set(links.map(x => x.member_id).filter(Boolean))];
      const activeMembers = ids.length ? await safeQuery(db.from('members')
        .select('id,status')
        .eq('organization_id', organization.id)
        .in('id', ids)
        .in('status', ['APPROVED', 'ACTIVE'])) || [] : [];
      if (activeMembers.length < 5) {
        toast(`A chama needs at least 5 approved/active members. Current count: ${activeMembers.length}.`);
        return;
      }
      if (!confirm(`Approve this chama with ${activeMembers.length} approved/active members?`)) return;
      const { data, error } = await db.rpc('approve_chama_group', { _group_id: groupId });
      if (error) throw error;
      toast(`Chama approved${data != null ? ` (${data} members)` : ''}.`);
    } else {
      if (!['PAUSED', 'CLOSED'].includes(status)) throw new Error('Unsupported group status action.');
      if (!confirm(`Change this group to ${status}?`)) return;
      const patch = { status, updated_at: new Date().toISOString() };
      const { error } = await db.from('chama_groups').update(patch)
        .eq('organization_id', organization.id).eq('id', groupId);
      if (error) throw error;
      toast(`Group status changed to ${status}.`);
    }
    await loadChamaDirectory();
    await openChamaProfile(groupId);
  } catch (error) {
    toast(`Group status update failed: ${error?.message || error}`);
  }
}

async function rejectChama(groupId) {
  const reason = prompt('Reason for rejecting this group (at least 5 characters):');
  if (reason === null) return;
  if (reason.trim().length < 5) return toast('Please enter a rejection reason of at least 5 characters.');
  if (!confirm('Confirm rejection of this chama?')) return;
  try {
    const { error } = await db.rpc('reject_chama_group', {
      _group_id: groupId,
      _reason: reason.trim()
    });
    if (error) throw error;
    toast('Group rejected.');
    await loadChamaDirectory();
    await openChamaProfile(groupId);
  } catch (error) {
    toast(`Group rejection failed: ${error?.message || error}`);
  }
}

/* Profile savings: actual posted ledger entries, not collection register. */
async function renderChamaSavings(g) {
  const target = $('chamaProfileContent');
  if (!target) return;
  target.innerHTML = '<h3>Group savings</h3><p>Loading posted savings…</p>';
  try {
    const active = await chamaGetActiveMembers(g.id);
    const memberIds = active.map(x => x.member_id);
    const accounts = memberIds.length ? await safeQuery(db.from('savings_accounts')
      .select('id,member_id,account_number,status,balance')
      .eq('organization_id', organization.id)
      .in('member_id', memberIds)) || [] : [];
    const accountIds = accounts.map(x => x.id);
    const tx = accountIds.length ? await safeQuery(db.from('savings_transactions')
      .select('id,savings_account_id,transaction_date,transaction_type,amount,status,payment_method,reference_number,description')
      .eq('organization_id', organization.id)
      .in('savings_account_id', accountIds)
      .eq('status', 'POSTED')
      .order('transaction_date', { ascending: false })
      .limit(1000)) || [] : [];
    const byAccount = Object.fromEntries(accounts.map(a => [a.id, a]));
    const deposits = tx.filter(x => x.transaction_type === 'DEPOSIT').reduce((s, x) => s + Number(x.amount || 0), 0);
    const withdrawals = tx.filter(x => x.transaction_type === 'WITHDRAWAL').reduce((s, x) => s + Number(x.amount || 0), 0);
    const balance = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
    target.innerHTML = `
      <h3>Group savings — posted ledger</h3>
      <div class="form-grid">
        <div class="stat-card"><small>Posted deposits</small><h3>${chamaMoney(deposits)}</h3></div>
        <div class="stat-card"><small>Posted withdrawals</small><h3>${chamaMoney(withdrawals)}</h3></div>
        <div class="stat-card"><small>Current savings liability</small><h3>${chamaMoney(balance)}</h3></div>
      </div>
      <p class="note-box">Savings shown here are posted member ledger transactions. Weekly register entries are shown separately and are not counted twice.</p>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Member / account</th><th>Type</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th></tr></thead><tbody>
      ${tx.map(x => {
        const a = byAccount[x.savings_account_id] || {};
        const m = active.find(y => y.member_id === a.member_id)?.member || {};
        return `<tr><td>${chamaDate(x.transaction_date)}</td><td>${esc(m.full_name || a.account_number || 'Member')}<small>${esc(m.member_number || a.account_number || '')}</small></td><td>${esc(x.transaction_type)}</td><td>${chamaMoney(x.amount)}</td><td>${esc(x.payment_method || '—')}</td><td>${esc(x.reference_number || '—')}</td><td>${esc(x.status)}</td></tr>`;
      }).join('') || '<tr><td colspan="7">No posted savings transactions found for active group members.</td></tr>'}
      </tbody></table></div>`;
  } catch (error) {
    target.innerHTML = `<div class="error-box">Unable to load group savings: ${chamaSafeError(error)}</div>`;
  }
}

/* Group-linked loan accounts only. Avoid including a member's unrelated loan. */
async function renderChamaLoans(g) {
  const target = $('chamaProfileContent');
  if (!target) return;
  target.innerHTML = '<h3>Group loans & collections</h3><p>Loading loan accounts…</p>';
  try {
    const loans = await safeQuery(db.from('loan_accounts')
      .select('id,loan_account_number,member_id,group_id,principal_amount,total_repayment,status,disbursed_on,first_due_date')
      .eq('organization_id', organization.id)
      .eq('group_id', g.id)
      .order('created_at', { ascending: false })) || [];
    const loanIds = loans.map(x => x.id);
    const repayments = loanIds.length ? await safeQuery(db.from('loan_repayments')
      .select('id,loan_account_id,amount,status,payment_date,payment_method,reference_number')
      .eq('organization_id', organization.id)
      .in('loan_account_id', loanIds)
      .eq('status', 'POSTED')
      .order('payment_date', { ascending: false })) || [] : [];
    const memberIds = [...new Set(loans.map(x => x.member_id).filter(Boolean))];
    const members = memberIds.length ? await safeQuery(db.from('members')
      .select('id,full_name,member_number')
      .eq('organization_id', organization.id)
      .in('id', memberIds)) || [] : [];
    const memberMap = Object.fromEntries(members.map(m => [m.id, m]));
    const paidByLoan = {};
    repayments.forEach(r => paidByLoan[r.loan_account_id] = (paidByLoan[r.loan_account_id] || 0) + Number(r.amount || 0));
    const disbursed = loans.filter(l => !['CANCELLED', 'REJECTED', 'PENDING'].includes(l.status))
      .reduce((s, l) => s + Number(l.principal_amount || 0), 0);
    const totalPaid = repayments.reduce((s, r) => s + Number(r.amount || 0), 0);
    const balance = loans.filter(l => ['ACTIVE', 'OVERDUE', 'DEFAULTED'].includes(l.status))
      .reduce((s, l) => s + Math.max(0, Number(l.total_repayment || l.principal_amount || 0) - (paidByLoan[l.id] || 0)), 0);
    target.innerHTML = `
      <h3>Group loan portfolio</h3>
      <div class="form-grid">
        <div class="stat-card"><small>Loans disbursed</small><h3>${chamaMoney(disbursed)}</h3></div>
        <div class="stat-card"><small>Posted repayments</small><h3>${chamaMoney(totalPaid)}</h3></div>
        <div class="stat-card"><small>Outstanding repayment balance</small><h3>${chamaMoney(balance)}</h3></div>
      </div>
      <p class="note-box">Only loan accounts linked to this chama through <code>loan_accounts.group_id</code> are included. Member loans not linked to this group are excluded.</p>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Borrower</th><th>Account</th><th>Principal</th><th>Total repayable</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>
      ${loans.map(l => `<tr><td>${esc(memberMap[l.member_id]?.full_name || 'Member')}<small>${esc(memberMap[l.member_id]?.member_number || '')}</small></td><td>${esc(l.loan_account_number || '—')}</td><td>${chamaMoney(l.principal_amount)}</td><td>${chamaMoney(l.total_repayment)}</td><td>${chamaMoney(paidByLoan[l.id] || 0)}</td><td>${chamaMoney(Math.max(0, Number(l.total_repayment || l.principal_amount || 0) - (paidByLoan[l.id] || 0)))}</td><td>${esc(l.status)}</td></tr>`).join('') || '<tr><td colspan="7">No group-linked loan accounts found.</td></tr>'}
      </tbody></table></div>
      <h3>Posted repayment history</h3>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Borrower</th><th>Amount</th><th>Method</th><th>Reference</th></tr></thead><tbody>
      ${repayments.map(r => `<tr><td>${chamaDate(r.payment_date)}</td><td>${esc(memberMap[loans.find(l => l.id === r.loan_account_id)?.member_id]?.full_name || 'Member')}</td><td>${chamaMoney(r.amount)}</td><td>${esc(r.payment_method || '—')}</td><td>${esc(r.reference_number || '—')}</td></tr>`).join('') || '<tr><td colspan="5">No posted repayments yet.</td></tr>'}
      </tbody></table></div>`;
  } catch (error) {
    target.innerHTML = `<div class="error-box">Unable to load group loans: ${chamaSafeError(error)}</div>`;
  }
}

/* Loan officer assignment is a group management setting; no loan records are
   changed by assigning/reassigning the officer. */
async function renderChamaOfficerAssignment(g) {
  const target = $('chamaProfileContent');
  if (!target) return;
  target.innerHTML = '<h3>Loan officer assignment</h3><p>Loading staff…</p>';
  try {
    const { data: group, error: groupError } = await db.from('chama_groups')
      .select('id,loan_officer_id')
      .eq('organization_id', organization.id).eq('id', g.id).single();
    if (groupError) throw groupError;
    const { data: profiles, error } = await db.from('profiles')
      .select('id,full_name,phone')
      .order('full_name')
      .limit(500);
    if (error) throw error;
    const staff = profiles || [];
    const current = staff.find(x => x.id === group.loan_officer_id);
    target.innerHTML = `
      <h3>Loan officer assignment</h3>
      <p>Assign a GORA staff officer to follow up this group's weekly savings and loan collections.</p>
      <form id="chamaOfficerForm">
        <label class="form-field">Loan officer<select name="officer_id">
          <option value="">Unassigned</option>
          ${staff.map(p => `<option value="${esc(p.id)}">${esc(p.full_name || p.phone || p.id)}</option>`).join('')}
        </select></label>
        <p id="chamaOfficerMessage"></p>
        <button class="btn btn-primary" type="submit">Save assignment</button>
      </form>
      <p class="note-box">Only assign staff who already have the appropriate GORA role and branch access.</p>`;
    const form = $('chamaOfficerForm');
    form.elements.officer_id.value = group.loan_officer_id || '';
    form.onsubmit = async e => {
      e.preventDefault();
      const officerId = form.elements.officer_id.value || null;
      const { error: saveError } = await db.from('chama_groups')
        .update({ loan_officer_id: officerId, updated_at: new Date().toISOString() })
        .eq('organization_id', organization.id).eq('id', g.id);
      if (saveError) return setMessage('chamaOfficerMessage', saveError.message);
      toast(officerId ? `Loan officer assigned${current ? ` (previous: ${current.full_name})` : ''}.` : 'Loan officer assignment cleared.');
      await loadChamaDirectory();
      await renderChamaOfficerAssignment(g);
    };
  } catch (error) {
    target.innerHTML = `<div class="error-box">Loan officer assignment needs the chama enhancement SQL migration. ${chamaSafeError(error)}</div>`;
  }
}

/* Savings withdrawal request workflow. Approval is not payment: payment must
   be made and posted through the authorised Savings transaction module. */
async function renderChamaWithdrawals(g) {
  const target = $('chamaProfileContent');
  if (!target) return;
  target.innerHTML = '<h3>Savings withdrawal requests</h3><p>Loading requests…</p>';
  try {
    const active = await chamaGetActiveMembers(g.id);
    const memberIds = active.map(x => x.member_id);
    const accounts = memberIds.length ? await safeQuery(db.from('savings_accounts')
      .select('id,member_id,account_number,balance')
      .eq('organization_id', organization.id).in('member_id', memberIds)) || [] : [];
    const ids = accounts.map(a => a.id);
    const { data: requests, error } = await db.from('chama_savings_withdrawal_requests')
      .select('id,member_id,savings_account_id,request_reference,amount,reason,request_date,status,review_note,created_at')
      .eq('organization_id', organization.id).eq('group_id', g.id)
      .order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    const requestRows = requests || [];
    const memberMap = Object.fromEntries(active.map(x => [x.member_id, x.member]));
    target.innerHTML = `
      <h3>Savings withdrawal requests</h3>
      <form id="chamaWithdrawalForm" class="form-grid">
        <label class="form-field">Member<select name="member_id" required><option value="">Select member</option>${active.map(x => `<option value="${esc(x.member_id)}">${esc(x.member.full_name)} · ${esc(x.member.member_number || '')}</option>`).join('')}</select></label>
        <label class="form-field">Savings account<select name="account_id" required><option value="">Select savings account</option>${accounts.map(a => `<option value="${esc(a.id)}">${esc(a.account_number || a.id)} · ${chamaMoney(a.balance)}</option>`).join('')}</select></label>
        <label class="form-field">Amount (KES)<input name="amount" type="number" min="1" step="0.01" required></label>
        <label class="form-field">Reason<input name="reason" maxlength="250" required></label>
        <button class="btn btn-primary" type="submit">Submit withdrawal request</button>
      </form>
      <div id="chamaWithdrawalMessage"></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Request</th><th>Member</th><th>Amount</th><th>Reason</th><th>Date</th><th>Status</th><th>Action</th></tr></thead><tbody>
      ${requestRows.map(r => `<tr><td>${esc(r.request_reference || '—')}</td><td>${esc(memberMap[r.member_id]?.full_name || 'Member')}</td><td>${chamaMoney(r.amount)}</td><td>${esc(r.reason || '—')}</td><td>${chamaDate(r.request_date)}</td><td>${esc(r.status)}</td><td>${r.status === 'PENDING' ? `<button class="btn btn-soft btn-sm" data-withdraw-approve="${esc(r.id)}">Approve</button> <button class="btn btn-danger btn-sm" data-withdraw-decline="${esc(r.id)}">Decline</button>` : esc(r.review_note || '—')}</td></tr>`).join('') || '<tr><td colspan="7">No withdrawal requests.</td></tr>'}
      </tbody></table></div>
      <p class="note-box">Approved requests still require actual payout and a posted withdrawal in GORA Savings. This module never changes the member's savings balance by itself.</p>`;
    const form = $('chamaWithdrawalForm');
    form.elements.member_id.onchange = () => {
      const memberId = form.elements.member_id.value;
      form.elements.account_id.value = '';
      [...form.elements.account_id.options].forEach(o => {
        if (!o.value) return;
        o.hidden = accounts.find(a => a.id === o.value)?.member_id !== memberId;
      });
    };
    form.onsubmit = async e => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const d = Object.fromEntries(new FormData(form).entries());
      const amount = Number(d.amount);
      const account = accounts.find(a => a.id === d.account_id);
      if (!account || account.member_id !== d.member_id) return setMessage('chamaWithdrawalMessage', 'Choose a savings account belonging to the selected member.');
      if (!Number.isFinite(amount) || amount <= 0 || amount > Number(account.balance || 0)) return setMessage('chamaWithdrawalMessage', 'Amount must be positive and cannot exceed the displayed account balance.');
      const { error: insertError } = await db.from('chama_savings_withdrawal_requests').insert({
        organization_id: organization.id, group_id: g.id, member_id: d.member_id,
        savings_account_id: d.account_id,
        request_reference: `WDR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        amount, reason: d.reason.trim(),
        request_date: new Date().toISOString().slice(0, 10), status: 'PENDING',
        requested_by: authUser?.id || null
      });
      if (insertError) return setMessage('chamaWithdrawalMessage', insertError.message);
      toast('Withdrawal request submitted for review.');
      await renderChamaWithdrawals(g);
    };
    target.querySelectorAll('[data-withdraw-approve]').forEach(btn => btn.onclick = () => chamaReviewWithdrawal(g, btn.dataset.withdrawApprove, 'APPROVED'));
    target.querySelectorAll('[data-withdraw-decline]').forEach(btn => btn.onclick = () => chamaReviewWithdrawal(g, btn.dataset.withdrawDecline, 'DECLINED'));
  } catch (error) {
    target.innerHTML = `<div class="error-box">Withdrawal request workflow needs the chama enhancement SQL migration. ${chamaSafeError(error)}</div>`;
  }
}

async function chamaReviewWithdrawal(g, requestId, decision) {
  const note = decision === 'DECLINED' ? prompt('Reason for declining this withdrawal:') : (prompt('Approval note (optional):') || '');
  if (note === null) return;
  if (decision === 'DECLINED' && !note.trim()) return toast('A decline reason is required.');
  if (!confirm(`${decision === 'APPROVED' ? 'Approve' : 'Decline'} this savings withdrawal request?`)) return;
  const { error } = await db.from('chama_savings_withdrawal_requests').update({
    status: decision, review_note: note.trim() || null,
    reviewed_by: authUser?.id || null, reviewed_at: new Date().toISOString()
  }).eq('organization_id', organization.id).eq('group_id', g.id).eq('id', requestId).eq('status', 'PENDING');
  if (error) return toast(error.message);
  toast(`Withdrawal request ${decision.toLowerCase()}.`);
  await renderChamaWithdrawals(g);
}

/* Full weekly sheet: one row per active member, plus the collected totals. */
async function renderChamaWeeklyCollection(g) {
  const target = $('chamaProfileContent');
  const start = chamaCollectionWeek;
  const end = chamaWeekEnd(start);
  target.innerHTML = `
    <div class="module-header"><h3>Weekly savings & loan collection</h3>
      <label class="form-field">Week starting<input id="chamaWeekPicker" type="date" value="${esc(start)}"></label>
      <button class="btn btn-soft" id="chamaSheetExport" type="button">Export collection sheet</button>
    </div>
    <div id="chamaWeeklyCollectionBody"><p>Loading weekly collection…</p></div>`;
  $('chamaWeekPicker').onchange = e => {
    if (!e.target.value) return;
    chamaCollectionWeek = chamaWeekStart(new Date(`${e.target.value}T00:00:00`));
    renderChamaWeeklyCollection(g);
  };
  $('chamaSheetExport').onclick = () => exportChamaCollectionSheet(g);
  try {
    const active = await chamaGetActiveMembers(g.id);
    const entries = await safeQuery(db.from('chama_collection_entries')
      .select('id,member_id,collection_type,amount,collection_date,status,payment_method,reference_number,loan_account_id')
      .eq('organization_id', organization.id).eq('group_id', g.id)
      .gte('collection_date', start).lte('collection_date', end)
      .order('created_at')) || [];
    const recorded = entries.filter(x => x.status === 'RECORDED' || x.status === 'POSTED');
    const byMember = {};
    recorded.forEach(x => {
      byMember[x.member_id] ||= { savings: 0, loan: 0, rows: [] };
      if (x.collection_type === 'SAVINGS') byMember[x.member_id].savings += Number(x.amount || 0);
      if (x.collection_type === 'LOAN_REPAYMENT') byMember[x.member_id].loan += Number(x.amount || 0);
      byMember[x.member_id].rows.push(x);
    });
    const totals = recorded.reduce((a, x) => {
      if (x.collection_type === 'SAVINGS') a.savings += Number(x.amount || 0);
      if (x.collection_type === 'LOAN_REPAYMENT') a.loan += Number(x.amount || 0);
      return a;
    }, { savings: 0, loan: 0 });
    const weeklyTarget = active.length * Number(g.target_weekly_savings || 100);
    $('chamaWeeklyCollectionBody').innerHTML = `
      <div class="form-grid">
        <div class="stat-card"><small>Weekly savings target</small><h3>${chamaMoney(weeklyTarget)}</h3></div>
        <div class="stat-card"><small>Recorded savings</small><h3>${chamaMoney(totals.savings)}</h3></div>
        <div class="stat-card"><small>Savings target gap</small><h3>${chamaMoney(Math.max(0, weeklyTarget - totals.savings))}</h3></div>
        <div class="stat-card"><small>Loan collections</small><h3>${chamaMoney(totals.loan)}</h3></div>
        <div class="stat-card"><small>Total weekly collections</small><h3>${chamaMoney(totals.savings + totals.loan)}</h3></div>
      </div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Member</th><th>Savings</th><th>Loan repayment</th><th>Total collected</th><th>Action</th></tr></thead><tbody>
      ${active.map(x => {
        const m = x.member, row = byMember[x.member_id] || { savings: 0, loan: 0 };
        return `<tr><td>${esc(m.full_name)}<small>${esc(m.member_number || '')}</small></td><td>${chamaMoney(row.savings)}</td><td>${chamaMoney(row.loan)}</td><td>${chamaMoney(row.savings + row.loan)}</td><td><button class="btn btn-soft btn-sm" data-chama-collect="${esc(x.member_id)}">Record</button></td></tr>`;
      }).join('') || '<tr><td colspan="5">No active members.</td></tr>'}
      <tr class="table-total"><th>Total collected</th><th>${chamaMoney(totals.savings)}</th><th>${chamaMoney(totals.loan)}</th><th>${chamaMoney(totals.savings + totals.loan)}</th><th></th></tr>
      </tbody></table></div>
      <p class="note-box">This weekly register calculates group savings and loan collection totals automatically from its entries. For actual accounting balances, post deposits and loan repayments through GORA's approved Savings and Loan workflows.</p>`;
    $('chamaWeeklyCollectionBody').querySelectorAll('[data-chama-collect]').forEach(btn => btn.onclick = () => openRecordChamaCollection(g, btn.dataset.chamaCollect, start));
  } catch (error) {
    $('chamaWeeklyCollectionBody').innerHTML = `<div class="error-box">Unable to load weekly register. Apply the chama enhancement SQL migration. ${chamaSafeError(error)}</div>`;
  }
}

/* Record weekly savings or loan collection against an active member.
   Optional loan account is for reporting association only; it does not post. */
async function openRecordChamaCollection(g, memberId, weekStart) {
  const member = await safeQuery(db.from('members').select('id,full_name,member_number')
    .eq('organization_id', organization.id).eq('id', memberId).single());
  const loans = await safeQuery(db.from('loan_accounts')
    .select('id,loan_account_number,status,principal_amount,total_repayment')
    .eq('organization_id', organization.id).eq('group_id', g.id)
    .eq('member_id', memberId).in('status', ['ACTIVE', 'OVERDUE', 'DEFAULTED'])) || [];
  const body = `<form id="chamaRecordCollectionForm">
    <label class="form-field">Member<input readonly value="${esc(member?.full_name || 'Member')} · ${esc(member?.member_number || '')}"></label>
    <label class="form-field">Collection type<select name="collection_type"><option value="SAVINGS">Weekly savings</option><option value="LOAN_REPAYMENT">Loan repayment</option></select></label>
    <label class="form-field">Loan account (optional)<select name="loan_account_id"><option value="">Group collection not linked to an account</option>${loans.map(l => `<option value="${esc(l.id)}">${esc(l.loan_account_number || l.id)} · ${esc(l.status)}</option>`).join('')}</select></label>
    <label class="form-field">Amount (KES)<input name="amount" type="number" min="1" step="0.01" required></label>
    <label class="form-field">Collection date<input name="collection_date" type="date" value="${esc(weekStart)}" required></label>
    <label class="form-field">Payment method<select name="payment_method"><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option><option value="BANK">Bank</option></select></label>
    <label class="form-field">Reference / receipt<input name="reference_number" maxlength="100"></label>
    <label class="form-field">Notes<input name="notes" maxlength="250"></label>
    <p id="chamaCollectionMessage"></p></form>`;
  openModal('Record Weekly Collection', member?.full_name || g.group_name, body,
    `<button class="btn btn-primary" id="chamaCollectionSave" type="button">Save collection entry</button>`, true);
  $('chamaCollectionSave').onclick = async () => {
    const form = $('chamaRecordCollectionForm');
    if (!form.reportValidity()) return;
    const d = Object.fromEntries(new FormData(form).entries());
    const amount = Number(d.amount);
    if (!Number.isFinite(amount) || amount <= 0) return setMessage('chamaCollectionMessage', 'Enter a valid amount.');
    if (d.collection_type === 'LOAN_REPAYMENT' && !d.loan_account_id && loans.length) {
      if (!confirm('Record this as an unlinked group loan collection?')) return;
    }
    const { error } = await db.from('chama_collection_entries').insert({
      organization_id: organization.id, group_id: g.id, member_id: memberId,
      collection_type: d.collection_type, loan_account_id: d.loan_account_id || null,
      amount, collection_date: d.collection_date, payment_method: d.payment_method,
      reference_number: d.reference_number.trim() || null, notes: d.notes.trim() || null,
      status: 'RECORDED', recorded_by: authUser?.id || null
    });
    if (error) return setMessage('chamaCollectionMessage', error.message);
    toast('Weekly collection register updated.');
    closeModal();
    await openChamaProfile(g.id);
    await renderChamaWeeklyCollection(g);
  };
}

async function exportChamaCollectionSheet(g) {
  try {
    const start = chamaCollectionWeek, end = chamaWeekEnd(start);
    const active = await chamaGetActiveMembers(g.id);
    const entries = await safeQuery(db.from('chama_collection_entries')
      .select('member_id,collection_type,amount,collection_date,status,reference_number')
      .eq('organization_id', organization.id).eq('group_id', g.id)
      .gte('collection_date', start).lte('collection_date', end)) || [];
    const rows = [['GORA CHAMA WEEKLY COLLECTION SHEET'], ['Group', g.group_name], ['Code', g.group_code], ['Week', `${start} to ${end}`], [],
      ['Member No.', 'Member Name', 'Phone', 'Savings (KES)', 'Loan Repayment (KES)', 'Total Collected (KES)', 'Signature']];
    const recorded = entries.filter(x => ['RECORDED', 'POSTED'].includes(x.status));
    const sums = {};
    recorded.forEach(x => {
      sums[x.member_id] ||= { savings: 0, loan: 0 };
      if (x.collection_type === 'SAVINGS') sums[x.member_id].savings += Number(x.amount || 0);
      if (x.collection_type === 'LOAN_REPAYMENT') sums[x.member_id].loan += Number(x.amount || 0);
    });
    active.forEach(x => {
      const m = x.member, s = sums[x.member_id] || { savings: 0, loan: 0 };
      rows.push([m.member_number || '', m.full_name || '', m.phone || '', s.savings, s.loan, s.savings + s.loan, '']);
    });
    const total = Object.values(sums).reduce((a, x) => ({ savings: a.savings + x.savings, loan: a.loan + x.loan }), { savings: 0, loan: 0 });
    rows.push([], ['TOTALS', '', '', total.savings, total.loan, total.savings + total.loan, '']);
    chamaDownloadCsv(chamaGroupFilename(g, `collection_${start}`), rows);
    toast('Weekly collection sheet exported.');
  } catch (error) {
    toast(`Could not export collection sheet: ${error?.message || error}`);
  }
}

/* Full group report: roster + collection transactions. */
async function exportChamaReport(g) {
  try {
    const active = await chamaGetActiveMembers(g.id);
    const entries = await safeQuery(db.from('chama_collection_entries')
      .select('member_id,collection_date,collection_type,amount,payment_method,reference_number,status,notes')
      .eq('organization_id', organization.id).eq('group_id', g.id)
      .order('collection_date', { ascending: false }).limit(2000)) || [];
    const rows = [['GORA CHAMA REPORT'], ['Group', g.group_name], ['Group code', g.group_code], ['Status', g.status], ['Location', g.location || ''], [],
      ['Member number', 'Member name', 'Phone', 'Membership status', 'Joined date']];
    active.forEach(x => rows.push([x.member.member_number || '', x.member.full_name || '', x.member.phone || '', x.status, x.joined_at || '']));
    rows.push([], ['Collection date', 'Member number', 'Member name', 'Type', 'Amount KES', 'Method', 'Reference', 'Status', 'Notes']);
    const map = Object.fromEntries(active.map(x => [x.member_id, x.member]));
    entries.forEach(e => rows.push([e.collection_date, map[e.member_id]?.member_number || '', map[e.member_id]?.full_name || '', e.collection_type, e.amount, e.payment_method || '', e.reference_number || '', e.status, e.notes || '']));
    chamaDownloadCsv(chamaGroupFilename(g, 'full_report'), rows);
    toast('Group roster and transaction report exported.');
  } catch (error) {
    toast(`Unable to export group report: ${error?.message || error}`);
  }
}


/* Correct profile KPI calculations: group-linked loans and posted savings. */
async function loadChamaMetrics(group) {
  try {
    const memberships = await safeQuery(db.from('chama_memberships')
      .select('member_id,status').eq('organization_id', organization.id).eq('group_id', group.id)) || [];
    const activeCount = memberships.filter(x => x.status === 'ACTIVE').length;
    const memberIds = [...new Set(memberships.map(x => x.member_id).filter(Boolean))];
    const accounts = memberIds.length ? await safeQuery(db.from('savings_accounts')
      .select('id,member_id,balance').eq('organization_id', organization.id).in('member_id', memberIds)) || [] : [];
    const accountIds = accounts.map(a => a.id);
    const savingsTx = accountIds.length ? await safeQuery(db.from('savings_transactions')
      .select('transaction_type,amount,status,transaction_date').eq('organization_id', organization.id)
      .in('savings_account_id', accountIds).eq('status', 'POSTED')) || [] : [];
    const netSavings = savingsTx.reduce((sum, t) => {
      if (t.transaction_type === 'DEPOSIT') return sum + Number(t.amount || 0);
      if (t.transaction_type === 'WITHDRAWAL') return sum - Number(t.amount || 0);
      return sum;
    }, 0);
    const loans = await safeQuery(db.from('loan_accounts')
      .select('id,principal_amount,total_repayment,status')
      .eq('organization_id', organization.id).eq('group_id', group.id)) || [];
    const loanIds = loans.map(l => l.id);
    const repayments = loanIds.length ? await safeQuery(db.from('loan_repayments')
      .select('loan_account_id,amount,status,payment_date').eq('organization_id', organization.id)
      .in('loan_account_id', loanIds).eq('status', 'POSTED')) || [] : [];
    const paidByLoan = {};
    repayments.forEach(r => paidByLoan[r.loan_account_id] = (paidByLoan[r.loan_account_id] || 0) + Number(r.amount || 0));
    const disbursed = loans.filter(l => !['PENDING','CANCELLED','REJECTED'].includes(l.status))
      .reduce((sum, l) => sum + Number(l.principal_amount || 0), 0);
    const repaid = repayments.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    // Remaining contractual repayment balance (principal + interest) is shown;
    // principal-only balance requires principal/interest allocation per payment.
    const outstanding = loans.filter(l => ['ACTIVE','OVERDUE','DEFAULTED'].includes(l.status))
      .reduce((sum, l) => sum + Math.max(0, Number(l.total_repayment || l.principal_amount || 0) - (paidByLoan[l.id] || 0)), 0);
    const start = chamaWeekStart(new Date()), end = chamaWeekEnd(start);
    const weeklySavings = savingsTx.filter(t => t.transaction_type === 'DEPOSIT' && String(t.transaction_date || '').slice(0,10) >= start && String(t.transaction_date || '').slice(0,10) <= end)
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const weeklyLoan = repayments.filter(r => String(r.payment_date || '').slice(0,10) >= start && String(r.payment_date || '').slice(0,10) <= end)
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const set = (id, value) => { const el = $(id); if (el) el.textContent = value; };
    set('chamaMetricMembers', number(activeCount));
    set('chamaMetricSavings', chamaMoney(netSavings));
    set('chamaMetricDisbursed', chamaMoney(disbursed));
    set('chamaMetricRepayments', chamaMoney(repaid));
    set('chamaMetricOutstanding', chamaMoney(outstanding));
    set('chamaMetricWeeklySavings', chamaMoney(weeklySavings));
    set('chamaMetricWeeklyLoans', chamaMoney(weeklyLoan));
    set('chamaMetricWeekly', chamaMoney(weeklySavings + weeklyLoan));
  } catch (error) {
    console.warn('Chama metrics could not be loaded:', error);
    ['chamaMetricWeekly','chamaMetricWeeklySavings','chamaMetricWeeklyLoans'].forEach(id => { const el=$(id); if(el)el.textContent='Unavailable'; });
  }
}
/* Member assignment with a client-side capacity guard and duplicate check.
   Database constraints/RLS remain the final authority. */
async function openAddChamaMember(g) {
  try {
    const currentLinks = await safeQuery(db.from('chama_memberships')
      .select('member_id')
      .eq('organization_id', organization.id).eq('group_id', g.id).eq('status', 'ACTIVE')) || [];
    const currentIds = [...new Set(currentLinks.map(x => x.member_id))];
    if (g.maximum_members && currentIds.length >= Number(g.maximum_members)) {
      return toast(`This group has reached its maximum of ${g.maximum_members} members.`);
    }
    const available = await safeQuery(db.from('members')
      .select('id,member_number,full_name,phone,status')
      .eq('organization_id', organization.id)
      .in('status', ['APPROVED','ACTIVE'])
      .order('full_name')
      .limit(1000)) || [];
    const existing = new Set(currentIds);
    const members = available.filter(m => !existing.has(m.id));
    const body = `<form id="chamaAddMemberForm">
      <label class="form-field">Select existing GORA member *<select name="member_id" required>
      <option value="">Choose member</option>${members.map(m => `<option value="${esc(m.id)}">${esc(m.member_number || '')} — ${esc(m.full_name)} (${esc(m.phone || 'no phone')})</option>`).join('')}
      </select></label><p id="chamaAddMemberMessage"></p></form>`;
    openModal('Add Group Member', g.group_name, body,
      `<button class="btn btn-primary" id="chamaConfirmAdd" type="button">Add member</button>`, true);
    $('chamaConfirmAdd').onclick = async () => {
      const form = $('chamaAddMemberForm');
      if (!form.reportValidity()) return;
      const memberId = form.elements.member_id.value;
      if (existing.has(memberId)) return setMessage('chamaAddMemberMessage', 'This member is already active in the group.');
      const { error } = await db.from('chama_memberships').insert({
        organization_id: organization.id, group_id: g.id, member_id: memberId,
        status: 'ACTIVE', joined_at: new Date().toISOString().slice(0, 10),
        recorded_by: authUser?.id || null
      });
      if (error) return setMessage('chamaAddMemberMessage', error.message);
      toast('Existing GORA member added to the chama.');
      closeModal();
      await loadChamaDirectory();
      await openChamaProfile(g.id);
    };
  } catch (error) {
    toast(`Unable to add member: ${error?.message || error}`);
  }
}


/* -------------------------------------------------------------------------
 * GORA group reports: member-level source transactions, date presets, print
 * and CSV/Excel-compatible exports. Reports never accept manually entered
 * group totals; all totals are reduced from the underlying member records.
 * ------------------------------------------------------------------------- */
let chamaLastReportRows = [];
let chamaLastReportTitle = 'GORA Chama Report';

function chamaLocalDate(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function chamaMonthStart(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  return chamaLocalDate(d);
}

function chamaMonthEnd(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth()+1, 0);
  return chamaLocalDate(d);
}

function chamaReportRange(mode, startValue, endValue) {
  const today = new Date();
  if (mode === 'WEEKLY') {
    const start = chamaWeekStart(today);
    return { start, end: chamaWeekEnd(start), label: 'Weekly' };
  }
  if (mode === 'MONTHLY') return { start: chamaMonthStart(today), end: chamaMonthEnd(today), label: 'Monthly' };
  const start = startValue || chamaWeekStart(today);
  const end = endValue || chamaWeekEnd(start);
  if (start > end) throw new Error('Start date must be on or before end date.');
  return { start, end, label: 'Custom date range' };
}

async function chamaFetchReportSource(g, range) {
  const memberships = await safeQuery(db.from('chama_memberships')
    .select('member_id,status,joined_at,left_at')
    .eq('organization_id', organization.id).eq('group_id', g.id)) || [];
  const memberIds = [...new Set(memberships.map(x => x.member_id).filter(Boolean))];
  const members = memberIds.length ? await safeQuery(db.from('members')
    .select('id,member_number,full_name,phone,status')
    .eq('organization_id', organization.id).in('id', memberIds).order('full_name')) || [] : [];
  const memberMap = Object.fromEntries(members.map(m => [m.id, m]));
  const accounts = memberIds.length ? await safeQuery(db.from('savings_accounts')
    .select('id,member_id,account_number,balance')
    .eq('organization_id', organization.id).in('member_id', memberIds)) || [] : [];
  const accountIds = accounts.map(a => a.id);
  const savings = accountIds.length ? await safeQuery(db.from('savings_transactions')
    .select('id,savings_account_id,transaction_date,transaction_type,amount,status,payment_method,reference_number,description')
    .eq('organization_id', organization.id).in('savings_account_id', accountIds)
    .eq('status', 'POSTED').gte('transaction_date', `${range.start}T00:00:00`)
    .lte('transaction_date', `${range.end}T23:59:59`).order('transaction_date')) || [] : [];
  const loans = await safeQuery(db.from('loan_accounts')
    .select('id,member_id,loan_account_number,principal_amount,total_repayment,status,disbursed_on')
    .eq('organization_id', organization.id).eq('group_id', g.id)
    .not('status', 'in', '(PENDING,CANCELLED,REJECTED)')) || [];
  const loanIds = loans.map(l => l.id);
  const repayments = loanIds.length ? await safeQuery(db.from('loan_repayments')
    .select('id,loan_account_id,amount,status,payment_date,payment_method,reference_number')
    .eq('organization_id', organization.id).in('loan_account_id', loanIds)
    .eq('status', 'POSTED').gte('payment_date', range.start).lte('payment_date', range.end)
    .order('payment_date')) || [] : [];
  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]));
  const loanMap = Object.fromEntries(loans.map(l => [l.id, l]));
  const collectionEntries = await safeQuery(db.from('chama_collection_entries')
    .select('id,member_id,collection_type,amount,collection_date,status,payment_method,reference_number,loan_account_id,notes')
    .eq('organization_id', organization.id).eq('group_id', g.id)
    .gte('collection_date', range.start).lte('collection_date', range.end)
    .order('collection_date')) || [];
  return { memberships, members, memberMap, accounts, accountMap, savings, loans, loanMap, repayments, collectionEntries };
}

function chamaReportTable(rows) {
  if (!rows || rows.length < 2) return '<p class="note-box">No transactions found for this report period.</p>';
  const headers = rows[0];
  const body = rows.slice(1).map(row => `<tr>${headers.map((_, i) => `<td>${esc(row[i] ?? '')}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}

async function renderChamaReports(g) {
  const target = $('chamaProfileContent');
  if (!target) return;
  const today = new Date();
  const defaultStart = chamaWeekStart(today);
  const defaultEnd = chamaWeekEnd(defaultStart);
  target.innerHTML = `
    <div class="module-header"><div><h3>Group reports</h3><p>Reports are calculated from posted member transactions.</p></div></div>
    <div class="form-grid">
      <label class="form-field">Report type<select id="chamaReportType">
        <option value="WEEKLY_SAVINGS">Weekly savings collection sheet</option>
        <option value="WEEKLY_LOANS">Weekly loan repayment collection sheet</option>
        <option value="MEMBERS">Member list</option>
        <option value="SAVINGS_STATEMENT">Savings statement</option>
        <option value="LOAN_STATEMENT">Loan repayment statement</option>
        <option value="TRANSACTION_HISTORY">Group transaction history</option>
      </select></label>
      <label class="form-field">Period<select id="chamaReportPeriod"><option value="WEEKLY">This week</option><option value="MONTHLY">This month</option><option value="CUSTOM">Date range</option></select></label>
      <label class="form-field">Start date<input id="chamaReportStart" type="date" value="${defaultStart}" disabled></label>
      <label class="form-field">End date<input id="chamaReportEnd" type="date" value="${defaultEnd}" disabled></label>
    </div>
    <div class="toolbar"><button class="btn btn-primary" id="chamaReportGenerate" type="button">Generate report</button><button class="btn btn-soft" id="chamaReportPrint" type="button" disabled>Print</button><button class="btn btn-soft" id="chamaReportExport" type="button" disabled>Export CSV / Excel</button></div>
    <div id="chamaReportPreview"><p class="note-box">Choose a report and period, then select Generate report.</p></div>`;
  const period = $('chamaReportPeriod'), start = $('chamaReportStart'), end = $('chamaReportEnd');
  period.onchange = () => {
    const custom = period.value === 'CUSTOM';
    start.disabled = end.disabled = !custom;
    if (period.value === 'WEEKLY') { start.value = defaultStart; end.value = defaultEnd; }
    if (period.value === 'MONTHLY') { start.value = chamaMonthStart(today); end.value = chamaMonthEnd(today); }
  };
  $('chamaReportGenerate').onclick = async () => {
    try {
      const range = chamaReportRange(period.value, start.value, end.value);
      const reportType = $('chamaReportType').value;
      const source = await chamaFetchReportSource(g, range);
      const { memberMap, memberships, members, accounts, accountMap, savings, loans, loanMap, repayments, collectionEntries } = source;
      const accountMember = accountMap;
      const rows = [];
      let title = '';
      const memberLabel = id => memberMap[id]?.full_name || 'Former / unavailable member';
      const memberNo = id => memberMap[id]?.member_number || '';
      const savingsFor = [];
      savings.forEach(t => {
        const account = accountMember[t.savings_account_id] || {};
        const member = memberMap[account.member_id] || {};
        const signed = t.transaction_type === 'WITHDRAWAL' ? -Number(t.amount || 0) : Number(t.amount || 0);
        savingsFor.push({ date: t.transaction_date, member_id: account.member_id, member: member.full_name || 'Member', member_no: member.member_number || '', type: t.transaction_type, amount: Number(t.amount || 0), signed, method: t.payment_method || '', reference: t.reference_number || '', description: t.description || '' });
      });
      const repaymentRows = repayments.map(r => {
        const loan = loanMap[r.loan_account_id] || {};
        return { date: r.payment_date, member_id: loan.member_id, member: memberLabel(loan.member_id), member_no: memberNo(loan.member_id), loan: loan.loan_account_number || '', amount: Number(r.amount || 0), method: r.payment_method || '', reference: r.reference_number || '' };
      });
      if (reportType === 'MEMBERS') {
        title = 'Group member list';
        rows.push(['Member number','Member name','Phone','Member status','Group membership status','Joined date']);
        memberships.forEach(m => { const x = memberMap[m.member_id] || {}; rows.push([x.member_number || '', x.full_name || '', x.phone || '', x.status || '', m.status || '', m.joined_at || '']); });
      } else if (reportType === 'WEEKLY_SAVINGS') {
        title = 'Savings collection sheet';
        rows.push(['Member number','Member name','Phone','Savings collected (KES)','Payment method(s)','Reference(s)','Signature']);
        const sums = {};
        collectionEntries.filter(e => e.collection_type === 'SAVINGS' && ['RECORDED','POSTED'].includes(e.status)).forEach(e => {
          sums[e.member_id] ||= { amount: 0, methods: new Set(), references: [] };
          sums[e.member_id].amount += Number(e.amount || 0);
          if (e.payment_method) sums[e.member_id].methods.add(e.payment_method);
          if (e.reference_number) sums[e.member_id].references.push(e.reference_number);
        });
        members.forEach(m => { const x = sums[m.id] || { amount: 0, methods: new Set(), references: [] }; rows.push([m.member_number || '',m.full_name || '',m.phone || '',x.amount,[...x.methods].join('; '),x.references.join('; '),'']); });
        rows.push(['TOTAL','','',Object.values(sums).reduce((a,x)=>a+x.amount,0),'','','']);
      } else if (reportType === 'WEEKLY_LOANS') {
        title = 'Loan repayment collection sheet';
        rows.push(['Member number','Member name','Loan account','Loan repayment (KES)','Payment method(s)','Reference(s)','Signature']);
        const sums = {};
        collectionEntries.filter(e => e.collection_type === 'LOAN_REPAYMENT' && ['RECORDED','POSTED'].includes(e.status)).forEach(e => {
          sums[e.member_id] ||= { amount: 0, methods: new Set(), references: [], loan: '' };
          sums[e.member_id].amount += Number(e.amount || 0);
          if (e.payment_method) sums[e.member_id].methods.add(e.payment_method);
          if (e.reference_number) sums[e.member_id].references.push(e.reference_number);
          if (e.loan_account_id) sums[e.member_id].loan = loanMap[e.loan_account_id]?.loan_account_number || e.loan_account_id;
        });
        members.forEach(m => { const x = sums[m.id] || { amount: 0, methods: new Set(), references: [], loan: '' }; rows.push([m.member_number || '',m.full_name || '',x.loan,x.amount,[...x.methods].join('; '),x.references.join('; '),'']); });
        rows.push(['TOTAL','','',Object.values(sums).reduce((s,r)=>s+r.amount,0),'','','']);
      } else if (reportType === 'SAVINGS_STATEMENT') {
        title = 'Member savings statement';
        rows.push(['Date','Member number','Member name','Transaction type','Amount (KES)','Signed amount (KES)','Method','Reference','Description']);
        savingsFor.forEach(t=>rows.push([t.date,t.member_no,t.member,t.type,t.amount,t.signed,t.method,t.reference,t.description]));
        rows.push(['TOTAL','','','Net savings',savingsFor.reduce((s,t)=>s+t.amount,0),savingsFor.reduce((s,t)=>s+t.signed,0),'','','']);
      } else if (reportType === 'LOAN_STATEMENT') {
        title = 'Loan repayment statement';
        rows.push(['Date','Member number','Member name','Loan account','Repayment amount (KES)','Method','Reference']);
        repaymentRows.forEach(r=>rows.push([r.date,r.member_no,r.member,r.loan,r.amount,r.method,r.reference]));
        rows.push(['','','','TOTAL',repaymentRows.reduce((s,r)=>s+r.amount,0),'','']);
      } else {
        title = 'Group transaction history';
        rows.push(['Date','Member number','Member name','Transaction','Amount (KES)','Method','Reference']);
        savingsFor.forEach(t=>rows.push([t.date,t.member_no,t.member,`Savings ${t.type}`,t.amount,t.method,t.reference]));
        repaymentRows.forEach(r=>rows.push([r.date,r.member_no,r.member,'Loan repayment',r.amount,r.method,r.reference]));
        rows.splice(1, rows.length-1, ...rows.slice(1).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
      }
      chamaLastReportRows = rows;
      chamaLastReportTitle = `${g.group_name} — ${title} (${range.start} to ${range.end})`;
      $('chamaReportPreview').innerHTML = `<div id="chamaReportPrintArea"><h3>${esc(title)}</h3><p>${esc(g.group_name)} (${esc(g.group_code || '')}) · ${esc(range.label)}: ${esc(range.start)} to ${esc(range.end)}</p>${chamaReportTable(rows)}</div>`;
      $('chamaReportPrint').disabled = $('chamaReportExport').disabled = false;
      $('chamaReportPrint').onclick = () => printChamaReport();
      $('chamaReportExport').onclick = () => { chamaDownloadCsv(chamaGroupFilename(g, `${reportType.toLowerCase()}_${range.start}_${range.end}`), rows); toast('Report exported.'); };
    } catch (error) {
      $('chamaReportPreview').innerHTML = `<div class="error-box">Unable to generate report: ${chamaSafeError(error)}</div>`;
    }
  };
}

function printChamaReport() {
  const area = $('chamaReportPrintArea');
  if (!area) return toast('Generate a report before printing.');
  const printWindow = window.open('', '_blank');
  if (!printWindow) return toast('Allow pop-ups to print this report, or use your browser Print command.');
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html><head><title>${esc(chamaLastReportTitle)}</title><style>body{font:12px Arial,sans-serif;padding:24px;color:#111}h2,h3{margin:0 0 12px}p{margin:0 0 16px}.data-table{width:100%;border-collapse:collapse}.data-table th,.data-table td{border:1px solid #bbb;padding:7px;text-align:left}.data-table th{background:#eee}.table-wrap{overflow:visible}@media print{body{padding:0}}</style></head><body><h2>${esc(chamaLastReportTitle)}</h2>${area.innerHTML}</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.close();
}
