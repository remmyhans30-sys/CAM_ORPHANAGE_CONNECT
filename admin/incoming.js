/*
 * Incoming Donations & Visit Requests (admin).
 * Donations are a read-only historical log (../shared/data.js DONATIONS).
 * Visit requests are actionable: admin can Approve/Decline/Delete, and
 * that status change persists via localStorage.
 */

(function () {
  const VISITS_STORAGE_KEY = 'camoc_admin_visits_v1';

  function formatXAF(amount) {
    return amount.toLocaleString('en-US') + ' XAF';
  }

  function orphanageName(id) {
    const o = getOrphanageById(id);
    return o ? o.name : 'Unknown orphanage';
  }

  function formatDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  /* ---------- Donations ---------- */

  const donationTiles = document.getElementById('donationTiles');
  const donationsBody = document.getElementById('donationsBody');
  const donationsEmpty = document.getElementById('donationsEmpty');
  const donationSearch = document.getElementById('donationSearch');
  const donationOrphanageFilter = document.getElementById('donationOrphanageFilter');

  function populateDonationOrphanageFilter() {
    getOrphanages().forEach(function (o) {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.name;
      donationOrphanageFilter.appendChild(opt);
    });
  }

  function donationStatusClass(status) {
    return status === 'Completed' ? 'status-completed' : 'status-pending';
  }

  function renderDonationTiles() {
    const donations = getDonations();
    const completed = donations.filter(function (d) { return d.status === 'Completed'; });
    const totalReceived = completed.reduce(function (sum, d) { return sum + d.amount; }, 0);
    const pendingCount = donations.filter(function (d) { return d.status === 'Pending'; }).length;

    const tiles = [
      { label: 'Total received', value: formatXAF(totalReceived), accent: 'coral' },
      { label: 'Donations logged', value: String(donations.length), accent: 'gold' },
      { label: 'Pending confirmation', value: String(pendingCount), accent: 'teal' }
    ];

    donationTiles.innerHTML = tiles.map(function (t) {
      return (
        '<div class="col-6 col-lg-4">' +
          '<div class="stat-tile accent-' + t.accent + '">' +
            '<p class="stat-label">' + t.label + '</p>' +
            '<p class="stat-value">' + t.value + '</p>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  function matchesDonationFilters(d) {
    const query = donationSearch.value.trim().toLowerCase();
    if (donationOrphanageFilter.value && d.orphanageId !== donationOrphanageFilter.value) return false;
    if (query) {
      const inDonor = d.donorName.toLowerCase().includes(query);
      const inNeed = d.needTitle.toLowerCase().includes(query);
      if (!inDonor && !inNeed) return false;
    }
    return true;
  }

  function donationRowHtml(d) {
    return (
      '<tr>' +
        '<td class="row-name">' + d.donorName + '</td>' +
        '<td>' + orphanageName(d.orphanageId) + '</td>' +
        '<td>' + d.needTitle + '</td>' +
        '<td>' + formatXAF(d.amount) + '</td>' +
        '<td>' + formatDate(d.date) + '</td>' +
        '<td><span class="badge-status ' + donationStatusClass(d.status) + '">' + d.status + '</span></td>' +
      '</tr>'
    );
  }

  function renderDonations() {
    const visible = getDonations().filter(matchesDonationFilters);
    donationsBody.innerHTML = visible.map(donationRowHtml).join('');
    donationsEmpty.classList.toggle('d-none', visible.length > 0);
  }

  donationSearch.addEventListener('input', renderDonations);
  donationOrphanageFilter.addEventListener('change', renderDonations);

  /* ---------- Visit requests ---------- */

  const visitsBody = document.getElementById('visitsBody');
  const visitsEmpty = document.getElementById('visitsEmpty');
  const visitStatusFilter = document.getElementById('visitStatusFilter');

  let visits = [];

  function loadVisits() {
    const raw = localStorage.getItem(VISITS_STORAGE_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        // fall through to reseed on corrupt data
      }
    }
    const seed = getVisitRequests().map(function (v) { return Object.assign({}, v); });
    localStorage.setItem(VISITS_STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }

  function saveVisits() {
    localStorage.setItem(VISITS_STORAGE_KEY, JSON.stringify(visits));
  }

  function visitStatusClass(status) {
    if (status === 'Approved') return 'status-approved';
    if (status === 'Declined') return 'status-declined';
    return 'status-pending';
  }

  function matchesVisitFilter(v) {
    return !visitStatusFilter.value || v.status === visitStatusFilter.value;
  }

  function visitRowHtml(v) {
    const isPending = v.status === 'Pending';
    return (
      '<tr>' +
        '<td>' +
          '<div class="row-name">' + v.requesterName + '</div>' +
          '<div class="row-sub">' + v.email + '</div>' +
        '</td>' +
        '<td>' + orphanageName(v.orphanageId) + '</td>' +
        '<td>' + formatDate(v.requestedDate) + '</td>' +
        '<td>' + (v.message || '<span class="row-sub">—</span>') + '</td>' +
        '<td><span class="badge-status ' + visitStatusClass(v.status) + '">' + v.status + '</span></td>' +
        '<td>' +
          (isPending
            ? '<button type="button" class="btn-row-action btn-row-approve approve-btn" data-id="' + v.id + '">Approve</button>' +
              '<button type="button" class="btn-row-action btn-row-decline decline-btn" data-id="' + v.id + '">Decline</button>'
            : '<button type="button" class="btn-row-action btn-row-delete delete-btn" data-id="' + v.id + '">Delete</button>') +
        '</td>' +
      '</tr>'
    );
  }

  function renderVisits() {
    const visible = visits.filter(matchesVisitFilter);
    visitsBody.innerHTML = visible.map(visitRowHtml).join('');
    visitsEmpty.classList.toggle('d-none', visible.length > 0);
  }

  function setVisitStatus(id, status) {
    const visit = visits.find(function (v) { return v.id === id; });
    if (!visit) return;
    visit.status = status;
    saveVisits();
    renderVisits();
  }

  function deleteVisit(id) {
    const visit = visits.find(function (v) { return v.id === id; });
    if (!visit) return;
    if (!window.confirm('Delete the visit request from ' + visit.requesterName + '?')) return;
    visits = visits.filter(function (v) { return v.id !== id; });
    saveVisits();
    renderVisits();
  }

  visitsBody.addEventListener('click', function (e) {
    const approveBtn = e.target.closest('.approve-btn');
    if (approveBtn) { setVisitStatus(approveBtn.dataset.id, 'Approved'); return; }

    const declineBtn = e.target.closest('.decline-btn');
    if (declineBtn) { setVisitStatus(declineBtn.dataset.id, 'Declined'); return; }

    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn) { deleteVisit(deleteBtn.dataset.id); }
  });

  visitStatusFilter.addEventListener('change', renderVisits);

  populateDonationOrphanageFilter();
  renderDonationTiles();
  renderDonations();

  visits = loadVisits();
  renderVisits();
})();
