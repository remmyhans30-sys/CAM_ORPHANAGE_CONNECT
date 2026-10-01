const REMEMBERED_ADMIN_EMAIL_KEY = 'camoc_remembered_admin_email';

const adminEmailInput = document.getElementById('admin-email');
const rememberedAdminEmail = localStorage.getItem(REMEMBERED_ADMIN_EMAIL_KEY);
if (rememberedAdminEmail) {
  adminEmailInput.value = rememberedAdminEmail;
  document.getElementById('remember-me').checked = true;
}

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

  errorBox.classList.add('d-none');

  if (rememberMe) {
    localStorage.setItem(REMEMBERED_ADMIN_EMAIL_KEY, email);
  } else {
    localStorage.removeItem(REMEMBERED_ADMIN_EMAIL_KEY);
  }

  window.location.href = 'dashboard.html';
});
