// "Send the link again" for email confirmation, on the donor, orphanage and partner pages.
// Each page passes its API address (ending in /api), its sign-in token and its own button class.
(function () {
  async function resend(apiRoot, token) {
    let response;
    try {
      response = await fetch(apiRoot + '/account/confirm-email/resend', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
    } catch (err) {
      throw new Error('Cannot reach the server. Please try again in a moment.');
    }
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || 'Could not send the link. Please try again later.');
    return data.message;
  }

  // A button, and below it the line that says what happened (or in `resultElement`, if given).
  function resendControl(apiRoot, token, buttonClass, resultElement) {
    const wrap = document.createElement('div');
    wrap.className = 'email-confirm-resend';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = buttonClass;
    button.innerHTML = '<i class="bi bi-envelope"></i> Send the link again';
    let result = resultElement;
    if (!result) {
      result = document.createElement('div');
      result.setAttribute('role', 'status');
      result.style.cssText = 'font-size: 0.875em; margin-top: 0.35rem;';
    }
    result.classList.add('email-confirm-result');
    button.addEventListener('click', async function () {
      button.disabled = true;
      result.textContent = 'Sending...';
      try {
        result.textContent = await resend(apiRoot, token);
      } catch (err) {
        result.textContent = err.message;
      }
      button.disabled = false;
    });
    wrap.appendChild(button);
    if (!resultElement) wrap.appendChild(result);
    return wrap;
  }

  window.CocEmailConfirm = { resend: resend, resendControl: resendControl };
})();
