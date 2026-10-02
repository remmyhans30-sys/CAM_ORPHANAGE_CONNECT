// Session check — only signed-in orphanage accounts may use the portal.
const SESSION_KEY = 'cocSession';
// Local copies talk to the server on this computer; the live site uses its own address.
const API_BASE = (window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname) ? 'http://localhost:4000' : '') + '/api/my-orphanage';

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

const session = readSession();
if (!session || session.role !== 'volunteer' || !session.token) {
    window.location.replace('../login/index.html');
}

document.getElementById('logout-link').addEventListener('click', clearSession);

// API helper — sends the session token; an expired session goes back to login.
async function api(path, options) {
    const opts = options || {};
    let response;
    try {
        response = await fetch(API_BASE + path, {
            method: opts.method || 'GET',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.token },
            body: opts.body ? JSON.stringify(opts.body) : undefined
        });
    } catch (err) {
        throw new Error('Cannot reach the server. Please make sure it is running and try again.');
    }

    if (response.status === 401) {
        clearSession();
        window.location.replace('../login/index.html');
        throw new Error('Your session has expired. Please log in again.');
    }
    if (response.status === 204) return {};

    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) {
        throw new Error(data.error || 'Something went wrong. Please try again.');
    }
    return data;
}

function showError(box, message) {
    box.textContent = message;
    box.classList.add('show');
}

function hideError(box) {
    box.classList.remove('show');
}

function formatFcfa(amount) {
    return 'FCFA ' + Number(amount || 0).toLocaleString('en-US');
}

// View switching
const navLinks = document.querySelectorAll('.portal-nav-link[data-view]');
const views = document.querySelectorAll('.portal-view');

function showView(name) {
    views.forEach(function (view) {
        view.classList.toggle('active', view.id === 'view-' + name);
    });
    navLinks.forEach(function (link) {
        link.classList.toggle('active', link.dataset.view === name);
    });
}

navLinks.forEach(function (link) {
    link.addEventListener('click', function () {
        showView(this.dataset.view);
    });
});

document.querySelectorAll('[data-view-link]').forEach(function (btn) {
    btn.addEventListener('click', function () {
        showView(this.dataset.viewLink);
    });
});

// Menu button (phones and tablets)
const sidebar = document.getElementById('portal-sidebar');
const menuBtn = document.getElementById('menu-btn');
const scrim = document.createElement('div');
scrim.className = 'portal-scrim';
document.body.appendChild(scrim);

function setMenu(open) {
    sidebar.classList.toggle('show', open);
    scrim.classList.toggle('show', open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuBtn.setAttribute('aria-label', open ? 'Close the menu' : 'Open the menu');
}
menuBtn.addEventListener('click', function () { setMenu(!sidebar.classList.contains('show')); });
scrim.addEventListener('click', function () { setMenu(false); });
document.querySelectorAll('.portal-nav-link').forEach(function (link) {
    link.addEventListener('click', function () { setMenu(false); });
});
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });

// Portal state
let orphanage = null;
let needs = [];

const portalError = document.getElementById('portal-error');

const STATUS_DISPLAY = {
    draft: {
        badge: '<i class="bi bi-pencil-square"></i> Incomplete',
        note: 'Your profile is not complete yet. Fill in the checklist below, then submit it for verification. You can already add needs while you work on it.'
    },
    pending: {
        badge: '<i class="bi bi-hourglass-split"></i> Pending Verification',
        note: 'Your profile is under review by our team. You can still add needs and update your profile while you wait — donors will see your listing once verification is complete.'
    },
    'needs-info': {
        badge: '<i class="bi bi-exclamation-circle"></i> More Info Needed',
        note: 'Our team needs more information before verifying your profile.'
    },
    verified: {
        badge: '<i class="bi bi-patch-check-fill"></i> Verified',
        note: 'Your profile is verified. Donors can now see your listing and give to your needs.'
    },
    rejected: {
        badge: '<i class="bi bi-x-circle"></i> Not Approved',
        note: 'Your profile was not approved.'
    }
};

