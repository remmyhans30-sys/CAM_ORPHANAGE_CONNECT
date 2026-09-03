document.getElementById('admin-login-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const email = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-password').value;
  const errorBox = document.getElementById('login-error');

  if (!email || !password) {
    errorBox.textContent = 'Please enter both email and password.';
    errorBox.classList.remove('d-none');
    return;
  }

  errorBox.classList.add('d-none');
  window.location.href = 'orphanages.html';
});
