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

// Portal state
let orphanage = null;
let needs = [];

const portalError = document.getElementById('portal-error');

const STATUS_DISPLAY = {
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
    const status = STATUS_DISPLAY[orphanage.status] ? orphanage.status : 'pending';
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
    foundedYear: 'org-founded',
    childrenCount: 'org-children',
    contactName: 'org-contact-name',
    contactPhone: 'org-contact-phone',
    story: 'org-story'
};

const editProfileBtn = document.getElementById('edit-profile-btn');
const saveProfileBtn = document.getElementById('save-profile-btn');
const profileForm = document.getElementById('profile-form');
const profileError = document.getElementById('profile-error');

function fillProfileForm() {
    Object.keys(PROFILE_INPUTS).forEach(function (key) {
        const value = orphanage[key];
        document.getElementById(PROFILE_INPUTS[key]).value = value === null || value === undefined ? '' : value;
    });
}

function setEditing(editing) {
    profileForm.classList.toggle('editing', editing);
    profileForm.querySelectorAll('input, textarea').forEach(function (field) {
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
    } catch (err) {
        showError(profileError, err.message);
    }
    saveProfileBtn.disabled = false;
});

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
    const date = new Date(String(value).replace(' ', 'T') + 'Z');
    return isNaN(date) ? value : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderPledges(pledges) {
    const body = document.getElementById('pledges-body');
    if (pledges.length === 0) return;

    body.innerHTML = '';
    pledges.forEach(function (pledge) {
        const row = document.createElement('tr');
        [formatDate(pledge.createdAt), pledge.donorName, pledge.needTitle, formatFcfa(pledge.amount)].forEach(function (text) {
            const cell = document.createElement('td');
            cell.textContent = text;
            row.appendChild(cell);
        });
        const status = document.createElement('td');
        status.innerHTML = '<span class="donation-status completed">Pledged</span>';
        row.appendChild(status);
        body.appendChild(row);
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
        renderNeeds();
        const pledgeData = await api('/pledges');
        renderPledges(pledgeData.pledges);
    } catch (err) {
        showError(portalError, err.message);
        document.getElementById('status-note-text').textContent = 'Your profile could not be loaded.';
    }
}

if (session && session.token) {
    loadPortal();
}
