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

// Edit profile toggle
const editProfileBtn = document.getElementById('edit-profile-btn');
const saveProfileBtn = document.getElementById('save-profile-btn');
const profileForm = document.getElementById('profile-form');

if (editProfileBtn) {
    editProfileBtn.addEventListener('click', function () {
        const editing = profileForm.classList.toggle('editing');
        profileForm.querySelectorAll('input, textarea').forEach(function (field) {
            field.disabled = !editing;
        });
        saveProfileBtn.style.display = editing ? 'inline-flex' : 'none';
        editProfileBtn.innerHTML = editing
            ? '<i class="bi bi-x-lg"></i> Cancel'
            : '<i class="bi bi-pencil"></i> Edit';
    });
}

if (profileForm) {
    profileForm.addEventListener('submit', function (e) {
        e.preventDefault();
        profileForm.querySelectorAll('input, textarea').forEach(function (field) {
            field.disabled = true;
        });
        saveProfileBtn.style.display = 'none';
        editProfileBtn.innerHTML = '<i class="bi bi-pencil"></i> Edit';
    });
}

// Add Need modal
const addNeedModal = document.getElementById('add-need-modal');
const addNeedForm = document.getElementById('add-need-form');
const needsList = document.getElementById('needs-list');

function openNeedModal() {
    addNeedModal.classList.add('open');
}
function closeNeedModal() {
    addNeedModal.classList.remove('open');
    addNeedForm.reset();
}

document.getElementById('add-need-btn').addEventListener('click', openNeedModal);
document.getElementById('quick-add-need').addEventListener('click', openNeedModal);
document.getElementById('cancel-need-btn').addEventListener('click', closeNeedModal);
addNeedModal.addEventListener('click', function (e) {
    if (e.target === addNeedModal) closeNeedModal();
});

addNeedForm.addEventListener('submit', function (e) {
    e.preventDefault();

    const title = document.getElementById('need-title').value.trim();
    const description = document.getElementById('need-description').value.trim();
    const goal = Number(document.getElementById('need-goal').value);

    const card = document.createElement('div');
    card.className = 'need-card';
    card.innerHTML =
        '<div class="need-card-head"><h3></h3><span class="need-status open">Open</span></div>' +
        '<p></p>' +
        '<div class="need-progress"><div class="need-progress-bar" style="width:0%"></div></div>' +
        '<div class="need-amounts"><span>FCFA 0 raised</span><span>Goal FCFA ' + goal.toLocaleString('en-US') + '</span></div>' +
        '<div class="need-actions"><button type="button"><i class="bi bi-pencil"></i> Edit</button><button type="button"><i class="bi bi-trash"></i> Remove</button></div>';

    card.querySelector('h3').textContent = title;
    card.querySelector('p').textContent = description;

    needsList.prepend(card);
    closeNeedModal();
    showView('needs');
});
