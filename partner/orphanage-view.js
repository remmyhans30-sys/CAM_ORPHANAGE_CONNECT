if (!localStorage.getItem('partnerToken')) { window.location.href = 'index.html'; }

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function initials(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function formatFcfa(amount) {
  const currency = JSON.parse(localStorage.getItem('orgSettings') || '{}').currency || 'FCFA';
  const num = Number(amount || 0).toLocaleString('en-US');
  if (currency === 'USD') return '$' + num;
  if (currency === 'EUR') return '€' + num;
  return num + ' FCFA';
}

function getOrphanageId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

function plural(count, one, many) {
  return Number(count).toLocaleString('en-US') + ' ' + (count === 1 ? one : many);
}

function prettyDate(value, withDay) {
  const d = new Date(String(value) + 'T00:00:00');
  if (isNaN(d)) return value;
  return d.toLocaleDateString('en-GB', withDay === false ? { month: 'long', year: 'numeric' } : { day: 'numeric', month: 'long', year: 'numeric' });
}

// The same profile donors see (GET /partner-auth/orphanages/:id): the home's story and facts, what the
// CAM Orphanage Connect team checked, the support it has had so far, and its needs. Its phone, email
// and payment account are not shown: partners reach a home through messages and visit requests.
function renderProfile(profile) {
  const orphanage = profile.orphanage;
  const needs = profile.needs;
  document.title = orphanage.name + ' - CAM Orphanage Connect';

  // A photo that cannot be shown falls back to the initials, a cover photo to nothing.
  const avatar = document.getElementById('orphanage-avatar');
  avatar.textContent = initials(orphanage.name);
  if (orphanage.photoUrl) {
    const img = document.createElement('img');
    img.alt = '';
    img.addEventListener('error', function () {
      avatar.classList.remove('has-photo');
      avatar.textContent = initials(orphanage.name);
    });
    img.src = orphanage.photoUrl;
    avatar.textContent = '';
    avatar.classList.add('has-photo');
    avatar.appendChild(img);
  }
  const cover = document.getElementById('orphanage-cover');
  if (orphanage.coverPhotoUrl) {
    const img = document.createElement('img');
    img.alt = '';
    img.addEventListener('error', function () { cover.classList.add('d-none'); });
    img.src = orphanage.coverPhotoUrl;
    cover.appendChild(img);
    cover.classList.remove('d-none');
  }

  document.getElementById('orphanage-name').textContent = orphanage.name || '—';
  document.getElementById('orphanage-location').textContent = (orphanage.location || 'Cameroon') +
    (orphanage.foundedYear ? ' · Caring for children since ' + orphanage.foundedYear : '');

  const story = document.getElementById('orphanage-story');
  const paragraphs = String(orphanage.story || '').split(/\n{2,}/).map(function (p) { return p.trim(); }).filter(Boolean);
  story.innerHTML = paragraphs.length ? '' : '<p class="text-muted mb-0">This home has not written its story yet.</p>';
  paragraphs.forEach(function (text) {
    const p = document.createElement('p');
    p.textContent = text;
    story.appendChild(p);
  });
  const language = document.getElementById('orphanage-story-language');
  language.textContent = orphanage.storyLanguage === 'fr' ? 'Written by the home in French.' : '';
  language.classList.toggle('d-none', orphanage.storyLanguage !== 'fr');

  const facts = [
    ['Verified', 'By the CAM Orphanage Connect team' + (orphanage.verifiedDate ? ' on ' + prettyDate(orphanage.verifiedDate) : '')],
    ['Registration number', orphanage.registrationNumber],
    ['Contact person', orphanage.contactName],
    ['Payment account', orphanage.paymentAccountChecked ? 'Confirmed by our team as the home\'s own account, not a personal one' : null],
    ['On this site since', orphanage.joinedDate ? prettyDate(orphanage.joinedDate, false) : null],
  ];
  document.getElementById('trust-facts').innerHTML = facts
    .filter(function (fact) { return fact[1]; })
    .map(function (fact) { return '<dt>' + escapeHtml(fact[0]) + '</dt><dd>' + escapeHtml(String(fact[1])) + '</dd>'; })
    .join('');

  const record = profile.record;
  const lines = [];
  if (profile.metNeeds.length) lines.push(plural(profile.metNeeds.length, 'need fully pledged', 'needs fully pledged'));
  if (record.itemGifts) lines.push(plural(record.itemGifts, 'gift of items', 'gifts of items'));
  lines.push(orphanage.updatesCount ? plural(orphanage.updatesCount, 'story or update shared', 'stories and updates shared') : 'No stories or updates shared yet');
  document.getElementById('record-panel').innerHTML =
    (record.supporters
      ? '<p class="home-record-total">' + escapeHtml(formatFcfa(record.totalPledged)) + '</p>' +
        '<p class="small text-muted">pledged or given so far by ' + escapeHtml(plural(record.supporters, 'supporter', 'supporters')) + '</p>'
      : '<p class="mb-3">No pledges yet.</p>') +
    '<ul class="home-record-list">' + lines.map(function (line) { return '<li>' + escapeHtml(line) + '</li>'; }).join('') + '</ul>';

  document.getElementById('met-needs-block').classList.toggle('d-none', profile.metNeeds.length === 0);
  document.getElementById('met-needs-list').innerHTML = profile.metNeeds.map(function (n) {
    return '<li><span>' + escapeHtml(n.title) + '</span><span class="home-met-amount">' + escapeHtml(formatFcfa(n.goal)) + '</span></li>';
  }).join('');

  const stats = [
    { label: 'Children', value: orphanage.childrenCount || 0 },
    { label: 'Capacity', value: orphanage.capacity || '—' },
    { label: 'Founded', value: orphanage.foundedYear || '—' },
    { label: 'Open needs', value: needs.length },
  ];

  document.getElementById('orphanage-stats').innerHTML = stats.map(function (stat) {
    return (
      '<div class="col-6 col-md-3">' +
        '<div class="stat-tile">' +
          '<strong>' + escapeHtml(String(stat.value)) + '</strong>' +
          '<span>' + escapeHtml(stat.label) + '</span>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  const needsPanel = document.getElementById('needs-panel');
  needsPanel.innerHTML = needs.length === 0 ? '<p class="text-muted small mb-0">No open needs right now.</p>' : needs.map(function (n) {
    const percent = n.goal > 0 ? Math.min(100, Math.round((n.raised / n.goal) * 100)) : 0;
    const donateUrl = 'dashboard.html?orphanageId=' + encodeURIComponent(orphanage.id) +
      '&need=' + encodeURIComponent(n.title) + '&openDonation=1';
    return (
      '<div class="mb-3">' +
        '<div class="d-flex flex-wrap justify-content-between align-items-center gap-1 small mb-1">' +
          '<span class="fw-semibold">' + escapeHtml(n.title) + '</span>' +
          '<span class="text-muted">' + formatFcfa(n.raised) + ' of ' + formatFcfa(n.goal) + '</span>' +
        '</div>' +
        (n.description ? '<p class="small text-muted mb-1">' + escapeHtml(n.description) + '</p>' : '') +
        '<div class="progress finance-progress mb-2"><div class="progress-bar" style="width: ' + percent + '%"></div></div>' +
        '<a href="' + donateUrl + '" class="btn btn-admin-outline btn-sm">Donate to this need</a>' +
      '</div>'
    );
  }).join('');

  const gallery = orphanage.gallery || [];
  document.getElementById('gallery-card').classList.toggle('d-none', gallery.length === 0);
  document.getElementById('gallery-panel').innerHTML = gallery.length
    ? '<div class="profile-gallery-grid">' +
        gallery.map(function (url) {
          return '<img src="' + encodeURI(url) + '" alt="" class="profile-gallery-thumb">';
        }).join('') +
      '</div>'
    : '';

  window.CocUpdates.mount(document.getElementById('posts-panel'), {
    apiBase: API_BASE,
    token: localStorage.getItem('partnerToken'),
    endpoint: '/partner-auth/orphanages/' + encodeURIComponent(orphanage.id) + '/updates',
    onExpired: function () { localStorage.removeItem('partnerToken'); window.location.href = 'index.html'; }
  });
}

function renderFavoriteButton(favoriteOrphanageIds) {
  const isFavorite = favoriteOrphanageIds.indexOf(Number(orphanageId)) !== -1;
  const btn = document.getElementById('favorite-toggle-btn');
  btn.innerHTML = isFavorite ? '<i class="bi bi-star-fill"></i> Remove from favorites' : '<i class="bi bi-star"></i> Add to favorites';
  btn.classList.toggle('is-favorite', isFavorite);
}

const orphanageId = getOrphanageId();

if (!orphanageId) {
  document.getElementById('empty-state').classList.remove('d-none');
} else {
  Promise.all([apiRequest('/partner-auth/orphanages/' + encodeURIComponent(orphanageId)), apiRequest('/partner-auth/me')])
    .then(function (results) {
      document.getElementById('orphanage-content').classList.remove('d-none');
      renderProfile(results[0]);
      renderFavoriteButton(results[1].partner.favoriteOrphanageIds || []);
      document.getElementById('message-orphanage-link').href = 'messages.html?with=orphanage-' + encodeURIComponent(orphanageId);
      const visitName = results[0].orphanage.name;
      document.getElementById('request-visit-btn').addEventListener('click', function () {
        window.CocVisits.request({
          apiBase: API_BASE,
          token: localStorage.getItem('partnerToken'),
          orphanageId: Number(orphanageId),
          orphanageName: visitName,
          onExpired: function () { localStorage.removeItem('partnerToken'); window.location.href = 'index.html'; }
        });
      });
    })
    .catch(function (err) {
      const emptyState = document.getElementById('empty-state');
      emptyState.classList.remove('d-none');
      if (err.status === 403) {
        emptyState.innerHTML = '<strong>Orphanage profiles are locked for now.</strong><br>' +
          'They open once the CAM Orphanage Connect team has verified your organization. ' +
          '<a href="profile.html">Complete your profile and submit it for verification</a>.';
      }
    });

  document.getElementById('favorite-toggle-btn').addEventListener('click', function () {
    apiRequest('/partner-auth/orphanages/' + orphanageId + '/favorite', { method: 'POST' })
      .then(function (data) {
        renderFavoriteButton(data.partner.favoriteOrphanageIds || []);
      })
      .catch(function (err) {
        alert('Could not update favorite: ' + err.message);
      });
  });
}
