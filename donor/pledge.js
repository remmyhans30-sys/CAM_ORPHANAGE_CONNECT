/*
 * The "Pledge to a need" window (#donateModal), used on the Give page and on an orphanage's
 * profile page. Each page has the window's HTML; this file runs it.
 *   CocPledge.open({ apiBase, token, orphanage: { id, name }, need, onPledged, onExpired })
 * `need` is { id, title, goal, raised, percent }. After a pledge, its raised amount and percent
 * are updated and onPledged(need) lets the page redraw. Without a token the window asks the
 * person to sign in instead.
 * After pledging, the window shows the pledge's reference and how to give: the donor sends the
 * money directly to the home's account, once the CAM Orphanage Connect team has confirmed it.
 */

(function () {
  const MIN_PLEDGE = 500;

  const donateModal = new bootstrap.Modal(document.getElementById('donateModal'));
  const donateForm = document.getElementById('donateForm');
  const donateOrphanageName = document.getElementById('donateOrphanageName');
  const donateNeedTitle = document.getElementById('donateNeedTitle');
  const donateProgressBar = document.getElementById('donateProgressBar');
  const donateProgressLabel = document.getElementById('donateProgressLabel');
  const donateAmount = document.getElementById('donateAmount');
  const pledgeAnonymous = document.getElementById('pledgeAnonymous');
  const pledgeFields = document.getElementById('pledgeFields');
  const signInPrompt = document.getElementById('signInPrompt');
  const donateError = document.getElementById('donateError');
  const donateAlert = document.getElementById('donateAlert');
  const donateSubmit = document.getElementById('donateSubmit');
  const pledgePayTo = document.getElementById('pledgePayTo');

  let active = null;

  function formatXAF(amount) {
    return Number(amount || 0).toLocaleString('en-US') + ' XAF';
  }

  function needPercent(need) {
    return Math.max(0, Math.min(100, need.percent || 0));
  }

  function showNeedProgress(need) {
    const pct = needPercent(need);
    donateProgressBar.style.width = pct + '%';
    donateProgressBar.classList.toggle('is-funded', need.raised >= need.goal);
    donateProgressLabel.textContent = formatXAF(need.raised) + ' pledged of ' + formatXAF(need.goal) + ' (' + pct + '%)';
  }

  function addLine(parent, tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    parent.appendChild(node);
    return node;
  }

  // The reference, and where to send the money if the team has confirmed the home's account.
  function showHowToGive(pledge) {
    pledgePayTo.innerHTML = '';
    addLine(pledgePayTo, 'p', 'Your pledge reference: ' + pledge.reference, 'pledge-payto-ref');
    if (pledge.payTo) {
      addLine(pledgePayTo, 'p', 'To give, send the money directly to the home. Our team has confirmed this account belongs to it:', 'mb-2');
      const details = document.createElement('dl');
      details.className = 'pledge-payto-account';
      [['Pay with', pledge.payTo.provider], ['Account name', pledge.payTo.accountName], ['Number', pledge.payTo.accountNumber]].forEach(function (row) {
        addLine(details, 'dt', row[0]);
        addLine(details, 'dd', row[1] || '—');
      });
      pledgePayTo.appendChild(details);
      addLine(pledgePayTo, 'p', 'Write ' + pledge.reference + ' in the payment note. The home marks your pledge as received when the money arrives. You can find these details again under My profile.', 'small mb-0');
    } else {
      addLine(pledgePayTo, 'p', 'Our team has not confirmed this home\'s payment account yet. As soon as it does, the details appear with your pledge under My profile.', 'small mb-0');
    }
    pledgePayTo.classList.remove('d-none');
  }

  function open(options) {
    active = options;

    donateOrphanageName.textContent = options.orphanage.name;
    donateNeedTitle.textContent = options.need.title;
    showNeedProgress(options.need);

    donateForm.reset();
    document.querySelectorAll('.btn-quick-amount').forEach(function (b) { b.classList.remove('active'); });
    donateError.classList.add('d-none');
    donateAlert.classList.add('d-none');
    pledgePayTo.classList.add('d-none');

    const signedIn = Boolean(options.token);
    signInPrompt.classList.toggle('d-none', signedIn);
    pledgeFields.classList.toggle('d-none', !signedIn);
    donateSubmit.classList.toggle('d-none', !signedIn);
    donateSubmit.disabled = false;
    donateAmount.required = signedIn;

    donateModal.show();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const pledge = active;
    if (!pledge || !pledge.token) return;

    const need = pledge.need;
    const amount = Number(donateAmount.value);
    const remaining = need.goal - need.raised;
    donateError.classList.add('d-none');

    if (!Number.isInteger(amount) || amount < MIN_PLEDGE) {
      donateError.textContent = 'Pledges start at ' + formatXAF(MIN_PLEDGE) + '.';
      donateError.classList.remove('d-none');
      return;
    }
    if (amount > remaining) {
      donateError.textContent = 'Only ' + formatXAF(remaining) + ' is still needed for this need.';
      donateError.classList.remove('d-none');
      return;
    }

    donateSubmit.disabled = true;
    try {
      let response;
      try {
        response = await fetch(pledge.apiBase + '/pledges', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + pledge.token },
          body: JSON.stringify({ needId: need.id, amount: amount, anonymous: pledgeAnonymous.checked })
        });
      } catch (err) {
        throw new Error('Cannot reach the server. Please try again.');
      }
      const data = await response.json().catch(function () { return {}; });
      if (response.status === 401) {
        if (pledge.onExpired) pledge.onExpired();
        throw new Error('Your session has expired. Please sign in again.');
      }
      if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');

      need.raised = data.need.raised;
      need.percent = data.need.percent;
      showNeedProgress(need);
      donateAlert.textContent = 'Thank you! Your pledge of ' + formatXAF(amount) + ' to ' + pledge.orphanage.name + ' has been recorded.';
      donateAlert.classList.remove('d-none');
      if (data.pledge) showHowToGive(data.pledge);
      pledgeFields.classList.add('d-none');
      donateSubmit.classList.add('d-none');
      if (pledge.onPledged) pledge.onPledged(need);
    } catch (err) {
      donateError.textContent = err.message;
      donateError.classList.remove('d-none');
      donateSubmit.disabled = false;
    }
  }

  document.querySelectorAll('.btn-quick-amount').forEach(function (btn) {
    btn.addEventListener('click', function () {
      donateAmount.value = btn.dataset.amount;
      document.querySelectorAll('.btn-quick-amount').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
    });
  });

  donateForm.addEventListener('submit', handleSubmit);

  window.CocPledge = { open: open };
})();
