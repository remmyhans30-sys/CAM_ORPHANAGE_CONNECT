/*
 * Donor messages page: chat with the CAM team and with orphanages.
 * A link such as messages.html?with=orphanage-5 opens (or starts) the chat with that orphanage.
 */
(function () {
  // Local copies talk to the server on this computer; the live site uses its own address.
  const API_ROOT = (window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname) ? 'http://localhost:4000' : '') + '/api';
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

  const session = readSession();
  if (!session || session.role !== 'user' || !session.token) {
    window.location.replace('../login/index.html');
    return;
  }

  document.getElementById('logoutLink').addEventListener('click', clearSession);

  const config = {
    base: API_ROOT,
    token: session.token,
    onExpired: function () {
      clearSession();
      window.location.replace('../login/index.html');
    }
  };

  let startWith = null;
  const match = /^orphanage-(\d+)$/.exec(new URLSearchParams(window.location.search).get('with') || '');
  if (match) startWith = { type: 'orphanage', id: Number(match[1]) };

  window.createChat({
    root: document.getElementById('chat-root'),
    api: window.createUserChatApi(config),
    startWith: startWith,
    onUnread: function (count) {
      document.getElementById('navMessagesDot').classList.toggle('d-none', count === 0);
    }
  });
})();
