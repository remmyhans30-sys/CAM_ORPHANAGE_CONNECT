if (!localStorage.getItem('currentAdminEmail')) { window.location.href = 'index.html'; }
(function () {
  const role = localStorage.getItem('currentAdminRole') || 'Super Admin';
  if (role !== 'Super Admin' && role !== 'Administrator') {
    alert('Your role (' + role + ') does not have access to Users & Roles.');
    window.location.href = 'dashboard.html';
  }
})();

function loadUsers() {
  const users = JSON.parse(localStorage.getItem('users') || 'null');
  if (users) return users;

  const seeded = [
    { id: 1, name: 'You (current session)', email: localStorage.getItem('currentAdminEmail') || 'admin@camorphanage.org', role: 'Super Admin' },
  ];
  localStorage.setItem('users', JSON.stringify(seeded));
  return seeded;
}

function saveUsers(users) {
  localStorage.setItem('users', JSON.stringify(users));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function render() {
  const users = loadUsers();
  document.getElementById('users-tbody').innerHTML = users.map(function (u) {
    return (
      '<tr>' +
        '<td>' + escapeHtml(u.name) + '</td>' +
        '<td>' + escapeHtml(u.email) + '</td>' +
        '<td><span class="tier-tag tier-friend">' + escapeHtml(u.role) + '</span></td>' +
        '<td class="text-end">' +
          '<button class="btn btn-admin-outline btn-sm me-2 edit-user-btn" data-id="' + u.id + '">Edit</button>' +
          '<button class="btn btn-admin-danger btn-sm delete-user-btn" data-id="' + u.id + '">Delete</button>' +
        '</td>' +
      '</tr>'
    );
  }).join('');
}

const userModal = new bootstrap.Modal(document.getElementById('user-modal'));

document.getElementById('add-user-btn').addEventListener('click', function () {
  document.getElementById('user-modal-title').textContent = 'Add User';
  document.getElementById('user-form').reset();
  document.getElementById('user-id').value = '';
  userModal.show();
});

document.getElementById('users-tbody').addEventListener('click', function (e) {
  const users = loadUsers();

  if (e.target.classList.contains('edit-user-btn')) {
    const user = users.find(function (u) { return u.id === Number(e.target.dataset.id); });
    if (!user) return;
    document.getElementById('user-modal-title').textContent = 'Edit User';
    document.getElementById('user-id').value = user.id;
    document.getElementById('user-name').value = user.name;
    document.getElementById('user-email').value = user.email;
    document.getElementById('user-role').value = user.role;
    userModal.show();
  }

  if (e.target.classList.contains('delete-user-btn')) {
    if (!confirm('Delete this user?')) return;
    saveUsers(users.filter(function (u) { return u.id !== Number(e.target.dataset.id); }));
    render();
  }
});

document.getElementById('user-form').addEventListener('submit', function (e) {
  e.preventDefault();
  const users = loadUsers();
  const id = document.getElementById('user-id').value;
  const data = {
    name: document.getElementById('user-name').value.trim(),
    email: document.getElementById('user-email').value.trim(),
    role: document.getElementById('user-role').value,
  };

  if (id) {
    const user = users.find(function (u) { return u.id === Number(id); });
    if (user) Object.assign(user, data);
  } else {
    data.id = Date.now();
    users.push(data);
  }

  saveUsers(users);
  userModal.hide();
  render();
});

render();
