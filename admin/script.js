const rememberedEmail = localStorage.getItem('rememberedAdminEmail');
if (rememberedEmail) {
  document.getElementById('admin-email').value = rememberedEmail;
  document.getElementById('remember-me').checked = true;
}

document.getElementById('toggle-password-btn').addEventListener('click', function () {
  const passwordInput = document.getElementById('admin-password');
  const isHidden = passwordInput.type === 'password';
  passwordInput.type = isHidden ? 'text' : 'password';
  this.textContent = isHidden ? 'Hide' : 'Show';
});

document.getElementById('forgot-password-link').addEventListener('click', function (e) {
  e.preventDefault();
  alert('Please contact your system administrator to reset your password. Self-service password reset is not available yet.');
});

document.getElementById('admin-login-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const email = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-password').value;
  const rememberMe = document.getElementById('remember-me').checked;
  const errorBox = document.getElementById('login-error');

  if (!email || !password) {
    errorBox.textContent = 'Please enter both email and password.';
    errorBox.classList.remove('d-none');
    return;
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    errorBox.textContent = 'Please enter a valid email address.';
    errorBox.classList.remove('d-none');
    return;
  }

  errorBox.classList.add('d-none');
  localStorage.setItem('currentAdminEmail', email);

  const users = JSON.parse(localStorage.getItem('users') || '[]');
  const matchedUser = users.find(function (u) { return u.email.toLowerCase() === email.toLowerCase(); });
  localStorage.setItem('currentAdminRole', matchedUser ? matchedUser.role : 'Super Admin');

  if (rememberMe) {
    localStorage.setItem('rememberedAdminEmail', email);
  } else {
    localStorage.removeItem('rememberedAdminEmail');
  }

  window.location.href = 'dashboard.html';
});
