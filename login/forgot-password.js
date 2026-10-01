/*
 * Forgot-password form. There is no backend/email service yet, so this
 * just validates the email client-side and shows the standard
 * "check your inbox" confirmation without revealing whether the account
 * actually exists.
 */

(function () {
  const form = document.querySelector('.forgot-password-form');
  const emailInput = document.getElementById('email');
  const errorBox = document.getElementById('forgotError');
  const successBox = document.getElementById('forgotSuccess');

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function showError(message) {
    successBox.classList.add('is-hidden');
    errorBox.textContent = message;
    errorBox.classList.remove('is-hidden');
  }

  function showSuccess(message) {
    errorBox.classList.add('is-hidden');
    successBox.textContent = message;
    successBox.classList.remove('is-hidden');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const email = emailInput.value.trim();

    if (!email) {
      showError('Please enter your email address.');
      return;
    }

    if (!EMAIL_PATTERN.test(email)) {
      showError('Please enter a valid email address.');
      return;
    }

    showSuccess('If an account exists for ' + email + ', a reset link has been sent.');
    form.reset();
  });
})();
