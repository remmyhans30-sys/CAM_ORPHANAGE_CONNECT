document.getElementById('toggle-password-btn').addEventListener('click', function () {
  const passwordInput = document.getElementById('partner-password');
  const isHidden = passwordInput.type === 'password';
  passwordInput.type = isHidden ? 'text' : 'password';
  this.textContent = isHidden ? 'Hide' : 'Show';
});

document.getElementById('partner-login-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const email = document.getElementById('partner-email').value.trim();
  const password = document.getElementById('partner-password').value;
  const errorBox = document.getElementById('login-error');

  if (!email || !password) {
    errorBox.textContent = 'Please enter both email and password.';
    errorBox.classList.remove('d-none');
    return;
  }

  errorBox.classList.add('d-none');

  const submitBtn = this.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in...';

  apiRequest('/partner-auth/login', { method: 'POST', body: { email: email, password: password } })
    .then(function (data) {
      localStorage.setItem('partnerToken', data.token);
      localStorage.setItem('partnerEmail', data.partner.email);
      window.location.href = 'dashboard.html';
    })
    .catch(function (err) {
      errorBox.textContent = err.message || 'Could not reach the server. Is the backend running?';
      errorBox.classList.remove('d-none');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in';
    });
});
