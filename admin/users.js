if (!localStorage.getItem('currentAdminEmail')) { window.location.href = 'index.html'; }
(function () {
  const role = localStorage.getItem('currentAdminRole') || 'Super Admin';
  if (role !== 'Super Admin' && role !== 'Administrator') {
    alert('Your role (' + role + ') does not have access to Users & Roles.');
    window.location.href = 'dashboard.html';
  }
})();

let usersCache = [];
function loadUsers() { return usersCache; }
function fetchUsersFromApi() {
  return apiRequest('/admins').then(function (data) {
    usersCache = data.admins;
  });
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
    document.getElementById('user-password').value = '';
    document.getElementById('user-role').value = user.role;
    userModal.show();
  }

  if (e.target.classList.contains('delete-user-btn')) {
    const id = Number(e.target.dataset.id);
    if (!confirm('Delete this user?')) return;
    apiRequest('/admins/' + id, { method: 'DELETE' })
      .then(fetchUsersFromApi)
      .then(render)
      .catch(function (err) {
        alert(err.message);
      });
  }
});

document.getElementById('user-form').addEventListener('submit', function (e) {
  e.preventDefault();
  const id = document.getElementById('user-id').value;
  const password = document.getElementById('user-password').value;

  const data = {
    name: document.getElementById('user-name').value.trim(),
    email: document.getElementById('user-email').value.trim(),
    role: document.getElementById('user-role').value,
  };

  if (password) data.password = password;

  if (!id && !password) {
    alert('Password is required for new users.');
    return;
  }

  const request = id
    ? apiRequest('/admins/' + id, { method: 'PUT', body: data })
    : apiRequest('/admins', { method: 'POST', body: data });

  request
    .then(fetchUsersFromApi)
    .then(function () {
      userModal.hide();
      render();
    })
    .catch(function (err) {
      alert(err.message);
    });
});

fetchUsersFromApi()
  .then(render)
  .catch(function (err) {
    alert('Could not load users from the server: ' + err.message);
  });
