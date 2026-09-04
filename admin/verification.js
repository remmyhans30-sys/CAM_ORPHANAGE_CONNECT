const COVER_CLASSES = ['p1', 'p2', 'p3', 'p4', 'p5'];
const CHECK_SVG = '<svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4.5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function loadOrphanages() {
  return JSON.parse(localStorage.getItem('orphanages') || '[]');
}

function saveOrphanages(orphanages) {
  localStorage.setItem('orphanages', JSON.stringify(orphanages));
}

function loadNeeds() {
  return JSON.parse(localStorage.getItem('needs') || '[]');
}

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
  return Number(amount || 0).toLocaleString('en-US') + ' FCFA';
}

function statusLabel(status) {
  if (status === 'needs-info') return 'Needs info';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function render() {
  const orphanages = loadOrphanages();
  const needs = loadNeeds();
  const grid = document.getElementById('profile-grid');
  const emptyState = document.getElementById('empty-state');

  grid.innerHTML = '';

  if (orphanages.length === 0) {
    grid.classList.add('d-none');
    emptyState.classList.remove('d-none');
    return;
  }

  grid.classList.remove('d-none');
  emptyState.classList.add('d-none');

  orphanages.forEach(function (orphanage, index) {
    const orphanageNeeds = needs.filter(function (n) { return String(n.orphanageId) === String(orphanage.id); });
    const raised = orphanageNeeds.reduce(function (sum, n) { return sum + Number(n.raised || 0); }, 0);
    const coverClass = COVER_CLASSES[index % COVER_CLASSES.length];
    const hasCoverPhoto = Boolean(orphanage.coverPhotoUrl);
    const hasAvatarPhoto = Boolean(orphanage.photoUrl);
    const isVerified = orphanage.status === 'verified';
    const isActionable = orphanage.status === 'pending' || orphanage.status === 'needs-info';
    const docCount = (orphanage.documents || []).length;
    const hasDocs = docCount > 0;

    const col = document.createElement('div');
    col.className = 'col-md-6 col-lg-4';
    col.dataset.id = orphanage.id;

    const docsLine = hasDocs
      ? '<p class="profile-docs">' + docCount + ' document' + (docCount === 1 ? '' : 's') + ' uploaded</p>'
      : '<p class="profile-docs profile-docs-missing">No verification documents uploaded</p>';

    const actions = isActionable
      ? '<button class="btn btn-admin-primary btn-sm review-btn">Review &amp; decide</button>'
      : '<button class="btn btn-admin-outline btn-sm review-btn">View full profile</button>';

    const coverAttrs = hasCoverPhoto
      ? ' style="background-image: url(\'' + encodeURI(orphanage.coverPhotoUrl) + '\')"'
      : '';

    const avatarInner = hasAvatarPhoto
      ? '<img src="' + encodeURI(orphanage.photoUrl) + '" alt="">'
      : initials(orphanage.name);

    col.innerHTML =
      '<div class="profile-card">' +
        '<div class="profile-cover' + (hasCoverPhoto ? ' has-photo' : ' ' + coverClass) + '"' + coverAttrs + '>' +
          '<span class="profile-status-chip status-' + orphanage.status + '">' + statusLabel(orphanage.status) + '</span>' +
        '</div>' +
        '<div class="profile-body">' +
          '<div class="avatar-wrap">' +
            '<div class="avatar' + (hasAvatarPhoto ? ' has-photo' : '') + '">' + avatarInner + '</div>' +
            (isVerified ? '<span class="verify-badge" title="Verified">' + CHECK_SVG + '</span>' : '') +
          '</div>' +
          '<h3 class="profile-name">' +
            '<span>' + escapeHtml(orphanage.name) + '</span>' +
            (isVerified ? '<span class="verify-check-inline" title="Verified">' + CHECK_SVG + '</span>' : '') +
          '</h3>' +
          '<p class="profile-location">' + escapeHtml(orphanage.location) + '</p>' +
          (orphanage.flagged ? '<p class="profile-flag-badge" title="' + escapeHtml(orphanage.flagReason || '') + '">&#9873; Flagged for review</p>' : '') +
          (orphanage.status === 'needs-info' && orphanage.infoRequestMessage ? '<p class="profile-info-badge" title="' + escapeHtml(orphanage.infoRequestMessage) + '">Awaiting requested info</p>' : '') +
          (orphanage.status === 'rejected' && orphanage.rejectionReason ? '<p class="profile-flag-badge" title="' + escapeHtml(orphanage.rejectionReason) + '">Rejected: ' + escapeHtml(orphanage.rejectionReason) + '</p>' : '') +
          '<div class="profile-stats">' +
            '<div class="stat"><strong>' + (orphanage.childrenCount || 0) + '</strong><span>Children</span></div>' +
            '<div class="stat"><strong>' + orphanageNeeds.length + '</strong><span>Active needs</span></div>' +
            '<div class="stat"><strong>' + formatFcfa(raised) + '</strong><span>Raised</span></div>' +
            '<div class="stat"><strong>' + (orphanage.followersCount || 0) + '</strong><span>Supporters</span></div>' +
          '</div>' +
          docsLine +
          '<div class="profile-actions">' + actions + '</div>' +
        '</div>' +
      '</div>';

    grid.appendChild(col);
  });
}

function seedSampleData() {
  const sampleOrphanages = [
    {
      id: 1,
      name: "Hope Children's Home",
      location: 'Buea, Southwest Region',
      registrationNumber: 'MINAS/2022/00123',
      story: 'A home for children in Buea providing shelter, education, and care since 2012.',
      status: 'verified',
      childrenCount: 32,
      followersCount: 128,
      foundedYear: 2012,
      capacity: 40,
      contactName: 'Grace Ebong',
      contactPhone: '+237 677 123 456',
      contactEmail: 'contact@hopechildrenshome.org',
      documents: ['registration-certificate.pdf', 'director-id.pdf'],
      photoUrl: 'https://picsum.photos/seed/hope-avatar/200/200',
      coverPhotoUrl: 'https://picsum.photos/seed/hope-cover/600/200',
      gallery: [
        'https://picsum.photos/seed/hope-gallery-1/300/300',
        'https://picsum.photos/seed/hope-gallery-2/300/300',
        'https://picsum.photos/seed/hope-gallery-3/300/300',
        'https://picsum.photos/seed/hope-gallery-4/300/300',
      ],
      posts: [
        { date: '2026-08-20', text: 'Thank you to everyone who donated toward our new dormitory beds — installation starts next week!', photoUrl: 'https://picsum.photos/seed/hope-post-1/400/250' },
        { date: '2026-07-05', text: 'Our children celebrated the end of the school term with a small graduation ceremony.' },
      ],
    },
    {
      id: 2,
      name: "Foyer de l'Espérance",
      location: 'Yaoundé, Centre Region',
      registrationNumber: 'MINAS/2023/00456',
      story: "Un foyer pour enfants à Yaoundé offrant un abri sûr et un accompagnement scolaire.",
      status: 'pending',
      childrenCount: 18,
      followersCount: 9,
      foundedYear: 2019,
      capacity: 25,
      contactName: 'Jean-Paul Mbarga',
      contactPhone: '+237 699 234 567',
      contactEmail: 'contact@foyerdelesperance.org',
      documents: [],
    },
    {
      id: 3,
      name: 'Grace Orphanage',
      location: 'Bamenda, Northwest Region',
      registrationNumber: 'MINAS/2021/00789',
      story: 'Serving vulnerable children in Bamenda with housing, meals, and schooling support.',
      status: 'verified',
      childrenCount: 27,
      followersCount: 76,
      foundedYear: 2015,
      capacity: 35,
      contactName: 'Comfort Ngwa',
      contactPhone: '+237 675 345 678',
      contactEmail: 'contact@graceorphanage.org',
      documents: ['registration-certificate.pdf'],
      photoUrl: 'https://picsum.photos/seed/grace-avatar/200/200',
    },
    {
      id: 4,
      name: 'Orphelinat Bethel',
      location: 'Douala, Littoral Region',
      registrationNumber: 'MINAS/2020/00234',
      story: "Un orphelinat à Douala qui accueille des enfants depuis 2008.",
      status: 'rejected',
      childrenCount: 15,
      followersCount: 22,
      foundedYear: 2008,
      capacity: 20,
      contactName: 'Marie Fotso',
      contactPhone: '+237 655 456 789',
      contactEmail: 'contact@orphelinatbethel.org',
      documents: ['registration-certificate.pdf'],
    },
    {
      id: 5,
      name: 'Little Angels Home',
      location: 'Limbe, Southwest Region',
      registrationNumber: 'MINAS/2024/00567',
      story: 'A newly registered home in Limbe caring for orphaned and abandoned children.',
      status: 'pending',
      childrenCount: 12,
      followersCount: 3,
      foundedYear: 2023,
      capacity: 20,
      contactName: 'Peter Ekema',
      contactPhone: '+237 680 567 890',
      contactEmail: 'contact@littleangelshome.org',
      documents: ['registration-certificate.pdf', 'proof-of-address.pdf'],
      photoUrl: 'https://picsum.photos/seed/angels-avatar/200/200',
      coverPhotoUrl: 'https://picsum.photos/seed/angels-cover/600/200',
    },
  ];

  const sampleNeeds = [
    { title: 'New dormitory beds', raised: 320000, goal: 500000, percent: 64, orphanageId: 1, date: '2026-08-10' },
    { title: 'School fees for 10 children', raised: 150000, goal: 400000, percent: 38, orphanageId: 1, date: '2026-06-01' },
    { title: 'Fournitures scolaires', raised: 60000, goal: 200000, percent: 30, orphanageId: 2, date: '2026-08-25' },
    { title: 'Kitchen renovation', raised: 480000, goal: 480000, percent: 100, orphanageId: 3, date: '2026-05-14' },
    { title: 'Water borehole', raised: 90000, goal: 600000, percent: 15, orphanageId: 5, date: '2026-08-30' },
  ];

  localStorage.setItem('orphanages', JSON.stringify(sampleOrphanages));
  localStorage.setItem('needs', JSON.stringify(sampleNeeds));
  render();
}

function clearAllData() {
  if (!confirm('Clear all orphanages and needs data? This cannot be undone.')) return;
  localStorage.removeItem('orphanages');
  localStorage.removeItem('needs');
  render();
}

document.getElementById('seed-btn').addEventListener('click', seedSampleData);
document.getElementById('clear-btn').addEventListener('click', clearAllData);

const profileModalEl = document.getElementById('profile-modal');
const profileModal = new bootstrap.Modal(profileModalEl);
let activeOrphanageId = null;

function buildModalBody(orphanage, orphanageNeeds, raised) {
  const docs = orphanage.documents || [];
  const docsList = docs.length
    ? '<ul class="mb-0">' + docs.map(function (d) { return '<li>' + escapeHtml(d) + '</li>'; }).join('') + '</ul>'
    : '<p class="profile-docs-missing mb-0">No verification documents uploaded</p>';

  const sortedNeeds = orphanageNeeds.slice().sort(function (a, b) { return new Date(b.date || 0) - new Date(a.date || 0); });
  const needsList = sortedNeeds.length
    ? sortedNeeds.map(function (n) {
        const pct = n.goal > 0 ? Math.min(100, Math.round((n.raised / n.goal) * 100)) : 0;
        return (
          '<div class="profile-post">' +
            '<div class="d-flex justify-content-between align-items-start">' +
              '<span class="profile-post-date">' + escapeHtml(n.date || 'Date unknown') + '</span>' +
              '<span class="small text-muted">' + formatFcfa(n.raised) + ' of ' + formatFcfa(n.goal) + '</span>' +
            '</div>' +
            '<p class="small mb-1">' + escapeHtml(n.title) + '</p>' +
            '<div class="progress finance-progress"><div class="progress-bar" style="width: ' + pct + '%"></div></div>' +
          '</div>'
        );
      }).join('')
    : '<p class="text-muted mb-0">No needs posted yet.</p>';

  const gallery = orphanage.gallery || [];
  const galleryGrid = gallery.length
    ? '<div class="profile-gallery-grid">' +
        gallery.map(function (url) {
          return '<img src="' + encodeURI(url) + '" alt="" class="profile-gallery-thumb">';
        }).join('') +
      '</div>'
    : '<p class="text-muted small mb-0">No gallery photos uploaded.</p>';

  const posts = (orphanage.posts || [])
    .map(function (post, idx) { return Object.assign({}, post, { _idx: idx }); })
    .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  const postsList = posts.length
    ? posts.map(function (post) {
        return (
          '<div class="profile-post">' +
            '<div class="d-flex justify-content-between align-items-start">' +
              '<span class="profile-post-date">' + escapeHtml(post.date || '') + '</span>' +
              '<button type="button" class="btn btn-admin-danger btn-sm remove-post-btn" data-post-index="' + post._idx + '">Remove post</button>' +
            '</div>' +
            '<p class="small mb-1">' + escapeHtml(post.text || '') + '</p>' +
            (post.photoUrl ? '<img src="' + encodeURI(post.photoUrl) + '" alt="" class="profile-post-photo">' : '') +
          '</div>'
        );
      }).join('')
    : '<p class="text-muted small mb-0">No updates posted yet.</p>';

  return (
    '<div class="row g-4">' +
      '<div class="col-sm-4 text-center">' +
        '<div class="avatar-wrap" style="margin: 0 auto 0.75rem;">' +
          '<div class="avatar' + (orphanage.photoUrl ? ' has-photo' : '') + '" style="width:96px;height:96px;">' +
            (orphanage.photoUrl ? '<img src="' + encodeURI(orphanage.photoUrl) + '" alt="">' : initials(orphanage.name)) +
          '</div>' +
          (orphanage.status === 'verified' ? '<span class="verify-badge" title="Verified">' + CHECK_SVG + '</span>' : '') +
        '</div>' +
        '<span class="status-badge status-' + orphanage.status + '">' + statusLabel(orphanage.status) + '</span>' +
      '</div>' +
      (orphanage.status === 'needs-info' && orphanage.infoRequestMessage
        ? '<div class="col-12"><div class="profile-info-note">Info requested: ' + escapeHtml(orphanage.infoRequestMessage) + '</div></div>'
        : '') +
      (orphanage.status === 'rejected' && orphanage.rejectionReason
        ? '<div class="col-12"><div class="profile-info-note profile-info-note-danger">Rejected: ' + escapeHtml(orphanage.rejectionReason) + '</div></div>'
        : '') +
      '<div class="col-sm-8">' +
        '<dl class="row mb-0 small">' +
          '<dt class="col-5">Location</dt><dd class="col-7">' + escapeHtml(orphanage.location) + '</dd>' +
          '<dt class="col-5">Registration #</dt><dd class="col-7">' + escapeHtml(orphanage.registrationNumber || '&mdash;') + '</dd>' +
          '<dt class="col-5">Founded</dt><dd class="col-7">' + (orphanage.foundedYear || '&mdash;') + '</dd>' +
          '<dt class="col-5">Capacity</dt><dd class="col-7">' + (orphanage.capacity || '&mdash;') + '</dd>' +
          '<dt class="col-5">Children</dt><dd class="col-7">' + (orphanage.childrenCount || 0) + '</dd>' +
          '<dt class="col-5">Supporters</dt><dd class="col-7">' + (orphanage.followersCount || 0) + '</dd>' +
          '<dt class="col-5">Contact</dt><dd class="col-7">' + escapeHtml(orphanage.contactName || '&mdash;') + '</dd>' +
          '<dt class="col-5">Phone</dt><dd class="col-7">' + escapeHtml(orphanage.contactPhone || '&mdash;') + '</dd>' +
          '<dt class="col-5">Email</dt><dd class="col-7">' + escapeHtml(orphanage.contactEmail || '&mdash;') + '</dd>' +
        '</dl>' +
      '</div>' +
      '<div class="col-12">' +
        '<h3 class="h6">Story / description</h3>' +
        '<textarea class="form-control small" id="modal-story-textarea" rows="6">' + escapeHtml(orphanage.story || '') + '</textarea>' +
        '<div class="d-flex align-items-center gap-2 mt-2">' +
          '<button type="button" class="btn btn-admin-outline btn-sm" id="save-story-btn">Save story</button>' +
          '<span class="small text-muted" id="story-save-status"></span>' +
        '</div>' +
      '</div>' +
      '<div class="col-12">' +
        '<h3 class="h6">Photo gallery</h3>' +
        galleryGrid +
      '</div>' +
      '<div class="col-12">' +
        '<h3 class="h6">Updates from orphanage</h3>' +
        postsList +
      '</div>' +
      '<div class="col-sm-6">' +
        '<h3 class="h6">Verification documents</h3>' +
        docsList +
      '</div>' +
      '<div class="col-sm-6">' +
        '<h3 class="h6">Needs history (' + formatFcfa(raised) + ' raised total)</h3>' +
        needsList +
      '</div>' +
      '<div class="col-12">' +
        '<h3 class="h6">Flag for review</h3>' +
        '<div class="form-check mb-2">' +
          '<input class="form-check-input" type="checkbox" id="modal-flag-checkbox"' + (orphanage.flagged ? ' checked' : '') + '>' +
          '<label class="form-check-label small" for="modal-flag-checkbox">Flag this profile for further review</label>' +
        '</div>' +
        '<textarea class="form-control small" id="modal-flag-reason" rows="2" placeholder="Reason (e.g. inconsistent documents, unreachable contact)...">' + escapeHtml(orphanage.flagReason || '') + '</textarea>' +
        '<div class="d-flex align-items-center gap-2 mt-2">' +
          '<button type="button" class="btn btn-admin-outline btn-sm" id="save-flag-btn">Save flag status</button>' +
          '<span class="small text-muted" id="flag-save-status"></span>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

function buildModalFooter(orphanage) {
  if (orphanage.status !== 'pending' && orphanage.status !== 'needs-info') {
    return '<button type="button" class="btn btn-admin-outline" data-bs-dismiss="modal">Close</button>';
  }

  const hasDocs = (orphanage.documents || []).length > 0;
  return (
    '<button type="button" class="btn btn-admin-danger modal-reject-btn">Reject</button>' +
    '<button type="button" class="btn btn-admin-outline modal-request-info-btn">Request more info</button>' +
    '<button type="button" class="btn btn-admin-primary modal-approve-btn"' +
      (hasDocs ? '' : ' disabled title="Upload verification documents before approving"') +
      '>Approve</button>'
  );
}

function openProfileModal(id) {
  const orphanages = loadOrphanages();
  const orphanage = orphanages.find(function (o) { return o.id === id; });
  if (!orphanage) return;

  const needs = loadNeeds();
  const orphanageNeeds = needs.filter(function (n) { return String(n.orphanageId) === String(orphanage.id); });
  const raised = orphanageNeeds.reduce(function (sum, n) { return sum + Number(n.raised || 0); }, 0);

  activeOrphanageId = id;
  document.getElementById('profile-modal-title').textContent = orphanage.name;
  document.getElementById('profile-modal-body').innerHTML = buildModalBody(orphanage, orphanageNeeds, raised);
  document.getElementById('profile-modal-footer').innerHTML = buildModalFooter(orphanage);
  profileModal.show();
}

document.getElementById('profile-grid').addEventListener('click', function (e) {
  const col = e.target.closest('[data-id]');
  if (!col) return;
  if (!e.target.classList.contains('review-btn')) return;
  openProfileModal(Number(col.dataset.id));
});

document.getElementById('profile-modal-body').addEventListener('click', function (e) {
  if (!e.target.classList.contains('save-story-btn') && e.target.id !== 'save-story-btn') return;
  if (activeOrphanageId === null) return;

  const orphanages = loadOrphanages();
  const orphanage = orphanages.find(function (o) { return o.id === activeOrphanageId; });
  if (!orphanage) return;

  const textarea = document.getElementById('modal-story-textarea');
  orphanage.story = textarea.value.trim();
  saveOrphanages(orphanages);

  const statusEl = document.getElementById('story-save-status');
  statusEl.textContent = 'Saved.';
  setTimeout(function () { statusEl.textContent = ''; }, 2000);
});

document.getElementById('profile-modal-body').addEventListener('click', function (e) {
  if (e.target.id !== 'save-flag-btn') return;
  if (activeOrphanageId === null) return;

  const orphanages = loadOrphanages();
  const orphanage = orphanages.find(function (o) { return o.id === activeOrphanageId; });
  if (!orphanage) return;

  orphanage.flagged = document.getElementById('modal-flag-checkbox').checked;
  orphanage.flagReason = document.getElementById('modal-flag-reason').value.trim();
  saveOrphanages(orphanages);
  render();

  const statusEl = document.getElementById('flag-save-status');
  statusEl.textContent = 'Saved.';
  setTimeout(function () { statusEl.textContent = ''; }, 2000);
});

document.getElementById('profile-modal-body').addEventListener('click', function (e) {
  if (!e.target.classList.contains('remove-post-btn')) return;
  if (activeOrphanageId === null) return;
  if (!confirm('Remove this update? This cannot be undone.')) return;

  const orphanages = loadOrphanages();
  const orphanage = orphanages.find(function (o) { return o.id === activeOrphanageId; });
  if (!orphanage) return;

  const postIndex = Number(e.target.dataset.postIndex);
  orphanage.posts = (orphanage.posts || []).filter(function (_, idx) { return idx !== postIndex; });
  saveOrphanages(orphanages);
  openProfileModal(activeOrphanageId);
});

document.getElementById('profile-modal-footer').addEventListener('click', function (e) {
  if (activeOrphanageId === null) return;
  const orphanages = loadOrphanages();
  const orphanage = orphanages.find(function (o) { return o.id === activeOrphanageId; });
  if (!orphanage) return;

  if (e.target.classList.contains('modal-approve-btn')) {
    orphanage.status = 'verified';
    saveOrphanages(orphanages);
    profileModal.hide();
    render();
  }

  if (e.target.classList.contains('modal-reject-btn')) {
    const reason = prompt('Reason for rejecting this orphanage? This will be shown to them.');
    if (reason === null) return;
    if (!reason.trim()) {
      alert('Please provide a rejection reason.');
      return;
    }
    orphanage.status = 'rejected';
    orphanage.rejectionReason = reason.trim();
    saveOrphanages(orphanages);
    profileModal.hide();
    render();
  }

  if (e.target.classList.contains('modal-request-info-btn')) {
    const message = prompt('What information or documents are missing? This will be shown to the orphanage.');
    if (message === null) return;
    if (!message.trim()) {
      alert('Please describe what is missing.');
      return;
    }
    orphanage.status = 'needs-info';
    orphanage.infoRequestMessage = message.trim();
    saveOrphanages(orphanages);
    profileModal.hide();
    render();
  }
});

render();
