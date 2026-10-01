/*
 * Donor/public sign-in form. There is no backend yet, so this validates
 * the fields client-side and sends the user on to the donor home page —
 * mirrors the same fake-auth approach already used by admin/script.js.
 */

(function () {
  const form = document.querySelector('.login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const rememberMeInput = document.getElementById('rememberMe');
  const errorBox = document.getElementById('loginError');
  const successBox = document.getElementById('loginSuccess');

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const REMEMBERED_EMAIL_KEY = 'camoc_remembered_email';

  const rememberedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
  if (rememberedEmail) {
    emailInput.value = rememberedEmail;
    rememberMeInput.checked = true;
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove('is-hidden');
  }

  function hideError() {
    errorBox.classList.add('is-hidden');
  }

  if (new URLSearchParams(window.location.search).get('registered') === '1') {
    successBox.textContent = 'Account created — please sign in.';
    successBox.classList.remove('is-hidden');
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

    if (rememberMeInput.checked) {
      localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    } else {
      localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }

    window.location.href = '../donor/index.html';
  });
})();
