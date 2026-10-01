/*
 * Registration form. There is no backend yet, so this validates the
 * fields client-side and sends the new user back to the login page to
 * sign in, like a normal register-then-login flow.
 */

(function () {
  const form = document.querySelector('.register-form');
  const fullnameInput = document.getElementById('fullname');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const confirmPasswordInput = document.getElementById('confirm-password');
  const errorBox = document.getElementById('registerError');

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove('is-hidden');
  }

  function hideError() {
    errorBox.classList.add('is-hidden');
  }

  function selectedRole() {
    const checked = form.querySelector('input[name="role"]:checked');
    return checked ? checked.value : null;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const fullname = fullnameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    const role = selectedRole();

    if (!fullname || !email || !password || !confirmPassword) {
      showError('Please fill in every field.');
      return;
    }

    if (!EMAIL_PATTERN.test(email)) {
      showError('Please enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      showError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      showError('Passwords do not match.');
      return;
    }

    if (!role) {
      showError('Please choose whether you are registering as an Admin, Donor, or Orphanage.');
      return;
    }

    hideError();
    window.location.href = 'index.html?registered=1';
  });
})();
