/*
 * Donor-facing page: browse orphanages/needs and simulate a donation.
 * Reads the shared `need = { title, raised, goal, percent }` contract from
 * ../shared/data.js and never renames or reshapes it.
 */

(function () {
  const orphanageList = document.getElementById('orphanageList');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const locationFilter = document.getElementById('locationFilter');
  const verifiedOnly = document.getElementById('verifiedOnly');

  const donateModalEl = document.getElementById('donateModal');
  const donateModal = new bootstrap.Modal(donateModalEl);
  const donateForm = document.getElementById('donateForm');
  const donateOrphanageName = document.getElementById('donateOrphanageName');
  const donateNeedTitle = document.getElementById('donateNeedTitle');
  const donateProgressBar = document.getElementById('donateProgressBar');
  const donateProgressLabel = document.getElementById('donateProgressLabel');
  const donateAmount = document.getElementById('donateAmount');
  const donateAlert = document.getElementById('donateAlert');

  let activeOrphanageId = null;
  let activeNeedIndex = null;

  function formatXAF(amount) {
    return amount.toLocaleString('en-US') + ' XAF';
  }

  function needPercent(need) {
    // Trust the shared `percent` field rather than recomputing it, so this
    // page never drifts from what other pages/teammates compute.
    return Math.max(0, Math.min(100, need.percent));
  }

  function populateLocationFilter() {
    const locations = Array.from(new Set(getOrphanages().map(function (o) { return o.location; }))).sort();
    locations.forEach(function (loc) {
      const opt = document.createElement('option');
      opt.value = loc;
      opt.textContent = loc;
      locationFilter.appendChild(opt);
    });
  }

  function needRowHtml(orphanage, need, needIndex) {
    const pct = needPercent(need);
    const funded = pct >= 100;
    return (
      '<div class="need-row">' +
        '<div class="need-row-top">' +
          '<span class="need-title">' + need.title + '</span>' +
          '<span class="need-amounts">' + formatXAF(need.raised) + ' of ' + formatXAF(need.goal) + '</span>' +
        '</div>' +
        '<div class="progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
          '<div class="progress-bar' + (funded ? ' is-funded' : '') + '" style="width:' + pct + '%"></div>' +
        '</div>' +
        '<div class="need-row-bottom">' +
          '<span class="need-percent">' + pct + '% funded</span>' +
          '<button type="button" class="btn btn-donor-primary btn-sm donate-btn" ' +
            'data-orphanage-id="' + orphanage.id + '" data-need-index="' + needIndex + '" ' +
            (funded ? 'disabled' : '') + '>' +
            (funded ? 'Fully funded' : 'Donate') +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function orphanageCardHtml(orphanage) {
    const verifiedBadge = orphanage.verified
      ? '<span class="badge-verified">Verified</span>'
      : '<span class="badge-unverified">Unverified</span>';

    const needsHtml = orphanage.needs.map(function (need, i) {
      return needRowHtml(orphanage, need, i);
    }).join('');

    return (
      '<div class="card card-orphanage">' +
        '<div class="row g-0">' +
          '<div class="col-md-3 d-none d-md-block">' +
            '<img src="' + orphanage.image + '" alt="' + orphanage.name + '" class="orphanage-media">' +
          '</div>' +
          '<div class="col-md-9">' +
            '<div class="card-body">' +
              '<div class="orphanage-header">' +
                '<h2 class="h5 mb-1">' + orphanage.name + '</h2>' +
                verifiedBadge +
              '</div>' +
              '<p class="orphanage-location">' + orphanage.location + '</p>' +
              needsHtml +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function matchesFilters(orphanage) {
    const query = searchInput.value.trim().toLowerCase();
    const loc = locationFilter.value;
    const onlyVerified = verifiedOnly.checked;

    if (onlyVerified && !orphanage.verified) return false;
    if (loc && orphanage.location !== loc) return false;

    if (query) {
      const inName = orphanage.name.toLowerCase().includes(query);
      const inNeed = orphanage.needs.some(function (n) { return n.title.toLowerCase().includes(query); });
      if (!inName && !inNeed) return false;
    }

    return true;
  }

  function render() {
    const visible = getOrphanages().filter(matchesFilters);
    orphanageList.innerHTML = visible.map(orphanageCardHtml).join('');
    emptyState.classList.toggle('d-none', visible.length > 0);
  }

  function openDonateModal(orphanageId, needIndex) {
    const orphanage = getOrphanageById(orphanageId);
    if (!orphanage) return;
    const need = orphanage.needs[needIndex];
    if (!need) return;

    activeOrphanageId = orphanageId;
    activeNeedIndex = needIndex;

    donateOrphanageName.textContent = orphanage.name;
    donateNeedTitle.textContent = need.title;
    const pct = needPercent(need);
    donateProgressBar.style.width = pct + '%';
    donateProgressBar.classList.toggle('is-funded', pct >= 100);
    donateProgressLabel.textContent = formatXAF(need.raised) + ' raised of ' + formatXAF(need.goal) + ' (' + pct + '%)';

    donateForm.reset();
    donateAlert.classList.add('d-none');
    donateModal.show();
  }

  function handleDonateSubmit(e) {
    e.preventDefault();
    if (activeOrphanageId === null || activeNeedIndex === null) return;

    const orphanage = getOrphanageById(activeOrphanageId);
    const need = orphanage.needs[activeNeedIndex];
    const amount = Number(donateAmount.value);

    if (!amount || amount < 500) return;

    // Simulate the donation: update this need in place, keeping the
    // { title, raised, goal, percent } shape intact.
    need.raised = Math.min(need.goal, need.raised + amount);
    need.percent = Math.round((need.raised / need.goal) * 100);

    donateAlert.classList.remove('d-none');
    render();

    setTimeout(function () {
      donateModal.hide();
    }, 1100);
  }

  orphanageList.addEventListener('click', function (e) {
    const btn = e.target.closest('.donate-btn');
    if (!btn || btn.disabled) return;
    openDonateModal(btn.dataset.orphanageId, Number(btn.dataset.needIndex));
  });

  document.querySelectorAll('.btn-quick-amount').forEach(function (btn) {
    btn.addEventListener('click', function () {
      donateAmount.value = btn.dataset.amount;
      document.querySelectorAll('.btn-quick-amount').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
    });
  });

  donateForm.addEventListener('submit', handleDonateSubmit);
  searchInput.addEventListener('input', render);
  locationFilter.addEventListener('change', render);
  verifiedOnly.addEventListener('change', render);

  populateLocationFilter();
  render();
})();