function renderStatus() {
    const status = STATUS_DISPLAY[orphanage.status] ? orphanage.status : 'draft';
    const display = STATUS_DISPLAY[status];

    const badge = document.getElementById('status-badge');
    badge.className = 'verify-badge ' + status;
    badge.innerHTML = display.badge;

    let note = display.note;
    if (status === 'needs-info' && orphanage.infoRequestMessage) {
        note += ' Request: "' + orphanage.infoRequestMessage + '". Update your profile below to respond.';
    }
    if (status === 'rejected' && orphanage.rejectionReason) {
        note += ' Reason: ' + orphanage.rejectionReason;
    }
    document.getElementById('status-note').className = 'info-note ' + status;
    document.getElementById('status-note-text').textContent = note;

    document.getElementById('portal-greeting').textContent = 'Welcome back, ' + orphanage.name;
    renderChecklist();
}

function renderStats() {
    const funded = needs.filter(function (n) { return n.goal > 0 && n.raised >= n.goal; });
    const totalRaised = needs.reduce(function (sum, n) { return sum + (n.raised || 0); }, 0);

    document.getElementById('stat-active').textContent = needs.length - funded.length;
    document.getElementById('stat-funded').textContent = funded.length;
    document.getElementById('stat-raised').textContent = formatFcfa(totalRaised);
    document.getElementById('stat-children').textContent = orphanage.childrenCount || 0;
}

// Profile
const PROFILE_INPUTS = {
    name: 'org-name',
    location: 'org-location',
    registrationNumber: 'org-registration',
    foundedYear: 'org-founded',
    capacity: 'org-capacity',
    childrenCount: 'org-children',
    contactName: 'org-contact-name',
    contactPhone: 'org-contact-phone',
    contactEmail: 'org-contact-email',
    story: 'org-story',
    storyLanguage: 'org-story-language',
    paymentProvider: 'org-pay-provider',
    paymentAccountName: 'org-pay-name',
    paymentAccountNumber: 'org-pay-number'
};
const termsInput = document.getElementById('org-terms');

const editProfileBtn = document.getElementById('edit-profile-btn');
const saveProfileBtn = document.getElementById('save-profile-btn');
const profileForm = document.getElementById('profile-form');
const profileError = document.getElementById('profile-error');

function fillProfileForm() {
    Object.keys(PROFILE_INPUTS).forEach(function (key) {
        const value = orphanage[key];
        document.getElementById(PROFILE_INPUTS[key]).value = value === null || value === undefined ? '' : value;
    });
    termsInput.checked = Boolean(orphanage.termsAgreed);
}

function setEditing(editing) {
    profileForm.classList.toggle('editing', editing);
    profileForm.querySelectorAll('input, textarea, select').forEach(function (field) {
        field.disabled = !editing;
    });
    saveProfileBtn.style.display = editing ? 'inline-flex' : 'none';
    editProfileBtn.innerHTML = editing
        ? '<i class="bi bi-x-lg"></i> Cancel'
        : '<i class="bi bi-pencil"></i> Edit';
}

editProfileBtn.addEventListener('click', function () {
    const editing = !profileForm.classList.contains('editing');
    if (!editing) fillProfileForm();
    hideError(profileError);
    setEditing(editing);
});

profileForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    const body = {};
    Object.keys(PROFILE_INPUTS).forEach(function (key) {
        body[key] = document.getElementById(PROFILE_INPUTS[key]).value.trim();
    });
    body.termsAgreed = termsInput.checked;
    if (!body.name) {
        showError(profileError, 'Orphanage name cannot be empty.');
        return;
    }

    hideError(profileError);
    saveProfileBtn.disabled = true;
    try {
        const data = await api('', { method: 'PUT', body: body });
        orphanage = data.orphanage;
        fillProfileForm();
        setEditing(false);
        renderStatus();
        renderStats();
        renderUploads();
    } catch (err) {
        showError(profileError, err.message);
    }
    saveProfileBtn.disabled = false;
});

