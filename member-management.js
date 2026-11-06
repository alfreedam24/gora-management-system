
/*
 GORA SAVINGS & CREDIT GROUP
 MEMBER MANAGEMENT MODULE - VERSION 1

 Features:
 - Member registration
 - Individual and chama members
 - Member directory
 - Search and filters
 - Individual member profiles
 - CSV export
 - Next-of-kin details

 Uses existing Supabase tables:
 members
 chamas
 chama_members

 IMPORTANT:
 This module does not store financial totals manually.
 Savings and loan balances must come from verified ledgers.
*/

(function () {
  const el = id => document.getElementById(id);

  const escapeHTML = value =>
    String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));

  const money = amount =>
    new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      maximumFractionDigits: 0
    }).format(Number(amount || 0));

  window.membersPage = async function (container) {

    const [memberResult, chamaResult, membershipResult] =
      await Promise.all([

        safe(
          db.from('members')
            .select(`
              id,
              member_number,
              full_name,
              phone,
              location,
              date_joined,
              status,
              date_of_birth,
              email,
              next_of_kin_name,
              next_of_kin_phone,
              next_of_kin_relationship,
              membership_fee_due,
              membership_fee_status,
              created_at
            `)
            .order('created_at', { ascending: false })
            .limit(500)
        ),

        safe(
          db.from('chamas')
            .select('id,name,status')
            .order('name')
        ),

        safe(
          db.from('chama_members')
            .select('member_id,chama_id,status')
            .eq('status', 'active')
        )

      ]);

    const members = memberResult.data || [];
    const chamas = chamaResult.data || [];
    const memberships = membershipResult.data || [];

    const chamaNames = Object.fromEntries(
      chamas.map(group => [group.id, group.name])
    );

    const memberGroups = {};

    memberships.forEach(link => {
      if (!memberGroups[link.member_id]) {
        memberGroups[link.member_id] = [];
      }

      memberGroups[link.member_id].push({
        id: link.chama_id,
        name: chamaNames[link.chama_id] || 'Chama'
      });
    });

    const activeCount =
      members.filter(m => m.status === 'active').length;

    const pendingCount =
      members.filter(m =>
        m.status === 'pending_verification'
      ).length;

    const groupMemberCount =
      new Set(memberships.map(x => x.member_id)).size;

    container.innerHTML = `

      <div class="page-heading">

        <div>
          <h2>Members Management</h2>

          <div class="sub">
            Registration, member profiles and chama records.
          </div>
        </div>

        <button class="primary" id="addMember">
          + Register Member
        </button>

      </div>

      <div class="stats">

        <div class="stat blue">
          <div class="label">All Members</div>
          <strong>${members.length}</strong>
          <div class="foot">Registered records</div>
        </div>

        <div class="stat good">
          <div class="label">Active Members</div>
          <strong>${activeCount}</strong>
          <div class="foot">Active accounts</div>
        </div>

        <div class="stat warn">
          <div class="label">Pending Verification</div>
          <strong>${pendingCount}</strong>
          <div class="foot">Awaiting review</div>
        </div>

        <div class="stat">
          <div class="label">Chama Members</div>
          <strong>${groupMemberCount}</strong>
          <div class="foot">Active group links</div>
        </div>

      </div>

      <div class="panel" id="memberFormPanel" hidden>

        <div class="table-head">
          <h3>New Member Registration</h3>

          <button class="secondary" id="closeMemberForm">
            Close
          </button>
        </div>

        <form id="memberForm" class="grid-two">

          <label>
            Member Number
            <input
              name="member_number"
              maxlength="30"
              placeholder="Automatic if blank"
            >
          </label>

          <label>
            Full Name
            <input
              name="full_name"
              required
              maxlength="120"
            >
          </label>

          <label>
            Phone Number
            <input
              name="phone"
              required
              maxlength="30"
              placeholder="07XXXXXXXX"
            >
          </label>

          <label>
            Email Address
            <input
              name="email"
              type="email"
              maxlength="150"
            >
          </label>

          <label>
            Location / Village
            <input
              name="location"
              required
              maxlength="120"
            >
          </label>

          <label>
            Date of Birth
            <input
              name="date_of_birth"
              type="date"
            >
          </label>
          <div class="panel">
            <h3>Member Documents</h3>
            <p>JPG, PNG or PDF. Maximum 5 MB per file.</p>
          </div>

          <label>
            Profile Photo
            <input name="profile_photo" type="file"
              accept="image/jpeg,image/png">
          </label>

          <label>
            National ID — Front
            <input name="national_id_front" type="file"
              accept="image/jpeg,image/png,application/pdf">
          </label>

          <label>
            National ID — Back
            <input name="national_id_back" type="file"
              accept="image/jpeg,image/png,application/pdf">
          </label>

          <label>
            Proof of Residence
            <input name="proof_of_residence" type="file"
              accept="image/jpeg,image/png,application/pdf">
          </label>

          <label>
            Business / Employment Document
            <input name="business_employment" type="file"
              accept="image/jpeg,image/png,application/pdf">
          </label>

          <label>
            Other Supporting Document
            <input name="other_supporting" type="file"
              accept="image/jpeg,image/png,application/pdf">
          </label>
          <label>
            Date Joined
            <input
              name="date_joined"
              type="date"
              value="${new Date().toISOString().slice(0,10)}"
              required
            >
          </label>

          <label>
            Member Status

            <select name="status">
              <option value="pending_verification">
                Pending Verification
              </option>

              <option value="active">
                Active
              </option>

              <option value="inactive">
                Inactive
              </option>
            </select>
          </label>

          <label>
            Next of Kin Name
            <input
              name="next_of_kin_name"
              maxlength="120"
            >
          </label>

          <label>
            Next of Kin Phone
            <input
              name="next_of_kin_phone"
              maxlength="30"
            >
          </label>

          <label>
            Relationship
            <input
              name="next_of_kin_relationship"
              maxlength="60"
            >
          </label>

          <label>
            Membership Fee Due (KSh)

            <input
              name="membership_fee_due"
              type="number"
              min="0"
              step="1"
              value="500"
              required
            >
          </label>

          <label>
            Membership Fee Status

            <select name="membership_fee_status">
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
              <option value="waived">Waived</option>
            </select>
          </label>

          <label>
            Chama Assignment

            <select name="chama_id">

              <option value="">
                Individual Member
              </option>

              ${chamas
                .filter(g => g.status === 'active')
                .map(g => `
                  <option value="${escapeHTML(g.id)}">
                    ${escapeHTML(g.name)}
                  </option>
                `).join('')}

            </select>
          </label>

          <div>
            <button class="primary" type="submit">
              Save Member
            </button>

            <p id="memberMessage" class="message"></p>
          </div>

        </form>

        <p class="hint">
          Only collect information provided with the member's consent.
          National ID documents will be handled through restricted storage.
        </p>

      </div>

      <div class="panel">

        <div class="table-head">

          <h3>Member Directory</h3>

          <button class="secondary" id="exportMembers">
            Export CSV
          </button>

        </div>

        <div class="grid-two">

          <label>
            Search Member
            <input
              id="memberSearch"
              placeholder="Name, phone or member number"
            >
          </label>

          <label>
            Chama / Individual

            <select id="chamaFilter">

              <option value="">All Members</option>

              <option value="individual">
                Individuals Only
              </option>

              ${chamas.map(g => `
                <option value="${escapeHTML(g.id)}">
                  ${escapeHTML(g.name)}
                </option>
              `).join('')}

            </select>
          </label>

          <label>
            Member Status

            <select id="statusFilter">
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="pending_verification">
                Pending Verification
              </option>
              <option value="inactive">Inactive</option>
            </select>
          </label>

          <label>
            Location
            <input
              id="locationFilter"
              placeholder="Enter location"
            >
          </label>

        </div>

        <p id="memberCount" class="sub"></p>

        <div class="tablebox">

          <table>

            <thead>
              <tr>
                <th>Member No.</th>
                <th>Full Name</th>
                <th>Phone</th>
                <th>Location</th>
                <th>Membership</th>
                <th>Date Joined</th>
                <th>Status</th>
                <th>Profile</th>
              </tr>
            </thead>

            <tbody id="memberRows"></tbody>

          </table>

        </div>

      </div>

      <div id="memberProfile"></div>

      <div class="notice">
        Financial balances will be calculated from verified savings,
        loan and repayment transactions. They will not be manually
        entered into member profiles.
      </div>

    `;

    const formPanel = el('memberFormPanel');

    el('addMember').onclick = () => {
      formPanel.hidden = false;

      formPanel.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    };

    el('closeMemberForm').onclick = () => {
      formPanel.hidden = true;
    };

    function renderMembers() {

      const search =
        el('memberSearch').value.trim().toLowerCase();

      const groupFilter =
        el('chamaFilter').value;

      const statusFilter =
        el('statusFilter').value;

      const locationFilter =
        el('locationFilter').value.trim().toLowerCase();

      const filtered = members.filter(member => {

        const searchText = [
          member.full_name,
          member.phone,
          member.member_number
        ].join(' ').toLowerCase();

        const groups =
          memberGroups[member.id] || [];

        return (
          (!search || searchText.includes(search)) &&

          (!statusFilter ||
            member.status === statusFilter) &&

          (!locationFilter ||
            String(member.location || '')
              .toLowerCase()
              .includes(locationFilter)) &&

          (!groupFilter ||
            (
              groupFilter === 'individual'
                ? groups.length === 0
                : groups.some(g => g.id === groupFilter)
            ))
        );

      });

      el('memberCount').textContent =
        `Showing ${filtered.length} of ${members.length} members`;

      el('memberRows').innerHTML = filtered.length

        ? filtered.map(member => {

            const groups =
              memberGroups[member.id] || [];

            return `

              <tr>

                <td>
                  ${escapeHTML(member.member_number || '—')}
                </td>

                <td>
                  ${escapeHTML(member.full_name)}
                </td>

                <td>
                  ${escapeHTML(member.phone || '—')}
                </td>

                <td>
                  ${escapeHTML(member.location || '—')}
                </td>

                <td>
                  ${escapeHTML(
                    groups.length
                      ? groups.map(g => g.name).join(', ')
                      : 'Individual'
                  )}
                </td>

                <td>
                  ${escapeHTML(member.date_joined || '—')}
                </td>

                <td>
                  ${escapeHTML(
                    (member.status || '—').replaceAll('_', ' ')
                  )}
                </td>

                <td>
                  <button
                    class="secondary"
                    data-profile="${escapeHTML(member.id)}"
                  >
                    View
                  </button>
                </td>

              </tr>

            `;

          }).join('')

        : `
          <tr>
            <td colspan="8" class="empty">
              No matching members found.
            </td>
          </tr>
        `;

      el('memberRows')
        .querySelectorAll('[data-profile]')
        .forEach(button => {

          button.onclick = () =>
            showProfile(button.dataset.profile);

        });

    }

    [
      'memberSearch',
      'chamaFilter',
      'statusFilter',
      'locationFilter'
    ].forEach(id => {

      el(id).addEventListener('input', renderMembers);
      el(id).addEventListener('change', renderMembers);

    });

    renderMembers();

    el('exportMembers').onclick = () => {

      const headers = [
        'Member Number',
        'Full Name',
        'Phone',
        'Location',
        'Membership Type',
        'Chama',
        'Date Joined',
        'Status'
      ];

      const rows = members.map(member => {

        const groups =
          memberGroups[member.id] || [];

        return [
          member.member_number,
          member.full_name,
          member.phone,
          member.location,
          groups.length ? 'Chama' : 'Individual',
          groups.map(g => g.name).join('; '),
          member.date_joined,
          member.status
        ];

      });

      const csv = [headers, ...rows]
        .map(row =>
          row.map(value =>
            '"' + String(value ?? '').replace(/"/g, '""') + '"'
          ).join(',')
        )
        .join('\r\n');

      const blob = new Blob([csv], {
        type: 'text/csv;charset=utf-8;'
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download =
        'GORA-members-' +
        new Date().toISOString().slice(0,10) +
        '.csv';

      link.click();

      URL.revokeObjectURL(url);

    };

    async function showProfile(memberId) {

      const member =
        members.find(m => m.id === memberId);

      if (!member) return;

      const groups =
        memberGroups[memberId] || [];

      el('memberProfile').innerHTML = `

        <div class="panel">

          <div class="table-head">

            <h3>
              Member Profile:
              ${escapeHTML(member.full_name)}
            </h3>

            <span class="pill">
              ${escapeHTML(
                (member.status || '').replaceAll('_', ' ')
              )}
            </span>

          </div>

          <div class="grid-two">

            <div>
              <div class="label">Member Number</div>
              <b>${escapeHTML(member.member_number || '—')}</b>
            </div>

            <div>
              <div class="label">Phone</div>
              <b>${escapeHTML(member.phone || '—')}</b>
            </div>

            <div>
              <div class="label">Email</div>
              <b>${escapeHTML(member.email || '—')}</b>
            </div>

            <div>
              <div class="label">Location</div>
              <b>${escapeHTML(member.location || '—')}</b>
            </div>

            <div>
              <div class="label">Date of Birth</div>
              <b>${escapeHTML(member.date_of_birth || '—')}</b>
            </div>

            <div>
              <div class="label">Date Joined</div>
              <b>${escapeHTML(member.date_joined || '—')}</b>
            </div>

            <div>
              <div class="label">Chama Membership</div>
              <b>${escapeHTML(
                groups.map(g => g.name).join(', ') || 'Individual'
              )}</b>
            </div>

            <div>
              <div class="label">Membership Fee Due</div>
              <b>${money(member.membership_fee_due)}</b>
            </div>

            <div>
              <div class="label">Membership Fee Status</div>
              <b>${escapeHTML(member.membership_fee_status || 'Not recorded')}</b>
            </div>

            <div>
              <div class="label">Next of Kin</div>
              <b>${escapeHTML(member.next_of_kin_name || '—')}</b>
            </div>

            <div>
              <div class="label">Next of Kin Phone</div>
              <b>${escapeHTML(member.next_of_kin_phone || '—')}</b>
            </div>

            <div>
              <div class="label">Relationship</div>
              <b>${escapeHTML(member.next_of_kin_relationship || '—')}</b>
            </div>

          </div>

          <div class="notice">
            Employment and business details, guarantors, collateral,
            documents, loan history and savings statements will be
            added in the next development stage after database
            security and schema review.
          </div>

        </div>

      `;

      el('memberProfile').scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });

    }

    el('memberForm').onsubmit = async event => {

      event.preventDefault();

      const data = new FormData(event.target);

      const message = el('memberMessage');

      const payload = {

        member_number:
          data.get('member_number').trim() ||
          ('GORA-' + Date.now().toString().slice(-8)),

        full_name: data.get('full_name').trim(),

        phone: data.get('phone').trim(),

        email: data.get('email').trim() || null,

        location: data.get('location').trim(),

        date_of_birth:
          data.get('date_of_birth') || null,

        date_joined: data.get('date_joined'),

        status: data.get('status'),

        next_of_kin_name:
          data.get('next_of_kin_name').trim() || null,

        next_of_kin_phone:
          data.get('next_of_kin_phone').trim() || null,

        next_of_kin_relationship:
          data.get('next_of_kin_relationship').trim() || null,

        membership_fee_due:
          Number(data.get('membership_fee_due') || 0),

        membership_fee_status:
          data.get('membership_fee_status')

      };

      const chamaId = data.get('chama_id');
      const fileFields = [
        ['profile_photo', 'profile_photo'],
        ['national_id_front', 'national_id_front'],
        ['national_id_back', 'national_id_back'],
        ['proof_of_residence', 'proof_of_residence'],
        ['business_employment', 'business_employment'],
        ['other_supporting', 'other_supporting']
      ];

      const selectedFiles = fileFields
        .map(([field, type]) => ({
          file: data.get(field),
          type
        }))
        .filter(item => item.file && item.file.size > 0);

      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'application/pdf'
      ];

      for (const item of selectedFiles) {
        if (item.file.size > 5 * 1024 * 1024) {
          message.textContent = 'Each document must be 5 MB or smaller.';
          return;
        }

        if (!allowedTypes.includes(item.file.type)) {
          message.textContent = 'Only JPG, PNG and PDF files are allowed.';
          return;
        }
      }
      try {

        const inserted = await safe(
          db.from('members')
            .insert(payload)
            .select('id')
            .single()
        );

        if (chamaId) {

          await safe(
            db.from('chama_members')
              .insert({

                member_id: inserted.data.id,

                chama_id: chamaId,

                date_joined: payload.date_joined,

                status: 'active'

              })
          );

        }

       const { data: authData, error: authError } =
  await db.auth.getUser();

if (authError || !authData.user) {
  throw new Error('Please sign in again.');
}

for (const item of selectedFiles) {
  const safeName = item.file.name.replace(
    /[^a-zA-Z0-9._-]/g,
    '_'
  );

  const storagePath =
    `${inserted.data.id}/${item.type}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await db.storage
    .from('member-documents')
    .upload(storagePath, item.file, {
      contentType: item.file.type,
      upsert: false
    });

  if (uploadError) throw uploadError;

  const { error: documentError } = await db
    .from('member_documents')
    .insert({
      member_id: inserted.data.id,
      document_type: item.type,
      storage_path: storagePath,
      uploaded_by: authData.user.id
    });

  if (documentError) {
    await db.storage.from('member-documents').remove([storagePath]);
    throw documentError;
        }
    }

    message.textContent =
      'Member registered successfully';

        await window.membersPage(container);

      } catch (error) {

        message.textContent =
          'Could not save member: ' +
          (error.message || error);

      }

    };

  };

})();
