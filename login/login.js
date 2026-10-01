/*
 * Donor/public sign-in form. There is no backend yet, so this validates
 * the fields client-side and sends the user on to the donor home page —
 * mirrors the same fake-auth approach already used by admin/script.js.
 */

(function () {
  const form = document.querySelector('.login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const errorBox = document.getElementById('loginError');

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove('is-hidden');
  }

  function hideError() {
    errorBox.classList.add('is-hidden');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showError('Please enter both email and password.');
      return;
    }

    if (!EMAIL_PATTERN.test(email)) {
      showError('Please enter a valid email address.');
      return;
    }

    hideError();
    window.location.href = '../donor/index.html';
  });
})();