// Checklist and submit for verification
const submitReviewBtn = document.getElementById('submit-review-btn');
const submitError = document.getElementById('submit-error');

function renderChecklist() {
    const panel = document.getElementById('checklist-panel');
    const canEdit = orphanage.status === 'draft' || orphanage.status === 'needs-info';
    panel.style.display = orphanage.status === 'verified' || orphanage.status === 'rejected' ? 'none' : '';

    const items = orphanage.checklist || [];
    const required = items.filter(function (i) { return i.required; });
    const doneRequired = required.filter(function (i) { return i.done; }).length;

    document.getElementById('checklist-progress').style.width = Math.round((doneRequired / Math.max(1, required.length)) * 100) + '%';
    document.getElementById('checklist-summary').textContent = orphanage.status === 'pending'
        ? 'Submitted. Our team is reviewing your profile.'
        : doneRequired + ' of ' + required.length + ' required items done. The CAM Orphanage Connect team reviews your profile once you submit it.';

    const list = document.getElementById('checklist');
    list.innerHTML = '';
    items.forEach(function (item) {
        const li = document.createElement('li');
        li.className = item.done ? 'done' : '';
        li.innerHTML = '<i class="bi ' + (item.done ? 'bi-check-circle-fill' : 'bi-circle') + '"></i><span></span>' + (item.required ? '' : '<em class="tag">optional</em>');
        li.querySelector('span').textContent = item.label;
        list.appendChild(li);
    });

    submitReviewBtn.style.display = canEdit ? '' : 'none';
    submitReviewBtn.disabled = doneRequired < required.length;
    submitReviewBtn.innerHTML = orphanage.status === 'needs-info'
        ? '<i class="bi bi-send-check"></i> Resubmit for verification'
        : '<i class="bi bi-send-check"></i> Submit for verification';
}

submitReviewBtn.addEventListener('click', async function () {
    hideError(submitError);
    submitReviewBtn.disabled = true;
    try {
        const data = await api('/submit', { method: 'POST' });
        orphanage = data.orphanage;
        setEditing(false);
        renderStatus();
        renderStats();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
        showError(submitError, err.message);
        renderChecklist();
    }
});

// Photos and documents
const uploadError = document.getElementById('upload-error');
const uploadInput = document.getElementById('upload-input');
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
let uploadKind = null;

const UPLOAD_TARGETS = {
    photo: { path: '/photo', accept: 'image/jpeg,image/png,image/webp' },
    cover: { path: '/cover', accept: 'image/jpeg,image/png,image/webp' },
    document: { path: '/documents', accept: 'application/pdf,image/jpeg,image/png' }
};

function renderUploads() {
    function showPhoto(boxId, url) {
        const box = document.getElementById(boxId);
        box.innerHTML = '';
        if (!url) {
            box.innerHTML = '<i class="bi bi-image"></i>';
            return;
        }
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        box.appendChild(img);
    }
    showPhoto('photo-preview', orphanage.photoUrl);
    showPhoto('cover-preview', orphanage.coverPhotoUrl);

    const list = document.getElementById('doc-list');
    list.innerHTML = '';
    if (orphanage.documents.length === 0) {
        list.innerHTML = '<li class="doc-empty">No documents uploaded yet.</li>';
    }
    orphanage.documents.forEach(function (doc) {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = '#';
        link.textContent = doc.name + (doc.size ? ' (' + Math.max(1, Math.round(doc.size / 1024)) + ' KB)' : '');
        link.addEventListener('click', function (e) {
            e.preventDefault();
            openDocument(doc);
        });
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.innerHTML = '<i class="bi bi-trash"></i> Remove';
        remove.addEventListener('click', function () { removeDocument(doc); });
        li.appendChild(link);
        li.appendChild(remove);
        list.appendChild(li);
    });
    renderChecklist();
}

document.querySelectorAll('[data-upload]').forEach(function (btn) {
    btn.addEventListener('click', function () {
        uploadKind = btn.dataset.upload;
        uploadInput.accept = UPLOAD_TARGETS[uploadKind].accept;
        uploadInput.value = '';
        uploadInput.click();
    });
});

