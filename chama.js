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


function chamaLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function chamaWeekStart(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);

  const day = (d.getDay() + 6) % 7; // Monday
  d.setDate(d.getDate() - day);

  return chamaLocalDateKey(d);
}

function chamaWeekEnd(start) {
  const d = new Date(`${start}T12:00:00`);
  d.setDate(d.getDate() + 6);

  return chamaLocalDateKey(d);
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
    if (chamaSearch) {
      const term = chamaSearch.replace(/[%_,]/g, ' ').trim();
      query = query.or(`group_name.ilike.%${term}%,group_code.ilike.%${term}%,location.ilike.%${term}%`);
    }

    const groups = await safeQuery(query);
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
        <div class="stat-card"><small>Group savings register</small><h3 id="chamaMetricSavings">—</h3></div>
        <div class="stat-card"><small>Loans disbursed</small><h3 id="chamaMetricDisbursed">—</h3></div>
        <div class="stat-card"><small>Loan repayments</small><h3 id="chamaMetricRepayments">—</h3></div>
        <div class="stat-card"><small>Outstanding loans</small><h3 id="chamaMetricOutstanding">—</h3></div>
        <div class="stat-card"><small>This week's collected</small><h3 id="chamaMetricWeekly">—</h3></div>
      </div>
      <div class="toolbar">
        <button class="btn btn-soft" id="chamaMembersTab" type="button">Members</button>
        <button class="btn btn-soft" id="chamaCollectionTab" type="button">Weekly collection</button>
        <button class="btn btn-soft" id="chamaHistoryTab" type="button">Collection history</button>
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
  $('chamaReportBtn').onclick = () => exportChamaReport(g);
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
    // Do not attribute a member's personal savings account to this group.
    // Group-specific collections are displayed from the Chama collection register.
    let savingsNet = 0;

    const loans = await safeQuery(db.from('loan_accounts')
      .select('id,principal_amount,status,member_id,group_id,total_repayment')
      .eq('organization_id', organization.id).eq('group_id', group.id)) || [];
    const loanIds = loans.map(l => l.id);
    const repayments = loanIds.length ? await safeQuery(db.from('loan_repayments')
      .select('id,loan_account_id,amount,status,payment_date').eq('organization_id', organization.id)
      .in('loan_account_id', loanIds).eq('status', 'POSTED')) || [] : [];
    const disbursed = loans.filter(l => !['CANCELLED','REJECTED','PENDING'].includes(l.status))
      .reduce((s,l) => s + Number(l.principal_amount || 0), 0);
    const repaid = repayments.reduce((s,r) => s + Number(r.amount || 0), 0);
    const repaymentIds = repayments.map(r => r.id);
    const allocations = repaymentIds.length ? await safeQuery(db.from('loan_repayment_allocations')
      .select('repayment_id,principal_amount').eq('organization_id', organization.id)
      .in('repayment_id', repaymentIds)) || [] : [];
    const principalPaid = allocations.reduce((s,a) => s + Number(a.principal_amount || 0), 0);
    const outstanding = Math.max(0, disbursed - principalPaid);

    const weekStart = chamaWeekStart(new Date());
    const weekEnd = chamaWeekEnd(weekStart);
    const weeklyRegister = await safeQuery(db.from('chama_collection_entries')
      .select('collection_type,amount,status').eq('organization_id', organization.id)
      .eq('group_id', group.id).gte('collection_date', weekStart).lte('collection_date', weekEnd)
      .in('status', ['RECORDED','POSTED'])) || [];
    const weeklySavings = weeklyRegister.filter(t => t.collection_type === 'SAVINGS')
      .reduce((sum,t) => sum + Number(t.amount || 0), 0);
    const allGroupRegister = await safeQuery(db.from('chama_collection_entries')
      .select('collection_type,amount,status').eq('organization_id', organization.id)
      .eq('group_id', group.id).in('status', ['RECORDED','POSTED'])) || [];
    savingsNet = allGroupRegister.filter(t => t.collection_type === 'SAVINGS')
      .reduce((sum,t) => sum + Number(t.amount || 0), 0);
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
  const body=`<form id="chamaMoveForm"><label class="form-field">Action<select name="action"><option value="REMOVE">Remove from group</option><option value="TRANSFER">Transfer to another group</option></select></label><label class="form-field">Destination group<select name="destination"><option value="">Select destination</option></select></label><label class="form-field">Reason<input name="reason" maxlength="200"></label><p id="chamaMoveMessage"></p></form>`;
  openModal('Remove or Transfer Member',g.group_name,body,`<button class="btn btn-primary" id="chamaMoveConfirm" type="button">Confirm</button>`,true);
  const groups=await safeQuery(db.from('chama_groups').select('id,group_name,group_code').eq('organization_id',organization.id).eq('status','ACTIVE').neq('id',g.id))||[];
  $('chamaMoveForm').elements.destination.innerHTML=`<option value="">Select destination</option>${groups.map(x=>`<option value="${esc(x.id)}">${esc(x.group_name)} (${esc(x.group_code)})</option>`).join('')}`;
  $('chamaMoveForm').elements.action.onchange=e=>$('chamaMoveForm').elements.destination.disabled=e.target.value!=='TRANSFER';
  $('chamaMoveForm').elements.destination.disabled=true;
  $('chamaMoveConfirm').onclick=async()=>{
    const f=$('chamaMoveForm'),d=Object.fromEntries(new FormData(f).entries());
    const {data:link,error:readError}=await db.from('chama_memberships').select('id,member_id').eq('organization_id',organization.id).eq('id',membershipId).single();
    if(readError)return setMessage('chamaMoveMessage',readError.message);
    if(d.action==='TRANSFER' && !d.destination)return setMessage('chamaMoveMessage','Choose a destination group.');
    if(d.action==='TRANSFER'){
      const existing=await safeQuery(db.from('chama_memberships').select('id')
        .eq('organization_id',organization.id).eq('group_id',d.destination)
        .eq('member_id',link.member_id).eq('status','ACTIVE').maybeSingle());
      if(existing)return setMessage('chamaMoveMessage','This member is already active in the destination group.');
    }
    const {error}=await db.from('chama_memberships').update({status:'EXITED',left_at:new Date().toISOString().slice(0,10)}).eq('organization_id',organization.id).eq('id',membershipId);
    if(error)return setMessage('chamaMoveMessage',error.message);
    if(d.action==='TRANSFER'){
      const {error:addError}=await db.from('chama_memberships').insert({organization_id:organization.id,group_id:d.destination,member_id:link.member_id,status:'ACTIVE',recorded_by:authUser?.id||null});
      if(addError)return setMessage('chamaMoveMessage',`Member left the source group, but transfer failed: ${addError.message}`);
    }
    toast(d.action==='TRANSFER'?'Member transferred.':'Member removed from group.');
    await openChamaProfile(g.id);
  };
}


