const API_BASE = 'http://localhost:4000/api';

document.getElementById('admin-login-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const email = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-password').value;
  const rememberMe = document.getElementById('remember-me').checked;
  const errorBox = document.getElementById('login-error');
  const submitBtn = e.target.querySelector('button[type="submit"]');

  if (!email || !password) {
    errorBox.textContent = 'Please enter both email and password.';
    errorBox.classList.remove('d-none');
    return;
  }

  errorBox.classList.add('d-none');
  submitBtn.disabled = true;

  fetch(API_BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
    .then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Invalid email or password.');
        return data;
      });
    })
    .then(function (data) {
      const store = rememberMe ? window.localStorage : window.sessionStorage;
      store.setItem('cocAdminToken', data.token);
      store.setItem('cocAdminUser', JSON.stringify(data.admin));
      window.location.href = 'dashboard.html';
    })
    .catch(function (err) {
      errorBox.textContent = err.message === 'Failed to fetch'
        ? "Can't reach the server. Make sure the backend is running (see server/README.md)."
        : err.message;
      errorBox.classList.remove('d-none');
      submitBtn.disabled = false;
    });
});