uploadInput.addEventListener('change', function () {
    const file = uploadInput.files[0];
    if (!file || !uploadKind) return;
    hideError(uploadError);

    if (file.size > MAX_UPLOAD_BYTES) {
        showError(uploadError, 'That file is too large. The limit is 3 MB.');
        return;
    }

    const kind = uploadKind;
    const reader = new FileReader();
    reader.onload = async function () {
        try {
            const data = await api(UPLOAD_TARGETS[kind].path, { method: 'POST', body: { filename: file.name, data: String(reader.result) } });
            orphanage = data.orphanage;
            renderUploads();
            renderStatus();
        } catch (err) {
            showError(uploadError, err.message);
        }
    };
    reader.onerror = function () { showError(uploadError, 'Could not read that file. Please try another one.'); };
    reader.readAsDataURL(file);
});

async function removeDocument(doc) {
    if (!window.confirm('Remove "' + doc.name + '"?')) return;
    hideError(uploadError);
    try {
        const data = await api('/documents/' + doc.id, { method: 'DELETE' });
        orphanage = data.orphanage;
        renderUploads();
    } catch (err) {
        showError(uploadError, err.message);
    }
}

// Documents are private, so they are fetched with the login and opened from memory.
async function openDocument(doc) {
    const opened = window.open('', '_blank');
    try {
        const response = await fetch(API_BASE.replace('/my-orphanage', '/files/document/') + doc.id, {
            headers: { Authorization: 'Bearer ' + session.token }
        });
        if (!response.ok) throw new Error('not found');
        const url = URL.createObjectURL(await response.blob());
        if (opened) opened.location.href = url; else window.location.href = url;
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    } catch (err) {
        if (opened) opened.close();
        showError(uploadError, 'Could not open "' + doc.name + '".');
    }
}

// Needs
const needsList = document.getElementById('needs-list');
const needModal = document.getElementById('add-need-modal');
const needForm = document.getElementById('add-need-form');
const needError = document.getElementById('need-error');
const needSubmitBtn = document.getElementById('need-submit-btn');
let editingNeedId = null;

function renderNeeds() {
    needsList.innerHTML = '';

    if (needs.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'No needs posted yet. Add your first need so donors know how to help.';
        needsList.appendChild(empty);
        return;
    }

    needs.forEach(function (need) {
        const funded = need.goal > 0 && need.raised >= need.goal;
        const percent = Math.min(100, need.percent || 0);

        const card = document.createElement('div');
        card.className = 'need-card';
        card.innerHTML =
            '<div class="need-card-head"><h3></h3><span class="need-status ' + (funded ? 'funded">Funded' : 'open">Open') + '</span></div>' +
            '<p></p>' +
            '<div class="need-progress"><div class="need-progress-bar" style="width:' + percent + '%"></div></div>' +
            '<div class="need-amounts"><span>' + formatFcfa(need.raised) + ' raised</span><span>Goal ' + formatFcfa(need.goal) + '</span></div>' +
            '<div class="need-actions">' +
                '<button type="button" data-action="edit"><i class="bi bi-pencil"></i> Edit</button>' +
                '<button type="button" data-action="remove"><i class="bi bi-trash"></i> Remove</button>' +
            '</div>';

        card.querySelector('h3').textContent = need.title;
        card.querySelector('p').textContent = need.description || '';

        const removeBtn = card.querySelector('[data-action="remove"]');
        if (need.raised > 0) {
            removeBtn.disabled = true;
            removeBtn.title = 'Needs that have received donations cannot be removed.';
        }

        card.querySelector('[data-action="edit"]').addEventListener('click', function () {
            openNeedModal(need);
        });
        removeBtn.addEventListener('click', function () {
            removeNeed(need);
        });

        needsList.appendChild(card);
    });
}

