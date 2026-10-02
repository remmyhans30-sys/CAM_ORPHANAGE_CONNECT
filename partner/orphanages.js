if (!localStorage.getItem('partnerToken')) { window.location.href = 'index.html'; }

const COVER_CLASSES = ['p1', 'p2', 'p3', 'p4', 'p5'];
const CHECK_SVG = '<svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4.5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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

let orphanagesCache = [];
let favoritesCache = [];

function renderGrid(list) {
  const grid = document.getElementById('orphanages-grid');
  const emptyState = document.getElementById('empty-state');

  if (list.length === 0) {
    grid.innerHTML = '';
    emptyState.classList.remove('d-none');
    return;
  }
  emptyState.classList.add('d-none');

  grid.innerHTML = list.map(function (o, index) {
    const coverClass = COVER_CLASSES[index % COVER_CLASSES.length];
    const hasCoverPhoto = Boolean(o.coverPhotoUrl);
    const hasAvatarPhoto = Boolean(o.photoUrl);
    const isFavorite = favoritesCache.indexOf(o.id) !== -1;

    const coverAttrs = hasCoverPhoto ? ' style="background-image: url(\'' + encodeURI(o.coverPhotoUrl) + '\')"' : '';
    const avatarInner = hasAvatarPhoto ? '<img src="' + encodeURI(o.photoUrl) + '" alt="">' : initials(o.name);

    return (
      '<div class="col-md-6 col-lg-4">' +
        '<a href="orphanage-view.html?id=' + encodeURIComponent(o.id) + '" class="text-decoration-none">' +
          '<div class="profile-card">' +
            '<div class="profile-cover' + (hasCoverPhoto ? ' has-photo' : ' ' + coverClass) + '"' + coverAttrs + '>' +
              '<span class="profile-status-chip status-verified">Verified</span>' +
              '<button type="button" class="fav-star-btn' + (isFavorite ? ' is-favorite' : '') + '" data-orphanage-id="' + o.id + '" title="' + (isFavorite ? 'Remove from favorites' : 'Add to favorites') + '">' + (isFavorite ? '<i class="bi bi-star-fill"></i>' : '<i class="bi bi-star"></i>') + '</button>' +
            '</div>' +
            '<div class="profile-body">' +
              '<div class="avatar-wrap">' +
                '<div class="avatar' + (hasAvatarPhoto ? ' has-photo' : '') + '">' + avatarInner + '</div>' +
              '</div>' +
              '<h3 class="profile-name">' +
                '<span>' + escapeHtml(o.name) + '</span>' +
                '<span class="verify-check-inline" title="Verified">' + CHECK_SVG + '</span>' +
              '</h3>' +
              '<p class="profile-location">' + escapeHtml(o.location || '&mdash;') + '</p>' +
              '<div class="profile-stats">' +
                '<div class="stat"><strong>' + (o.childrenCount || 0) + '</strong><span>Children</span></div>' +
                '<div class="stat"><strong>' + (o.needsCount || 0) + '</strong><span>Active needs</span></div>' +
                '<div class="stat"><strong>' + formatFcfa(o.totalRaised) + '</strong><span>Raised</span></div>' +
                '<div class="stat"><strong>' + (o.followersCount || 0) + '</strong><span>Followers</span></div>' +
              '</div>' +
              '<div class="profile-actions"><span class="btn btn-admin-outline btn-sm">View profile</span></div>' +
            '</div>' +
          '</div>' +
        '</a>' +
      '</div>'
    );
  }).join('');
}

function populateLocationFilter() {
  const select = document.getElementById('location-filter');
  const locations = Array.from(new Set(orphanagesCache.map(function (o) { return o.location; }).filter(Boolean))).sort();
  select.innerHTML = '<option value="">All locations</option>' + locations.map(function (loc) {
    return '<option value="' + escapeHtml(loc) + '">' + escapeHtml(loc) + '</option>';
  }).join('');
}

function sortList(list, sortBy) {
  const sorted = list.slice();
  if (sortBy === 'children-desc') sorted.sort(function (a, b) { return (b.childrenCount || 0) - (a.childrenCount || 0); });
  else if (sortBy === 'needs-desc') sorted.sort(function (a, b) { return (b.needsCount || 0) - (a.needsCount || 0); });
  else if (sortBy === 'raised-desc') sorted.sort(function (a, b) { return (b.totalRaised || 0) - (a.totalRaised || 0); });
  else sorted.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
  return sorted;
}

function applyFilters() {
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  const location = document.getElementById('location-filter').value;
  const sortBy = document.getElementById('sort-select').value;

  let filtered = orphanagesCache.filter(function (o) {
    const matchesSearch = !query || (o.name || '').toLowerCase().indexOf(query) !== -1 || (o.location || '').toLowerCase().indexOf(query) !== -1;
    const matchesLocation = !location || o.location === location;
    return matchesSearch && matchesLocation;
  });

  renderGrid(sortList(filtered, sortBy));
}

Promise.all([apiRequest('/partner-auth/orphanages'), apiRequest('/partner-auth/me')]).then(function (results) {
  orphanagesCache = results[0].orphanages;
  favoritesCache = results[1].partner.favoriteOrphanageIds || [];
  populateLocationFilter();
  applyFilters();

  // Visit requests this partner has made (verified partners only reach this point).
  document.getElementById('my-visits-card').classList.remove('d-none');
  window.CocVisits.mountMine(document.getElementById('my-visits'), {
    apiBase: API_BASE,
    token: localStorage.getItem('partnerToken'),
    onExpired: function () { localStorage.removeItem('partnerToken'); window.location.href = 'index.html'; }
  });
}).catch(function (err) {
  const emptyState = document.getElementById('empty-state');
  emptyState.classList.remove('d-none');
  if (err.status === 403) {
    // Not verified yet: explain, and point to the profile where they can finish and submit.
    emptyState.innerHTML = '<strong>Browsing orphanages is locked for now.</strong><br>' +
      'It opens once the CAM Orphanage Connect team has verified your organization. ' +
      '<a href="profile.html">Complete your profile and submit it for verification</a>.';
    ['search-input', 'location-filter'].forEach(function (id) {
      const control = document.getElementById(id);
      if (control) control.disabled = true;
    });
    return;
  }
  emptyState.textContent = 'Could not load orphanages: ' + err.message + '. Is the backend running?';
});

document.getElementById('search-input').addEventListener('input', applyFilters);
document.getElementById('location-filter').addEventListener('change', applyFilters);
document.getElementById('sort-select').addEventListener('change', applyFilters);

document.getElementById('orphanages-grid').addEventListener('click', function (e) {
  const btn = e.target.closest('.fav-star-btn');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();

  const id = Number(btn.dataset.orphanageId);
  apiRequest('/partner-auth/orphanages/' + id + '/favorite', { method: 'POST' })
    .then(function (data) {
      favoritesCache = data.partner.favoriteOrphanageIds || [];
      applyFilters();
    })
    .catch(function (err) {
      alert('Could not update favorite: ' + err.message);
    });
});
