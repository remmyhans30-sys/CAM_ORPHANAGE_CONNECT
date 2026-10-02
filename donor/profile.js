/*
 * Donor profile page: the signed-in donor edits their details and sees their pledges.
 */

(function () {
  // Local copies talk to the server on this computer; the live site uses its own address.
  const API_ROOT = (window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname) ? 'http://localhost:4000' : '') + '/api';
  const SESSION_KEY = 'cocSession';
  const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

  function readSession() {
    const raw = window.sessionStorage.getItem(SESSION_KEY) || window.localStorage.getItem(SESSION_KEY);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function clearSession() {
    window.sessionStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(SESSION_KEY);
  }

  const session = readSession();
  if (!session || session.role !== 'user' || !session.token) {
    window.location.replace('../login/index.html');
    return;
  }

  document.getElementById('logoutLink').addEventListener('click', clearSession);

  const loadError = document.getElementById('profileLoadError');
  const form = document.getElementById('profileForm');
  const saveBtn = document.getElementById('saveProfileBtn');
  const profileError = document.getElementById('profileError');
  const profileSaved = document.getElementById('profileSaved');
  const photoBox = document.getElementById('profilePhoto');
  const photoInput = document.getElementById('photoInput');

  const FIELDS = {
    name: 'donorName',
    location: 'donorLocation',
    referredBy: 'donorReferred',
    preferredPayment: 'donorPayment',
    preferredCurrency: 'donorCurrency'
  };

  function show(box, message) {
    box.textContent = message;
    box.classList.remove('d-none');
  }

  function hide(box) {
    box.classList.add('d-none');
  }

  async function api(path, options) {
    const opts = options || {};
    let response;
    try {
      response = await fetch(API_ROOT + path, {
        method: opts.method || 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.token },
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
    } catch (err) {
      throw new Error('Cannot reach the server. Please try again in a moment.');
    }
    if (response.status === 401) {
      clearSession();
      window.location.replace('../login/index.html');
      throw new Error('Your session has expired. Please sign in again.');
    }
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  function initials(name) {
    const words = (name || '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  function fill(donor) {
    Object.keys(FIELDS).forEach(function (key) {
      document.getElementById(FIELDS[key]).value = donor[key] || '';
    });
    document.getElementById('donorEmail').value = donor.email || '';
    renderApproval(donor);
    document.getElementById('profileGreeting').textContent = 'Welcome, ' + donor.name;

    photoBox.innerHTML = '';
    if (donor.photoUrl) {
      const img = document.createElement('img');
      img.src = donor.photoUrl;
      img.alt = '';
      photoBox.appendChild(img);
    } else {
      photoBox.textContent = initials(donor.name);
    }
  }

  function renderApproval(donor) {
    const note = document.getElementById('approvalNote');
    const views = {
      pending: ['alert-warning', 'Your account is waiting for approval by the CAM Orphanage Connect team. Once approved, you can browse orphanages and give. Completing your profile helps us review it faster.'],
      active: ['alert-success', 'Your account is approved. You can browse orphanages and give.'],
      rejected: ['alert-danger', 'Your account was not approved' + (donor.statusReason ? ': ' + donor.statusReason : '.') + ' Please contact the CAM Orphanage Connect team.'],
      flagged: ['alert-warning', 'Your account is under review by the CAM Orphanage Connect team.']
    };
    const view = views[donor.status];
    if (!view) return;
    note.className = 'alert ' + view[0];
    note.textContent = view[1];
  }

  function formatXAF(amount) {
    return Number(amount || 0).toLocaleString('en-US') + ' XAF';
  }

  function renderPledges(pledges) {
    const body = document.getElementById('pledgeBody');
    if (pledges.length === 0) return;

    body.innerHTML = '';
    let total = 0;
    pledges.forEach(function (pledge) {
      total += pledge.amount;
      const row = document.createElement('tr');
      const date = new Date(String(pledge.createdAt).replace(' ', 'T') + 'Z');
      [
        isNaN(date) ? pledge.createdAt : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        pledge.orphanageName,
        pledge.needTitle,
        formatXAF(pledge.amount)
      ].forEach(function (text, index) {
        const cell = document.createElement('td');
        cell.textContent = text;
        if (index === 3) cell.className = 'text-end';
        row.appendChild(cell);
      });
      row.appendChild(statusCell(pledge));
      body.appendChild(row);
    });
    document.getElementById('pledgeSummary').textContent =
      pledges.length + (pledges.length === 1 ? ' pledge' : ' pledges') + ', ' + formatXAF(total) + ' in total. ' +
      'You give directly to each home, with the reference in the payment note; the home marks the pledge as received. No money is charged on this site.';
  }

  // Received, or still to give: then where to send it (once the team has confirmed the home's account).
  function statusCell(pledge) {
    const cell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'pledge-status ' + (pledge.received ? 'is-received' : 'is-pledged');
    badge.textContent = pledge.received ? 'Received' : 'Pledged';
    cell.appendChild(badge);
    if (!pledge.received) {
      const howTo = document.createElement('p');
      howTo.className = 'pledge-howto';
      howTo.textContent = pledge.payTo
        ? 'Send to ' + pledge.payTo.provider + ' ' + pledge.payTo.accountNumber + ' (' + pledge.payTo.accountName + '), reference ' + pledge.reference + '.'
        : 'Reference ' + pledge.reference + '. The home\'s payment account is still being checked by our team; the details will appear here.';
      cell.appendChild(howTo);
    }
    return cell;
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    hide(profileError);
    hide(profileSaved);

    const body = {};
    Object.keys(FIELDS).forEach(function (key) {
      body[key] = document.getElementById(FIELDS[key]).value.trim();
    });
    if (!body.name) {
      show(profileError, 'Please enter your name.');
      return;
    }

    saveBtn.disabled = true;
    try {
      const data = await api('/my-donor', { method: 'PUT', body: body });
      fill(data.donor);
      profileSaved.classList.remove('d-none');
      const stored = readSession();
      if (stored) {
        stored.fullname = data.donor.name;
        const store = window.sessionStorage.getItem(SESSION_KEY) ? window.sessionStorage : window.localStorage;
        store.setItem(SESSION_KEY, JSON.stringify(stored));
      }
    } catch (err) {
      show(profileError, err.message);
    }
    saveBtn.disabled = false;
  });

  document.getElementById('photoBtn').addEventListener('click', function () {
    photoInput.value = '';
    photoInput.click();
  });

  photoInput.addEventListener('change', function () {
    const file = photoInput.files[0];
    if (!file) return;
    hide(profileError);
    hide(profileSaved);

    if (file.size > MAX_UPLOAD_BYTES) {
      show(profileError, 'That photo is too large. The limit is 3 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async function () {
      try {
        const data = await api('/my-donor/photo', { method: 'POST', body: { filename: file.name, data: String(reader.result) } });
        fill(data.donor);
      } catch (err) {
        show(profileError, err.message);
      }
    };
    reader.onerror = function () { show(profileError, 'Could not read that file. Please try another one.'); };
    reader.readAsDataURL(file);
  });

  window.watchUnread({ base: API_ROOT, token: session.token }, function (count) {
    document.getElementById('navMessagesDot').classList.toggle('d-none', count === 0);
  });

  async function load() {
    try {
      const profile = await api('/my-donor');
      fill(profile.donor);
      const pledges = await api('/pledges/mine');
      renderPledges(pledges.pledges);
    } catch (err) {
      show(loadError, err.message);
    }
  }

  load();
})();