function openNeedModal(need) {
    editingNeedId = need ? need.id : null;
    needForm.reset();
    hideError(needError);

    document.getElementById('need-modal-title').textContent = need ? 'Edit Need' : 'Add a New Need';
    needSubmitBtn.innerHTML = need
        ? '<i class="bi bi-check2"></i> Save Need'
        : '<i class="bi bi-check2"></i> Post Need';

    if (need) {
        document.getElementById('need-title').value = need.title;
        document.getElementById('need-description').value = need.description || '';
        document.getElementById('need-goal').value = need.goal;
    }
    needModal.classList.add('open');
}

function closeNeedModal() {
    needModal.classList.remove('open');
    needForm.reset();
    editingNeedId = null;
}

document.getElementById('add-need-btn').addEventListener('click', function () { openNeedModal(null); });
document.getElementById('quick-add-need').addEventListener('click', function () { openNeedModal(null); });
document.getElementById('cancel-need-btn').addEventListener('click', closeNeedModal);
needModal.addEventListener('click', function (e) {
    if (e.target === needModal) closeNeedModal();
});

needForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    const body = {
        title: document.getElementById('need-title').value.trim(),
        description: document.getElementById('need-description').value.trim(),
        goal: Number(document.getElementById('need-goal').value)
    };

    hideError(needError);
    needSubmitBtn.disabled = true;
    try {
        if (editingNeedId) {
            const data = await api('/needs/' + editingNeedId, { method: 'PUT', body: body });
            needs = needs.map(function (n) { return n.id === data.need.id ? data.need : n; });
        } else {
            const data = await api('/needs', { method: 'POST', body: body });
            needs.unshift(data.need);
        }
        closeNeedModal();
        renderNeeds();
        renderStats();
        showView('needs');
    } catch (err) {
        showError(needError, err.message);
    }
    needSubmitBtn.disabled = false;
});

async function removeNeed(need) {
    if (!window.confirm('Remove "' + need.title + '"? This cannot be undone.')) return;

    hideError(portalError);
    try {
        await api('/needs/' + need.id, { method: 'DELETE' });
        needs = needs.filter(function (n) { return n.id !== need.id; });
        renderNeeds();
        renderStats();
    } catch (err) {
        showError(portalError, err.message);
    }
}

// Pledges received
function formatDate(value) {
    // The server sends ISO time with its "Z"; older "YYYY-MM-DD HH:MM:SS" text is UTC too.
    const text = String(value);
    const date = new Date(/Z$/.test(text) ? text : text.replace(' ', 'T') + 'Z');
    return isNaN(date) ? value : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Donors send the money straight to the home, with the pledge's reference in the payment note.
// When it arrives, the home marks the pledge as received (and can take that back).
function renderPledges(pledges) {
    const body = document.getElementById('pledges-body');
    if (pledges.length === 0) return;

    body.innerHTML = '';
    pledges.forEach(function (pledge) {
        const row = document.createElement('tr');
        [formatDate(pledge.createdAt), pledge.donorName, pledge.needTitle, formatFcfa(pledge.amount), pledge.reference].forEach(function (text) {
            const cell = document.createElement('td');
            cell.textContent = text;
            row.appendChild(cell);
        });
        const status = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = 'donation-status ' + (pledge.received ? 'completed' : 'pledged');
        badge.textContent = pledge.received ? 'Received' : 'Pledged';
        status.appendChild(badge);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pledge-received-btn ' + (pledge.received ? 'is-undo' : '');
        button.dataset.pledgeId = pledge.id;
        button.dataset.received = pledge.received ? 'false' : 'true';
        button.textContent = pledge.received ? 'Undo' : 'Mark as received';
        status.appendChild(button);
        row.appendChild(status);
        body.appendChild(row);
    });
}

document.getElementById('pledges-body').addEventListener('click', async function (e) {
    const button = e.target.closest('.pledge-received-btn');
    if (!button) return;
    const error = document.getElementById('pledges-error');
    button.disabled = true;
    try {
        const data = await api('/pledges/' + button.dataset.pledgeId + '/received', { method: 'POST', body: { received: button.dataset.received === 'true' } });
        hideError(error);
        renderPledges(data.pledges);
    } catch (err) {
        showError(error, err.message);
        button.disabled = false;
    }
});

// Stories, updates and videos
let postLimits = { maxVideoMb: 15, videoQuotaMb: 60 };
let canPost = false;

function setBox(box, message) {
    box.textContent = message || '';
    box.classList.toggle('show', Boolean(message));
}

function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result).split(',')[1] || ''); };
        reader.onerror = function () { reject(new Error('That file could not be read.')); };
        reader.readAsDataURL(file);
    });
}