async function renderChamaWeeklyCollection(g) {
  const target = $('chamaProfileContent');
  const start = chamaCollectionWeek;
  const end = chamaWeekEnd(start);

  target.innerHTML = `
    <div class="module-header">
      <h3>Weekly Chama Collection Register</h3>
      <label class="form-field">
        Week starting
        <input id="chamaWeekPicker" type="date" value="${esc(start)}">
      </label>
    </div>
    <div id="chamaWeeklyCollectionBody">
      <p>Loading collection...</p>
    </div>
  `;

  $('chamaWeekPicker').onchange = e => {
    if (!e.target.value) return;
    chamaCollectionWeek = chamaWeekStart(
      new Date(`${e.target.value}T00:00:00`)
    );
    renderChamaWeeklyCollection(g);
  };

  try {
    const memberships = await safeQuery(
      db.from('chama_memberships')
        .select('member_id')
        .eq('organization_id', organization.id)
        .eq('group_id', g.id)
        .eq('status', 'ACTIVE')
    ) || [];

    const memberIds = [...new Set(memberships.map(x => x.member_id))];

    const members = memberIds.length
      ? await safeQuery(
          db.from('members')
            .select('id,member_number,full_name')
            .eq('organization_id', organization.id)
            .in('id', memberIds)
            .order('full_name')
        ) || []
      : [];

    const entries = await safeQuery(
      db.from('chama_collection_entries')
        .select('*')
        .eq('organization_id', organization.id)
        .eq('group_id', g.id)
        .gte('collection_date', start)
        .lte('collection_date', end)
        .order('created_at')
    ) || [];

    const categories = {
      SAVINGS: 'savings',
      LOAN_REPAYMENT: 'loan',
      PROCESSING_FEE: 'processing',
      REGISTRATION_FEE: 'registration',
      FINE: 'fine'
    };

    const totals = {
      savings: 0,
      loan: 0,
      processing: 0,
      registration: 0,
      fine: 0
    };

    const memberTotals = {};

    entries.forEach(entry => {
      const key = categories[entry.collection_type];
      if (!key) return;

      memberTotals[entry.member_id] =
        memberTotals[entry.member_id] || {
          savings: 0,
          loan: 0,
          processing: 0,
          registration: 0,
          fine: 0
        };

      if (['RECORDED', 'POSTED'].includes(entry.status)) {
        const amount = Number(entry.amount || 0);
        totals[key] += amount;
        memberTotals[entry.member_id][key] += amount;
      }
    });

    const totalCollected = Object.values(totals)
      .reduce((sum, amount) => sum + amount, 0);

    const weeklyTarget =
      members.length * Number(g.target_weekly_savings || 100);

    $('chamaWeeklyCollectionBody').innerHTML = `
      <div class="form-grid">
        <div class="stat-card">
          <small>Weekly savings target</small>
          <h3>${chamaMoney(weeklyTarget)}</h3>
        </div>
        <div class="stat-card">
          <small>Savings collected</small>
          <h3>${chamaMoney(totals.savings)}</h3>
        </div>
        <div class="stat-card">
          <small>Loan repayments</small>
          <h3>${chamaMoney(totals.loan)}</h3>
        </div>
        <div class="stat-card">
          <small>Processing fees</small>
          <h3>${chamaMoney(totals.processing)}</h3>
        </div>
        <div class="stat-card">
          <small>Registration fees</small>
          <h3>${chamaMoney(totals.registration)}</h3>
        </div>
        <div class="stat-card">
          <small>Fines collected</small>
          <h3>${chamaMoney(totals.fine)}</h3>
        </div>
        <div class="stat-card">
          <small>Total recorded</small>
          <h3>${chamaMoney(totalCollected)}</h3>
        </div>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Savings</th>
              <th>Loan repayment</th>
              <th>Fees</th>
              <th>Fines</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${members.map(member => {
              const x = memberTotals[member.id] || {};
              return `
                <tr>
                  <td>
                    ${esc(member.full_name)}
                    <small>${esc(member.member_number || '')}</small>
                  </td>
                  <td>${chamaMoney(x.savings || 0)}</td>
                  <td>${chamaMoney(x.loan || 0)}</td>
                  <td>
                    ${chamaMoney(
                      Number(x.processing || 0) +
                      Number(x.registration || 0)
                    )}
                  </td>
                  <td>${chamaMoney(x.fine || 0)}</td>
                  <td>
                    <button
                      class="btn btn-soft btn-sm"
                      data-chama-collect="${esc(member.id)}"
                      type="button">
                      Add receipt
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <p class="note-box">
        Only existing posted savings and loan receipts, and verified fee
        or fine receipts, can be added. This register does not post money
        to the ledger again.
      </p>
    `;

    $('chamaWeeklyCollectionBody')
      .querySelectorAll('[data-chama-collect]')
      .forEach(button => {
        button.onclick = () => openRecordChamaCollection(
          g,
          button.getAttribute('data-chama-collect'),
          start
        );
      });

  } catch (error) {
    $('chamaWeeklyCollectionBody').innerHTML = `
      <div class="error-box">
        Unable to load weekly collection.
        ${chamaSafeError(error)}
      </div>
    `;
  }
}


async function openRecordChamaCollection(g, memberId, weekStart) {
  try {
    const member = await safeQuery(
      db.from('members')
        .select('id,full_name')
        .eq('organization_id', organization.id)
        .eq('id', memberId)
        .single()
    );

    const weekEnd = chamaWeekEnd(weekStart);

    const existing = await safeQuery(
      db.from('chama_collection_entries')
        .select(`
          savings_transaction_id,
          repayment_id,
          gora2_repayment_id,
          processing_fee_payment_id,
          registration_fee_payment_id,
          fine_payment_id
        `)
        .eq('organization_id', organization.id)
    ) || [];

    const usedIds = new Set();
    existing.forEach(row => {
      [
        row.savings_transaction_id,
        row.repayment_id,
        row.gora2_repayment_id,
        row.processing_fee_payment_id,
        row.registration_fee_payment_id,
        row.fine_payment_id
      ].filter(Boolean).forEach(id => usedIds.add(String(id)));
    });

    const receipts = [];

    function receiptDate(row) {
      const value =
        row.transaction_date ||
        row.payment_date ||
        row.paid_on ||
        row.fine_date ||
        row.created_at;

      return value ? String(value).slice(0, 10) : '';
    }

    function normalizeMethod(value) {
      const method = String(value || '').toUpperCase().replace(/[\s-]/g, '');

      if (method === 'MPESA' || method === 'MOBILEMONEY') return 'MPESA';
      if (method === 'CASH') return 'CASH';
      if (method === 'BANK') return 'BANK';
      return 'OTHER';
    }

    function addReceipt(row, type, linkColumn, description) {
      const id = String(row.id);
      const date = receiptDate(row);
      const amount = Number(row.amount || 0);

      if (usedIds.has(id)) return;
      if (!date || date < weekStart || date > weekEnd) return;
      if (!Number.isFinite(amount) || amount <= 0) return;

      receipts.push({
        id,
        type,
        linkColumn,
        date,
        amount,
        method: normalizeMethod(row.payment_method),
        reference: row.reference_number || row.transaction_number || '',
        description
      });
    }

    // 1. Posted savings deposits
    const savingsAccounts = await safeQuery(
      db.from('savings_accounts')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('member_id', memberId)
    ) || [];

    const savingsAccountIds = savingsAccounts.map(x => x.id);

    if (savingsAccountIds.length) {
      const savings = await safeQuery(
        db.from('savings_transactions')
          .select('*')
          .eq('organization_id', organization.id)
          .in('savings_account_id', savingsAccountIds)
          .eq('transaction_type', 'DEPOSIT')
          .eq('status', 'POSTED')
          .not('journal_entry_id', 'is', null)
      ) || [];

      savings.forEach(row => addReceipt(
        row,
        'SAVINGS',
        'savings_transaction_id',
        'Savings deposit'
      ));
    }

    // 2. Posted GORA 2.0 loan repayments
    const loanAccounts = await safeQuery(
      db.from('gora2_loan_accounts')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('member_id', memberId)
    ) || [];

    const loanAccountIds = loanAccounts.map(x => x.id);

    if (loanAccountIds.length) {
      const repayments = await safeQuery(
        db.from('gora2_loan_repayments')
          .select('*')
          .eq('organization_id', organization.id)
          .in('loan_account_id', loanAccountIds)
          .eq('status', 'POSTED')
          .not('journal_entry_id', 'is', null)
      ) || [];

      repayments.forEach(row => addReceipt(
        row,
        'LOAN_REPAYMENT',
        'gora2_repayment_id',
        'Loan repayment'
      ));
    }

    // 3. Verified loan processing fee receipts
    const applications = await safeQuery(
      db.from('gora2_loan_applications')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('member_id', memberId)
    ) || [];

    const applicationIds = applications.map(x => x.id);

    if (applicationIds.length) {
      const fees = await safeQuery(
        db.from('gora2_loan_application_fee_payments')
          .select('*')
          .eq('organization_id', organization.id)
          .in('application_id', applicationIds)
          .eq('status', 'VERIFIED')
          .not('journal_entry_id', 'is', null)
      ) || [];

      fees.forEach(row => addReceipt(
        row,
        'PROCESSING_FEE',
        'processing_fee_payment_id',
        'Loan processing fee'
      ));
    }

    // 4. Verified registration fee receipts
    const registrationFees = await safeQuery(
      db.from('gora_member_registration_fee_payments')
        .select('*')
        .eq('organization_id', organization.id)
        .eq('member_id', memberId)
        .eq('status', 'VERIFIED')
        .not('journal_entry_id', 'is', null)
    ) || [];

    registrationFees.forEach(row => addReceipt(
      row,
      'REGISTRATION_FEE',
      'registration_fee_payment_id',
      'Registration fee'
    ));

    // 5. Verified fine receipts
    const fines = await safeQuery(
      db.from('gora2_fine_payments')
        .select('*')
        .eq('organization_id', organization.id)
        .eq('member_id', memberId)
        .eq('status', 'VERIFIED')
        .not('journal_entry_id', 'is', null)
    ) || [];

    fines.forEach(row => addReceipt(
      row,
      'FINE',
      'fine_payment_id',
      'Fine payment'
    ));

    if (!receipts.length) {
      openModal(
        'Add Collection Receipt',
        member?.full_name || g.group_name,
        `<p class="note-box">
          No unused, posted or verified receipts were found for this member
          during ${esc(weekStart)} to ${esc(weekEnd)}.
          First record and post the payment through the appropriate GORA
          savings, loan, fee or fine workflow.
        </p>`,
        `<button class="btn btn-secondary" type="button" onclick="closeModal()">Close</button>`,
        true
      );
      return;
    }

    const options = receipts.map((row, index) => `
      <option value="${index}">
        ${esc(row.description)} —
        ${esc(row.date)} —
        ${chamaMoney(row.amount)} —
        ${esc(row.method)}
        ${row.reference ? ` — ${esc(row.reference)}` : ''}
      </option>
    `).join('');

    const body = `
      <form id="chamaRecordCollectionForm">
        <label class="form-field">
          Member
          <input readonly value="${esc(member?.full_name || 'Member')}">
        </label>

        <label class="form-field">
          Select posted / verified receipt
          <select name="receipt_index" required>
            <option value="">Choose a receipt</option>
            ${options}
          </select>
        </label>

        <div id="chamaReceiptDetails" class="note-box">
          Select a receipt to view its details.
        </div>

        <p id="chamaCollectionMessage"></p>
      </form>
    `;

    openModal(
      'Add Collection Receipt',
      member?.full_name || g.group_name,
      body,
      `<button class="btn btn-primary" id="chamaCollectionSave" type="button">Add to register</button>`,
      true
    );

    const form = $('chamaRecordCollectionForm');
    const select = form.querySelector('[name="receipt_index"]');

    select.onchange = () => {
      const row = receipts[Number(select.value)];
      if (!row) {
        $('chamaReceiptDetails').innerHTML =
          'Select a receipt to view its details.';
        return;
      }

      $('chamaReceiptDetails').innerHTML = `
        <strong>${esc(row.description)}</strong><br>
        Date: ${esc(row.date)}<br>
        Amount: ${chamaMoney(row.amount)}<br>
        Payment method: ${esc(row.method)}<br>
        Reference: ${esc(row.reference || 'N/A')}
      `;
    };

    $('chamaCollectionSave').onclick = async () => {
      if (!form.reportValidity()) return;

      const index = Number(select.value);
      const row = receipts[index];

      if (!row) {
        return setMessage(
          'chamaCollectionMessage',
          'Please select a valid receipt.'
        );
      }

      const payload = {
        organization_id: organization.id,
        group_id: g.id,
        member_id: memberId,
        collection_type: row.type,
        amount: row.amount,
        collection_date: row.date,
        payment_method: row.method,
        reference_number: row.reference || null,
        status: 'POSTED',
        recorded_by: authUser?.id || null
      };

      payload[row.linkColumn] = row.id;

      const { error } = await db
        .from('chama_collection_entries')
        .insert(payload);

      if (error) {
        return setMessage(
          'chamaCollectionMessage',
          error.message
        );
      }

      toast('Receipt added to the Chama collection register.');
      closeModal();
      await openChamaProfile(g.id);
      await renderChamaWeeklyCollection(g);
    };

  } catch (error) {
    openModal(
      'Collection Receipt Error',
      g.group_name,
      `<div class="error-box">${chamaSafeError(error)}</div>`,
      `<button class="btn btn-secondary" type="button" onclick="closeModal()">Close</button>`,
      true
    );
  }
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


async function exportChamaCollectionSheet(g) {
  try {
    const start = chamaCollectionWeek, end = chamaWeekEnd(start);
    const links = await safeQuery(db.from('chama_memberships').select('member_id,status')
      .eq('organization_id', organization.id).eq('group_id', g.id).eq('status','ACTIVE')) || [];
    const ids = [...new Set(links.map(x => x.member_id))];
    const members = ids.length ? await safeQuery(db.from('members')
      .select('id,member_number,full_name,phone').eq('organization_id',organization.id).in('id',ids).order('full_name')) || [] : [];
    const entries = await safeQuery(db.from('chama_collection_entries')
      .select('member_id,collection_type,amount,status').eq('organization_id',organization.id)
      .eq('group_id',g.id).gte('collection_date',start).lte('collection_date',end)
      .in('status',['RECORDED','POSTED'])) || [];
    const sums = {};
    entries.forEach(e => {
      sums[e.member_id] ||= {savings:0,loan:0};
      if(e.collection_type==='SAVINGS') sums[e.member_id].savings += Number(e.amount||0);
      if(e.collection_type==='LOAN_REPAYMENT') sums[e.member_id].loan += Number(e.amount||0);
    });
    const rows=[['GORA CHAMA WEEKLY COLLECTION'],['Group',g.group_name],['Group code',g.group_code],['Week',`${start} to ${end}`],[],
      ['Member no.','Member name','Phone','Savings target','Savings recorded','Loan repayment recorded','Total recorded','Signature']];
    members.forEach(m=>{const s=sums[m.id]||{savings:0,loan:0};rows.push([m.member_number||'',m.full_name||'',m.phone||'',Number(g.target_weekly_savings||100),s.savings,s.loan,s.savings+s.loan,'']);});
    const totals=Object.values(sums).reduce((a,x)=>({savings:a.savings+x.savings,loan:a.loan+x.loan}),{savings:0,loan:0});
    rows.push([],['TOTAL','','',members.length*Number(g.target_weekly_savings||100),totals.savings,totals.loan,totals.savings+totals.loan,'']);
    const csv=rows.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;
    a.download=`${(g.group_code||'chama').replace(/[^a-z0-9-_]/gi,'_')}_weekly_${start}.csv`;a.click();URL.revokeObjectURL(url);
    toast('Weekly collection sheet exported.');
  } catch(error) { toast(error?.message||'Unable to export collection sheet.'); }
}
