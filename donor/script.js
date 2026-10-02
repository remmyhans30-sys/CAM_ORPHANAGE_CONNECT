/*
 * Donor-facing page: browse verified orphanages and their needs, and pledge to a need.
 * Needs keep the shared `need = { title, raised, goal, percent }` shape, now loaded
 * from the server instead of ../shared/data.js.
 */

(function () {
  // Local copies talk to the server on this computer; the live site uses its own address.
  const API_BASE = (window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname) ? 'http://localhost:4000' : '') + '/api';
  const SESSION_KEY = 'cocSession';
  const MIN_PLEDGE = 500;

  const orphanageList = document.getElementById('orphanageList');
  const emptyState = document.getElementById('emptyState');
  const loadingState = document.getElementById('loadingState');
  const loadError = document.getElementById('loadError');
  const accessGate = document.getElementById('accessGate');
  const filterBar = document.getElementById('filterBar');
  const searchInput = document.getElementById('searchInput');
  const locationFilter = document.getElementById('locationFilter');
  const navUser = document.getElementById('navUser');
  const navProfile = document.getElementById('navProfile');
  const navMessages = document.getElementById('navMessages');
  const navAuth = document.getElementById('navAuth');

  const donateModalEl = document.getElementById('donateModal');
  const donateModal = new bootstrap.Modal(donateModalEl);
  const donateForm = document.getElementById('donateForm');
  const donateOrphanageName = document.getElementById('donateOrphanageName');
  const donateNeedTitle = document.getElementById('donateNeedTitle');
  const donateProgressBar = document.getElementById('donateProgressBar');
  const donateProgressLabel = document.getElementById('donateProgressLabel');
  const donateAmount = document.getElementById('donateAmount');
  const pledgeAnonymous = document.getElementById('pledgeAnonymous');
  const pledgeFields = document.getElementById('pledgeFields');
  const signInPrompt = document.getElementById('signInPrompt');
  const donateError = document.getElementById('donateError');
  const donateAlert = document.getElementById('donateAlert');
  const donateSubmit = document.getElementById('donateSubmit');

  let orphanages = [];
  let activeOrphanage = null;
  let activeNeed = null;

  function readSession() {
    const raw = window.sessionStorage.getItem(SESSION_KEY) || window.localStorage.getItem(SESSION_KEY);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function clearSession() {
    window.sessionStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(SESSION_KEY);
  }

  function donorSession() {
    const session = readSession();
    return session && session.role === 'user' && session.token ? session : null;
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value === null || value === undefined ? '' : String(value);
    return div.innerHTML;
  }

  function formatXAF(amount) {
    return Number(amount || 0).toLocaleString('en-US') + ' XAF';
  }

  function needPercent(need) {
    return Math.max(0, Math.min(100, need.percent || 0));
  }

  function initials(name) {
    const words = (name || '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  function renderNav() {
    const session = readSession();
    if (session && session.fullname) {
      navUser.textContent = 'Signed in as ' + session.fullname;
      navUser.classList.remove('d-none');
      if (session.role === 'user') {
        navProfile.classList.remove('d-none');
        navMessages.classList.remove('d-none');
        window.watchUnread({ base: API_BASE, token: session.token }, function (count) {
          document.getElementById('navMessagesDot').classList.toggle('d-none', count === 0);
        });
      }
      navAuth.textContent = 'Log out';
      navAuth.setAttribute('href', '#');
    }
  }

  navAuth.addEventListener('click', function (e) {
    if (!readSession()) return;
    e.preventDefault();
    clearSession();
    window.location.reload();
  });

  function populateLocationFilter() {
    const current = locationFilter.value;
    locationFilter.querySelectorAll('option:not([value=""])').forEach(function (opt) { opt.remove(); });
    const locations = Array.from(new Set(orphanages.map(function (o) { return o.location; }).filter(Boolean))).sort();
    locations.forEach(function (loc) {
      const opt = document.createElement('option');
      opt.value = loc;
      opt.textContent = loc;
      locationFilter.appendChild(opt);
    });
    locationFilter.value = locations.includes(current) ? current : '';
  }

  function needRowHtml(orphanage, need) {
    const pct = needPercent(need);
    const funded = need.raised >= need.goal;
    return (
      '<div class="need-row">' +
        '<div class="need-row-top">' +
          '<span class="need-title">' + escapeHtml(need.title) + '</span>' +
          '<span class="need-amounts">' + formatXAF(need.raised) + ' of ' + formatXAF(need.goal) + '</span>' +
        '</div>' +
        (need.description ? '<p class="need-description">' + escapeHtml(need.description) + '</p>' : '') +
        '<div class="progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
          '<div class="progress-bar' + (funded ? ' is-funded' : '') + '" style="width:' + pct + '%"></div>' +
        '</div>' +
        '<div class="need-row-bottom">' +
          '<span class="need-percent">' + pct + '% pledged</span>' +
          '<button type="button" class="btn btn-donor-primary btn-sm donate-btn" ' +
            'data-orphanage-id="' + orphanage.id + '" data-need-id="' + need.id + '" ' +
            (funded ? 'disabled' : '') + '>' +
            (funded ? 'Fully pledged' : 'Pledge') +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function orphanageCardHtml(orphanage) {
    const media = orphanage.photoUrl
      ? '<img src="' + escapeHtml(orphanage.photoUrl) + '" alt="' + escapeHtml(orphanage.name) + '" class="orphanage-media">'
      : '<div class="orphanage-media-placeholder" aria-hidden="true">' + escapeHtml(initials(orphanage.name)) + '</div>';

    const needsHtml = orphanage.needs.length
      ? orphanage.needs.map(function (need) { return needRowHtml(orphanage, need); }).join('')
      : '<p class="text-muted small mb-0">No open needs right now.</p>';

    return (
      '<div class="card card-orphanage">' +
        '<div class="row g-0">' +
          '<div class="col-md-3 d-none d-md-block">' + media + '</div>' +
          '<div class="col-md-9">' +
            '<div class="card-body">' +
              '<div class="orphanage-header">' +
                '<h2 class="h5 mb-1">' + escapeHtml(orphanage.name) + '</h2>' +
                '<span class="badge-verified">Verified</span>' +
              '</div>' +
              '<a class="btn btn-outline-secondary btn-sm orphanage-message-btn" href="messages.html?with=orphanage-' + orphanage.id + '">Message this orphanage</a>' +
              '<button type="button" class="btn btn-outline-secondary btn-sm orphanage-visit-btn" data-visit-orphanage="' + orphanage.id + '">Request a visit</button>' +
              '<p class="orphanage-location">' +
                escapeHtml(orphanage.location || 'Cameroon') +
                (orphanage.childrenCount ? ' · ' + escapeHtml(orphanage.childrenCount) + ' children in care' : '') +
              '</p>' +
              (orphanage.story ? '<p class="orphanage-story">' + escapeHtml(orphanage.story) + '</p>' : '') +
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

    if (loc && orphanage.location !== loc) return false;

    if (query) {
      const inName = orphanage.name.toLowerCase().includes(query);
      const inNeed = orphanage.needs.some(function (n) { return n.title.toLowerCase().includes(query); });
      if (!inName && !inNeed) return false;
    }

    return true;
  }

  function render() {
    const visible = orphanages.filter(matchesFilters);
    orphanageList.innerHTML = visible.map(orphanageCardHtml).join('');
    emptyState.textContent = orphanages.length === 0
      ? 'No verified orphanages yet. Please check back soon.'
      : 'No orphanages match your search.';
    emptyState.classList.toggle('d-none', visible.length > 0);
  }

  function findNeed(orphanageId, needId) {
    const orphanage = orphanages.find(function (o) { return o.id === orphanageId; });
    const need = orphanage && orphanage.needs.find(function (n) { return n.id === needId; });
    return need ? { orphanage: orphanage, need: need } : null;
  }

  function showNeedProgress(need) {
    const pct = needPercent(need);
    donateProgressBar.style.width = pct + '%';
    donateProgressBar.classList.toggle('is-funded', need.raised >= need.goal);
    donateProgressLabel.textContent = formatXAF(need.raised) + ' pledged of ' + formatXAF(need.goal) + ' (' + pct + '%)';
  }

  function openDonateModal(orphanageId, needId) {
    const found = findNeed(orphanageId, needId);
    if (!found) return;
    activeOrphanage = found.orphanage;
    activeNeed = found.need;

    donateOrphanageName.textContent = activeOrphanage.name;
    donateNeedTitle.textContent = activeNeed.title;
    showNeedProgress(activeNeed);

    donateForm.reset();
    document.querySelectorAll('.btn-quick-amount').forEach(function (b) { b.classList.remove('active'); });
    donateError.classList.add('d-none');
    donateAlert.classList.add('d-none');

    const signedIn = Boolean(donorSession());
    signInPrompt.classList.toggle('d-none', signedIn);
    pledgeFields.classList.toggle('d-none', !signedIn);
    donateSubmit.classList.toggle('d-none', !signedIn);
    donateSubmit.disabled = false;
    donateAmount.required = signedIn;

    donateModal.show();
  }

  async function handleDonateSubmit(e) {
    e.preventDefault();
    const session = donorSession();
    if (!session || !activeNeed) return;

    const amount = Number(donateAmount.value);
    const remaining = activeNeed.goal - activeNeed.raised;
    donateError.classList.add('d-none');

    if (!Number.isInteger(amount) || amount < MIN_PLEDGE) {
      donateError.textContent = 'Pledges start at ' + formatXAF(MIN_PLEDGE) + '.';
      donateError.classList.remove('d-none');
      return;
    }
    if (amount > remaining) {
      donateError.textContent = 'Only ' + formatXAF(remaining) + ' is still needed for this need.';
      donateError.classList.remove('d-none');
      return;
    }

    donateSubmit.disabled = true;
    try {
      let response;
      try {
        response = await fetch(API_BASE + '/pledges', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.token },
          body: JSON.stringify({ needId: activeNeed.id, amount: amount, anonymous: pledgeAnonymous.checked })
        });
      } catch (err) {
        throw new Error('Cannot reach the server. Please try again.');
      }
      const data = await response.json().catch(function () { return {}; });
      if (response.status === 401) {
        clearSession();
        throw new Error('Your session has expired. Please sign in again.');
      }
      if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');

      activeNeed.raised = data.need.raised;
      activeNeed.percent = data.need.percent;
      showNeedProgress(activeNeed);
      donateAlert.textContent = 'Thank you! Your pledge of ' + formatXAF(amount) + ' to ' + activeOrphanage.name + ' has been recorded.';
      donateAlert.classList.remove('d-none');
      pledgeFields.classList.add('d-none');
      donateSubmit.classList.add('d-none');
      render();
    } catch (err) {
      donateError.textContent = err.message;
      donateError.classList.remove('d-none');
      donateSubmit.disabled = false;
    }
  }

  // Orphanages are only shown to donors an admin has approved. Everyone else sees why.
  function showGate(code, message) {
    const content = {
      'sign-in': {
        title: 'Sign in to see orphanages',
        message: 'Orphanage profiles are shown to approved donors. Create a donor account or sign in. Once the CAM Orphanage Connect team approves your account, you can browse and give.',
        actions: [['Sign in', '../login/index.html', 'btn-donor-primary'], ['Create a donor account', '../login/register.html', 'btn-outline-secondary']]
      },
      pending: {
        title: 'Your account is waiting for approval',
        message: message,
        actions: [['Complete my profile', 'profile.html', 'btn-donor-primary']]
      },
      rejected: { title: 'Your account was not approved', message: message, actions: [['My profile', 'profile.html', 'btn-outline-secondary']] },
      flagged: { title: 'Your account is under review', message: message, actions: [['My profile', 'profile.html', 'btn-outline-secondary']] },
      'donors-only': {
        title: 'This page is for donors',
        message: message,
        actions: [['Home', '../index.html', 'btn-outline-secondary']]
      }
    };
    const view = content[code] || content['sign-in'];

    document.getElementById('gateTitle').textContent = view.title;
    document.getElementById('gateMessage').textContent = view.message;
    const actions = document.getElementById('gateActions');
    actions.innerHTML = '';
    view.actions.forEach(function (action) {
      const link = document.createElement('a');
      link.className = 'btn ' + action[2];
      link.href = action[1];
      link.textContent = action[0];
      actions.appendChild(link);
    });

    accessGate.classList.remove('d-none');
    filterBar.classList.add('d-none');
    orphanageList.classList.add('d-none');
    emptyState.classList.add('d-none');
  }

  async function loadOrphanages() {
    try {
      let response;
      const session = donorSession();
      try {
        response = await fetch(API_BASE + '/browse/orphanages', {
          headers: session ? { Authorization: 'Bearer ' + session.token } : {}
        });
      } catch (err) {
        throw new Error('Cannot reach the server. Please try again in a moment.');
      }
      if (response.status === 401 || response.status === 403) {
        const problem = await response.json().catch(function () { return {}; });
        if (response.status === 401 && readSession()) clearSession();
        showGate(problem.code, problem.error);
        loadingState.classList.add('d-none');
        return;
      }
      if (!response.ok) throw new Error('Could not load orphanages. Please try again later.');
      const data = await response.json();
      orphanages = data.orphanages;
      populateLocationFilter();
      render();
      showMyVisits();
    } catch (err) {
      loadError.textContent = err.message;
      loadError.classList.remove('d-none');
    }
    loadingState.classList.add('d-none');
  }

  // Visit requests: the person is approved by the time the orphanages are shown.
  let visitsList = null;

  function visitOptions() {
    const session = donorSession();
    return {
      apiBase: API_BASE,
      token: session.token,
      onExpired: clearSession
    };
  }

  function showMyVisits() {
    if (!donorSession() || !window.CocVisits) return;
    document.getElementById('myVisitsSection').classList.remove('d-none');
    window.CocVisits.mountMine(document.getElementById('myVisits'), visitOptions()).then(function (handle) { visitsList = handle; });
  }

  orphanageList.addEventListener('click', function (e) {
    const visitBtn = e.target.closest('.orphanage-visit-btn');
    if (visitBtn && donorSession()) {
      const home = orphanages.find(function (o) { return o.id === Number(visitBtn.dataset.visitOrphanage); });
      if (home) {
        window.CocVisits.request(Object.assign(visitOptions(), {
          orphanageId: home.id,
          orphanageName: home.name,
          onDone: function () { if (visitsList) visitsList.reload(); }
        }));
      }
      return;
    }
    const btn = e.target.closest('.donate-btn');
    if (!btn || btn.disabled) return;
    openDonateModal(Number(btn.dataset.orphanageId), Number(btn.dataset.needId));
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

  renderNav();
  loadOrphanages();
})();