// The video is sent as the raw file so a large video is not inflated by base64; the bar shows progress.
function sendVideo(postId, file, onProgress) {
    return new Promise(function (resolve, reject) {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', API_BASE + '/posts/' + postId + '/video');
        xhr.setRequestHeader('Authorization', 'Bearer ' + session.token);
        xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
        xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
        xhr.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(e.loaded / e.total); };
        xhr.onload = function () {
            let data = {};
            try { data = JSON.parse(xhr.responseText); } catch (err) { /* keep empty */ }
            if (xhr.status === 401) { clearSession(); window.location.replace('../login/index.html'); return; }
            if (xhr.status >= 200 && xhr.status < 300) resolve(data);
            else reject(new Error(data.error || 'The video could not be uploaded.'));
        };
        xhr.onerror = function () { reject(new Error('Cannot reach the server. Please try again.')); };
        xhr.send(file);
    });
}

function checkVideoFile(file) {
    if (!file) return null;
    if (!/^video\/(mp4|webm)$/.test(file.type) && !/\.(mp4|webm)$/i.test(file.name)) return 'The video must be an MP4 or WebM file.';
    if (file.size > postLimits.maxVideoMb * 1024 * 1024) return 'That video is too large. The limit is ' + postLimits.maxVideoMb + ' MB. Try a shorter clip.';
    return null;
}

function showProgress(fraction, text) {
    document.getElementById('post-progress').style.display = fraction === null ? 'none' : '';
    if (fraction !== null) document.getElementById('post-progress-bar').style.width = Math.round(fraction * 100) + '%';
    document.getElementById('post-progress-text').textContent = text || '';
}

function renderOwnPosts(list) {
    const container = document.getElementById('posts-list');
    window.CocUpdates.renderPosts(container, list, {
        emptyText: 'You have not shared anything yet.',
        extra: function (card, post) {
            const actions = document.createElement('div');
            actions.className = 'post-card-actions';

            const video = document.createElement('input');
            video.type = 'file';
            video.accept = 'video/mp4,video/webm';
            video.hidden = true;
            video.addEventListener('change', async function () {
                const problem = checkVideoFile(video.files[0]);
                const box = document.getElementById('posts-error');
                if (problem) { showError(box, problem); return; }
                hideError(box);
                try {
                    showProgress(0, 'Uploading the video...');
                    await sendVideo(post.id, video.files[0], function (f) { showProgress(f, 'Uploading the video... ' + Math.round(f * 100) + '%'); });
                    showProgress(null);
                    await loadPosts();
                } catch (err) {
                    showProgress(null);
                    showError(box, err.message);
                }
            });
            actions.appendChild(video);

            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'btn-outline-pill';
            add.textContent = post.videoUrl ? 'Replace video' : 'Add a video';
            add.addEventListener('click', function () { video.click(); });
            actions.appendChild(add);

            if (post.videoUrl) {
                const removeVideo = document.createElement('button');
                removeVideo.type = 'button';
                removeVideo.className = 'btn-outline-pill';
                removeVideo.textContent = 'Remove video';
                removeVideo.addEventListener('click', async function () {
                    try { await api('/posts/' + post.id + '/video', { method: 'DELETE' }); await loadPosts(); } catch (err) { showError(document.getElementById('posts-error'), err.message); }
                });
                actions.appendChild(removeVideo);
            }

            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'btn-outline-pill';
            del.textContent = 'Delete post';
            del.addEventListener('click', async function () {
                if (!confirm('Delete this post? Its photo and video are deleted too.')) return;
                try { await api('/posts/' + post.id, { method: 'DELETE' }); await loadPosts(); } catch (err) { showError(document.getElementById('posts-error'), err.message); }
            });
            actions.appendChild(del);
            card.appendChild(actions);
        }
    });
}

