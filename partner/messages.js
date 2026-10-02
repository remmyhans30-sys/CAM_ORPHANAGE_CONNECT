if (!localStorage.getItem('partnerToken')) { window.location.href = 'index.html'; }

// Partner messages: the same chat window as everyone else. A link such as
// messages.html?with=orphanage-5 opens (or starts) the chat with that orphanage.
(function () {
  let startWith = null;
  const match = /^orphanage-(\d+)$/.exec(new URLSearchParams(window.location.search).get('with') || '');
  if (match) startWith = { type: 'orphanage', id: Number(match[1]) };

  window.createChat({
    root: document.getElementById('chat-root'),
    api: window.createUserChatApi({
      base: API_BASE,
      token: localStorage.getItem('partnerToken'),
      onExpired: function () {
        localStorage.removeItem('partnerToken');
        localStorage.removeItem('partnerEmail');
        window.location.href = 'index.html';
      }
    }),
    startWith: startWith
  });
})();
