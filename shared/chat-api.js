/*
 * Connects the chat window (chat.js) to the signed-in donor's or orphanage's messages on the server.
 *   const api = createUserChatApi({ base: '/api', token: session.token, onExpired: function () { ... } });
 */
(function () {
  window.createUserChatApi = function (config) {
    const root = config.base + '/my-messages';

    async function call(path, options) {
      const opts = options || {};
      let response;
      try {
        response = await fetch(root + path, {
          method: opts.method || 'GET',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.token },
          body: opts.body ? JSON.stringify(opts.body) : undefined
        });
      } catch (err) {
        throw new Error('Cannot reach the server. Please try again in a moment.');
      }
      if (response.status === 401) {
        if (config.onExpired) config.onExpired();
        throw new Error('Your session has expired. Please sign in again.');
      }
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
      return data;
    }

    return {
      list: function () { return call('/overview'); },
      open: function (key) {
        return key === 'team' ? call('/team') : call('/chats/' + encodeURIComponent(key));
      },
      send: function (key, text) {
        return key === 'team'
          ? call('/team/reply', { method: 'POST', body: { text: text } })
          : call('/chats/' + encodeURIComponent(key) + '/messages', { method: 'POST', body: { text: text } });
      },
      contacts: function () { return call('/contacts'); },
      start: function (contact, text) {
        return call('/chats', { method: 'POST', body: { withType: contact.type, withId: contact.id, text: text } });
      },
      unread: function () { return call('/unread'); }
    };
  };
})();

// Calls back with the number of unread conversations now and every 30 seconds.
window.watchUnread = function (config, callback) {
  const api = window.createUserChatApi(config);
  function tick() {
    api.unread().then(function (data) { callback(data.unread); }).catch(function () {});
  }
  tick();
  setInterval(function () { if (!document.hidden) tick(); }, 30000);
};