const SOCIAL_FIELDS = ['website', 'facebook', 'instagram', 'youtube', 'tiktok', 'x', 'whatsapp'];

function fillSocialForm(links) {
    SOCIAL_FIELDS.forEach(function (name) { document.getElementById('social-' + name).value = (links && links[name]) || ''; });
}

async function loadPosts() {
    const data = await api('/posts');
    canPost = data.canPost;
    postLimits = data.limits;
    document.getElementById('posts-locked').style.display = canPost ? 'none' : '';
    document.getElementById('post-submit').disabled = !canPost;
    document.getElementById('post-video-hint').textContent = 'A short MP4 or WebM video, up to ' + postLimits.maxVideoMb + ' MB.';
    renderOwnPosts(data.posts);
    fillSocialForm(data.socialLinks);
}

document.getElementById('post-text').addEventListener('input', function () {
    document.getElementById('post-count').textContent = this.value.length + ' / 2000';
});

document.getElementById('post-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const error = document.getElementById('post-error');
    const success = document.getElementById('post-success');
    setBox(success, '');
    setBox(error, '');

    const text = document.getElementById('post-text').value.trim();
    const photo = document.getElementById('post-photo').files[0];
    const video = document.getElementById('post-video').files[0];
    if (!text) { setBox(error, 'Please write your message.'); return; }
    if (photo && photo.size > 3 * 1024 * 1024) { setBox(error, 'The photo is too large. The limit is 3 MB.'); return; }
    const videoProblem = checkVideoFile(video);
    if (videoProblem) { setBox(error, videoProblem); return; }

    const button = document.getElementById('post-submit');
    button.disabled = true;
    try {
        const body = {
            type: document.getElementById('post-type').value,
            title: document.getElementById('post-title').value.trim(),
            text: text
        };
        if (photo) body.photo = { filename: photo.name, data: await readFileAsBase64(photo) };
        const created = await api('/posts', { method: 'POST', body: body });

        let note = 'Your post is published.';
        if (video) {
            try {
                showProgress(0, 'Uploading the video...');
                await sendVideo(created.post.id, video, function (f) { showProgress(f, 'Uploading the video... ' + Math.round(f * 100) + '%'); });
            } catch (err) {
                note = 'Your post is published, but the video was not uploaded: ' + err.message + ' You can add it again from the post below.';
            }
            showProgress(null);
        }
        document.getElementById('post-form').reset();
        document.getElementById('post-count').textContent = '0 / 2000';
        setBox(success, note);
        await loadPosts();
    } catch (err) {
        setBox(error, err.message);
    }
    button.disabled = !canPost;
});

document.getElementById('social-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const error = document.getElementById('social-error');
    const success = document.getElementById('social-success');
    setBox(error, '');
    setBox(success, '');
    const links = {};
    SOCIAL_FIELDS.forEach(function (name) { links[name] = document.getElementById('social-' + name).value.trim(); });
    try {
        const data = await api('/social', { method: 'PUT', body: { links: links } });
        fillSocialForm(data.socialLinks);
        setBox(success, 'Your links are saved.');
    } catch (err) {
        setBox(error, err.message);
    }
});

