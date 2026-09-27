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

function renderOrphanage(orphanage, needs) {
  const avatar = document.getElementById('orphanage-avatar');
  if (orphanage.photoUrl) {
    avatar.classList.add('has-photo');
    avatar.innerHTML = '<img src="' + encodeURI(orphanage.photoUrl) + '" alt="">';
  } else {
    avatar.textContent = initials(orphanage.name);
  }

  document.getElementById('orphanage-name').textContent = orphanage.name || '—';
  document.getElementById('orphanage-location').textContent = orphanage.location || '—';
  document.getElementById('orphanage-story').textContent = orphanage.story || 'No story shared yet.';

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
  if (needs.length === 0) {
    needsPanel.innerHTML = '<p class="text-muted small mb-0">No open needs right now.</p>';
    return;
  }

  needsPanel.innerHTML = needs.map(function (n) {
    const percent = n.goal > 0 ? Math.min(100, Math.round((n.raised / n.goal) * 100)) : 0;
    const donateUrl = 'dashboard.html?orphanageId=' + encodeURIComponent(orphanage.id) +
      '&need=' + encodeURIComponent(n.title) + '&openDonation=1';
    return (
      '<div class="mb-3">' +
        '<div class="d-flex justify-content-between align-items-center small mb-1">' +
          '<span class="fw-semibold">' + escapeHtml(n.title) + '</span>' +
          '<span class="text-muted">' + formatFcfa(n.raised) + ' of ' + formatFcfa(n.goal) + '</span>' +
        '</div>' +
        '<div class="progress finance-progress mb-2"><div class="progress-bar" style="width: ' + percent + '%"></div></div>' +
        '<a href="' + donateUrl + '" class="btn btn-admin-outline btn-sm">Donate to this need</a>' +
      '</div>'
    );
  }).join('');

  const galleryPanel = document.getElementById('gallery-panel');
  const gallery = orphanage.gallery || [];
  galleryPanel.innerHTML = gallery.length
    ? '<div class="profile-gallery-grid">' +
        gallery.map(function (url) {
          return '<img src="' + encodeURI(url) + '" alt="" class="profile-gallery-thumb">';
        }).join('') +
      '</div>'
    : '<p class="text-muted small mb-0">No gallery photos uploaded.</p>';

  const postsPanel = document.getElementById('posts-panel');
  const posts = (orphanage.posts || []).slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  postsPanel.innerHTML = posts.length
    ? posts.map(function (post) {
        return (
          '<div class="profile-post">' +
            '<span class="profile-post-date">' + escapeHtml(post.date || '') + '</span>' +
            '<p class="small mb-1 mt-1">' + escapeHtml(post.text || '') + '</p>' +
            (post.photoUrl ? '<img src="' + encodeURI(post.photoUrl) + '" alt="" class="profile-post-photo">' : '') +
          '</div>'
        );
      }).join('')
    : '<p class="text-muted small mb-0">No updates posted yet.</p>';
}

function renderFavoriteButton(favoriteOrphanageIds) {
  const isFavorite = favoriteOrphanageIds.indexOf(Number(orphanageId)) !== -1;
  const btn = document.getElementById('favorite-toggle-btn');
  btn.innerHTML = isFavorite ? '&#9733; Remove from favorites' : '&#9734; Add to favorites';
  btn.classList.toggle('is-favorite', isFavorite);
}

const orphanageId = getOrphanageId();

if (!orphanageId) {
  document.getElementById('empty-state').classList.remove('d-none');
} else {
  Promise.all([apiRequest('/partner-auth/orphanages/' + orphanageId), apiRequest('/partner-auth/me')])
    .then(function (results) {
      document.getElementById('orphanage-content').classList.remove('d-none');
      renderOrphanage(results[0].orphanage, results[0].needs);
      renderFavoriteButton(results[1].partner.favoriteOrphanageIds || []);
    })
    .catch(function () {
      document.getElementById('empty-state').classList.remove('d-none');
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
