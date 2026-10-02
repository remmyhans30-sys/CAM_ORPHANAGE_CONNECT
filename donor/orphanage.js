/*
 * One orphanage's full profile, for approved donors, opened from the Give page as
 * orphanage.html?id=<id>: its story, what the CAM Orphanage Connect team checked, the support it
 * has had so far, its needs (pledge.js runs the pledge window), and the stories, updates and
 * videos it shares (../shared/updates.js). The home's phone and email are not shown: donors reach
 * a home through messages and visit requests. Its payment account appears only after a pledge.
 */

(function () {
  // Local copies talk to the server on this computer; the live site uses its own address.
  const API_BASE = (window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname) ? 'http://localhost:4000' : '') + '/api';
  const SESSION_KEY = 'cocSession';

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

  // Profiles are for approved donors. The Give page explains how to sign in or get approved.
  const session = readSession();
  if (!session || session.role !== 'user' || !session.token) {
    window.location.replace('index.html');
    return;
  }

  document.getElementById('logoutLink').addEventListener('click', clearSession);
  window.watchUnread({ base: API_BASE, token: session.token }, function (count) {
    document.getElementById('navMessagesDot').classList.toggle('d-none', count === 0);
  });

  const orphanageId = Number(new URLSearchParams(window.location.search).get('id'));
  const loadingState = document.getElementById('loadingState');
  const loadError = document.getElementById('loadError');
  const profileContent = document.getElementById('profileContent');
  const needsList = document.getElementById('needsList');

  let home = null;
  let openNeeds = [];

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value === null || value === undefined ? '' : String(value);
    return div.innerHTML;
  }

  function formatXAF(amount) {
    return Number(amount || 0).toLocaleString('en-US') + ' XAF';
  }

  function plural(count, one, many) {
    return Number(count).toLocaleString('en-US') + ' ' + (count === 1 ? one : many);
  }

  function initials(name) {
    const words = (name || '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  function prettyDate(value, withDay) {
    const d = new Date(String(value) + 'T00:00:00');
    if (isNaN(d)) return value;
    return d.toLocaleDateString('en-GB', withDay === false ? { month: 'long', year: 'numeric' } : { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function expired() {
    clearSession();
    window.location.replace('index.html');
  }

  async function fetchProfile() {
    let response;
    try {
      response = await fetch(API_BASE + '/browse/orphanages/' + orphanageId, {
        headers: { Authorization: 'Bearer ' + session.token }
      });
    } catch (err) {
      throw new Error('Cannot reach the server. Please try again in a moment.');
    }
    if (response.status === 401) {
      expired();
      return null;
    }
    if (response.status === 403) {
      window.location.replace('index.html');
      return null;
    }
    const data = await response.json().catch(function () { return {}; });
    if (response.status === 404) throw new Error('This orphanage could not be found. It may no longer be listed.');
    if (!response.ok) throw new Error(data.error || 'Could not load this profile. Please try again later.');
    return data;
  }

  // ---- the parts of the page ----------------------------------------------------

  function renderHeader(o) {
    document.title = o.name + ' - CAM Orphanage Connect';
    document.getElementById('homeName').textContent = o.name;
    document.getElementById('homeLocation').textContent = (o.location || 'Cameroon') +
      (o.foundedYear ? ' · Caring for children since ' + o.foundedYear : '');

    // A photo that cannot be shown falls back to a plain band and the home's initials.
    const cover = document.getElementById('homeCover');
    cover.innerHTML = '';
    cover.classList.toggle('is-empty', !o.coverPhotoUrl);
    if (o.coverPhotoUrl) {
      const img = document.createElement('img');
      img.alt = '';
      img.addEventListener('error', function () {
        img.remove();
        cover.classList.add('is-empty');
      });
      img.src = o.coverPhotoUrl;
      cover.appendChild(img);
    }

    const avatar = document.getElementById('homeAvatar');
    avatar.textContent = initials(o.name);
    if (o.photoUrl) {
      const img = document.createElement('img');
      img.alt = '';
      img.addEventListener('error', function () { avatar.textContent = initials(o.name); });
      img.src = o.photoUrl;
      avatar.textContent = '';
      avatar.appendChild(img);
    }

    document.getElementById('messageLink').href = 'messages.html?with=orphanage-' + o.id;
  }

  function renderTiles(o, needs) {
    const tiles = [
      [o.childrenCount ? o.childrenCount : '—', 'Children in care'],
      [o.capacity ? o.capacity : '—', 'Capacity'],
      [o.foundedYear ? o.foundedYear : '—', 'Founded'],
      [needs.length, needs.length === 1 ? 'Open need' : 'Open needs']
    ];
    document.getElementById('homeTiles').innerHTML = tiles.map(function (tile) {
      return (
        '<div class="col-6 col-md-3">' +
          '<div class="home-tile">' +
            '<strong>' + escapeHtml(tile[0]) + '</strong>' +
            '<span>' + escapeHtml(tile[1]) + '</span>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  function renderStory(o) {
    const story = document.getElementById('homeStory');
    story.innerHTML = '';
    const paragraphs = String(o.story || '').split(/\n{2,}/).map(function (p) { return p.trim(); }).filter(Boolean);
    if (paragraphs.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'text-muted mb-0';
      empty.textContent = 'This home has not written its story yet. You can message it to ask.';
      story.appendChild(empty);
    }
    paragraphs.forEach(function (text) {
      const p = document.createElement('p');
      p.textContent = text;
      story.appendChild(p);
    });

    const language = document.getElementById('storyLanguage');
    language.textContent = o.storyLanguage === 'fr' ? 'Written by the home in French.' : '';
    language.classList.toggle('d-none', o.storyLanguage !== 'fr');
  }

  function renderTrust(o) {
    const facts = [
      ['Verified', 'By the CAM Orphanage Connect team' + (o.verifiedDate ? ' on ' + prettyDate(o.verifiedDate) : '')],
      ['Registration number', o.registrationNumber],
      ['Contact person', o.contactName],
      ['Payment account', o.paymentAccountChecked ? 'Confirmed by our team as the home\'s own account, not a personal one' : null],
      ['On this site since', o.joinedDate ? prettyDate(o.joinedDate, false) : null]
    ];
    document.getElementById('trustFacts').innerHTML = facts
      .filter(function (fact) { return fact[1]; })
      .map(function (fact) { return '<dt>' + escapeHtml(fact[0]) + '</dt><dd>' + escapeHtml(fact[1]) + '</dd>'; })
      .join('');
  }

  function renderRecord(record, metNeeds, updatesCount) {
    const lines = [];
    if (metNeeds.length) lines.push(plural(metNeeds.length, 'need fully pledged', 'needs fully pledged'));
    if (record.itemGifts) lines.push(plural(record.itemGifts, 'gift of items', 'gifts of items'));
    lines.push(updatesCount ? plural(updatesCount, 'story or update shared', 'stories and updates shared') : 'No stories or updates shared yet');

    document.getElementById('recordPanel').innerHTML =
      (record.supporters
        ? '<p class="home-record-total">' + escapeHtml(formatXAF(record.totalPledged)) + '</p>' +
          '<p class="small text-muted">pledged or given so far by ' + escapeHtml(plural(record.supporters, 'supporter', 'supporters')) + '</p>'
        : '<p class="mb-3">No pledges yet. Yours could be the first.</p>') +
      '<ul class="home-record-list">' + lines.map(function (line) { return '<li>' + escapeHtml(line) + '</li>'; }).join('') + '</ul>';
  }

  function needRowHtml(need) {
    const pct = Math.max(0, Math.min(100, need.percent || 0));
    return (
      '<div class="need-row">' +
        '<div class="need-row-top">' +
          '<span class="need-title">' + escapeHtml(need.title) + '</span>' +
          '<span class="need-amounts">' + formatXAF(need.raised) + ' of ' + formatXAF(need.goal) + '</span>' +
        '</div>' +
        (need.description ? '<p class="need-description">' + escapeHtml(need.description) + '</p>' : '') +
        '<div class="progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
          '<div class="progress-bar" style="width:' + pct + '%"></div>' +
        '</div>' +
        '<div class="need-row-bottom">' +
          '<span class="need-percent">' + pct + '% pledged</span>' +
          '<button type="button" class="btn btn-donor-primary btn-sm donate-btn" data-need-id="' + need.id + '">Pledge</button>' +
        '</div>' +
      '</div>'
    );
  }

  function renderNeeds(needs, metNeeds) {
    openNeeds = needs;
    needsList.innerHTML = needs.length
      ? needs.map(needRowHtml).join('')
      : '<p class="text-muted small mb-0">No open needs right now. You can still message the home or follow its updates below.</p>';

    document.getElementById('metNeedsBlock').classList.toggle('d-none', metNeeds.length === 0);
    document.getElementById('metNeedsList').innerHTML = metNeeds.map(function (need) {
      return '<li><span>' + escapeHtml(need.title) + '</span><span class="home-met-amount">' + escapeHtml(formatXAF(need.goal)) + '</span></li>';
    }).join('');
  }

  function renderGallery(gallery) {
    const list = document.getElementById('galleryList');
    list.innerHTML = '';
    (gallery || []).forEach(function (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      list.appendChild(img);
    });
    document.getElementById('gallerySection').classList.toggle('d-none', list.children.length === 0);
  }

  function render(data) {
    home = data.orphanage;
    renderHeader(home);
    renderTiles(home, data.needs);
    renderStory(home);
    renderTrust(home);
    renderRecord(data.record, data.metNeeds, home.updatesCount);
    renderNeeds(data.needs, data.metNeeds);
    renderGallery(home.gallery);
  }

  // After a pledge the totals and needs change, so they are loaded again.
  async function refresh() {
    try {
      const data = await fetchProfile();
      if (data) render(data);
    } catch (err) {
      // The pledge itself was saved; the page shows fresh numbers next time it opens.
    }
  }

  needsList.addEventListener('click', function (e) {
    const btn = e.target.closest('.donate-btn');
    if (!btn || !home) return;
    const need = openNeeds.find(function (n) { return n.id === Number(btn.dataset.needId); });
    if (!need) return;
    window.CocPledge.open({
      apiBase: API_BASE,
      token: session.token,
      orphanage: { id: home.id, name: home.name },
      need: need,
      onPledged: refresh,
      onExpired: clearSession
    });
  });

  document.getElementById('visitBtn').addEventListener('click', function () {
    if (!home) return;
    window.CocVisits.request({
      apiBase: API_BASE,
      token: session.token,
      orphanageId: home.id,
      orphanageName: home.name,
      onExpired: expired
    });
  });

  async function load() {
    try {
      if (!Number.isInteger(orphanageId) || orphanageId <= 0) {
        throw new Error('This orphanage could not be found. It may no longer be listed.');
      }
      const data = await fetchProfile();
      if (!data) return;
      render(data);
      profileContent.classList.remove('d-none');
      window.CocUpdates.mount(document.getElementById('updatesPanel'), {
        apiBase: API_BASE,
        token: session.token,
        endpoint: '/browse/orphanages/' + orphanageId + '/updates',
        onExpired: expired
      });
    } catch (err) {
      loadError.textContent = err.message;
      loadError.classList.remove('d-none');
    }
    loadingState.classList.add('d-none');
  }

  load();
})();