// Visit requests: the orphanage decides
function visitDate(value) {
    const date = new Date(value + 'T00:00:00');
    return isNaN(date) ? value : date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

function renderVisits(visits) {
    const list = document.getElementById('visits-list');
    const waiting = visits.filter(function (v) { return v.status === 'pending'; }).length;
    document.getElementById('visits-dot').style.display = waiting > 0 ? '' : 'none';

    list.innerHTML = '';
    if (visits.length === 0) {
        list.innerHTML = '<p class="empty-cell">No visit requests yet.</p>';
        return;
    }

    visits.forEach(function (v) {
        const card = document.createElement('div');
        card.className = 'visit-card';

        const head = document.createElement('div');
        head.className = 'visit-card-head';
        const who = document.createElement('strong');
        who.textContent = v.requesterName + (v.requesterType === 'partner' ? ' (partner organization)' : ' (donor)');
        const status = document.createElement('span');
        status.className = 'visit-status ' + v.status;
        status.textContent = { pending: 'Waiting for your answer', approved: 'Approved', declined: 'Declined', cancelled: 'Cancelled by the visitor' }[v.status] || v.status;
        head.appendChild(who);
        head.appendChild(status);
        card.appendChild(head);

        const when = document.createElement('p');
        when.textContent = visitDate(v.preferredDate) + ' · ' + v.visitorsCount + (v.visitorsCount === 1 ? ' visitor' : ' visitors');
        card.appendChild(when);

        if (v.requesterLocation) {
            const place = document.createElement('p');
            place.className = 'visit-meta';
            place.textContent = 'From ' + v.requesterLocation;
            card.appendChild(place);
        }
        if (v.message) {
            const quote = document.createElement('p');
            quote.className = 'visit-quote';
            quote.textContent = v.message;
            card.appendChild(quote);
        }
        if (v.status === 'approved' && v.requesterEmail) {
            const contact = document.createElement('p');
            contact.textContent = 'Contact to arrange the visit: ' + v.requesterEmail;
            card.appendChild(contact);
        }
        if (v.responseNote) {
            const reply = document.createElement('p');
            reply.className = 'visit-meta';
            reply.textContent = 'Your answer: ' + v.responseNote;
            card.appendChild(reply);
        }

        if (v.status === 'pending') {
            const note = document.createElement('textarea');
            note.placeholder = 'Note to the visitor (required if you decline)';
            note.maxLength = 500;
            card.appendChild(note);

            const actions = document.createElement('div');
            actions.className = 'visit-actions';
            [['approved', 'Approve', 'btn-primary-pill'], ['declined', 'Decline', 'btn-outline-pill']].forEach(function (choice) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = choice[2];
                button.textContent = choice[1];
                button.addEventListener('click', function () { answerVisit(v.id, choice[0], note.value, actions); });
                actions.appendChild(button);
            });
            card.appendChild(actions);
        }
        list.appendChild(card);
    });
}

async function answerVisit(id, decision, note, actions) {
    const box = document.getElementById('visits-error');
    hideError(box);
    actions.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    try {
        const data = await api('/visits/' + id + '/respond', { method: 'POST', body: { decision: decision, note: note } });
        renderVisits(data.visits);
    } catch (err) {
        showError(box, err.message);
        actions.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
    }
}

// Messages: chat with the team, donors and partners
let chatStarted = false;

function startChat() {
    if (chatStarted) return;
    chatStarted = true;
    window.createChat({
        root: document.getElementById('chat-root'),
        api: window.createUserChatApi({
            base: API_BASE.replace(/\/my-orphanage$/, ''),
            token: session.token,
            onExpired: function () {
                clearSession();
                window.location.replace('../login/index.html');
            }
        }),
        onUnread: function (count) {
            document.getElementById('messages-dot').style.display = count > 0 ? '' : 'none';
        }
    });
}

// Initial load
async function loadPortal() {
    try {
        const data = await api('');
        orphanage = data.orphanage;
        needs = data.needs;
        renderStatus();
        renderStats();
        fillProfileForm();
        renderUploads();
        renderNeeds();
        startChat();
        if (orphanage.status === 'draft') setEditing(true);
        const pledgeData = await api('/pledges');
        renderPledges(pledgeData.pledges);
        const visitData = await api('/visits');
        renderVisits(visitData.visits);
        await loadPosts();
    } catch (err) {
        showError(portalError, err.message);
        document.getElementById('status-note-text').textContent = 'Your profile could not be loaded.';
    }
}

if (session && session.token) {
    loadPortal();
}
