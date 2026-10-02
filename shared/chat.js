/*
 * A small chat window used by the orphanage portal and the donor pages.
 *
 *   const chat = createChat({
 *     root: document.getElementById('chat-root'),
 *     api: { list, open, send, contacts, start },   // see below
 *     startWith: { type: 'orphanage', id: 5, name: 'Hope House' },   // optional deep link
 *     onUnread: function (count) { ... }
 *   });
 *
 * api.list()                 -> { conversations: [{ key, title, counterpartType, counterpartId, unread, lastText, lastAt }], locked }
 * api.open(key)              -> { conversation: { key, title, messages: [{ text, timestamp, mine, label }] } }
 * api.send(key, text)        -> { conversation }
 * api.contacts()             -> { contacts: [{ type, id, name, subtitle }], locked }
 * api.start(contact, text)   -> { conversation }
 *
 * Everything shown is inserted as text, never as HTML.
 */
(function () {
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatTime(iso) {
    if (!iso) return '';
    const date = new Date(String(iso).replace(' ', 'T'));
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    return sameDay
      ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function initials(name) {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  const TYPE_LABELS = {
    team: 'CAM team', orphanage: 'Orphanage', donor: 'Donor', partner: 'Partner',
    'chat-do': 'Donor and orphanage', 'chat-po': 'Partner and orphanage'
  };

  window.createChat = function (options) {
    const api = options.api;
    const root = options.root;
    const POLL_LIST_MS = options.pollListMs || 15000;
    const POLL_OPEN_MS = options.pollOpenMs || 5000;
    let filterFn = options.filter || null;

    let conversations = [];
    let lockedReason = null;
    let activeKey = null;
    let mode = 'empty'; // 'empty' | 'chat' | 'new'
    let lastRenderedCount = -1;
    let contactsCache = null;
    let busy = false;

    root.innerHTML = '';
    root.classList.add('chat');

    const listPane = el('aside', 'chat-list');
    const listHead = el('div', 'chat-list-head');
    listHead.appendChild(el('h2', 'chat-list-title', options.listTitle || 'Messages'));
    const newBtn = el('button', 'chat-btn chat-btn-small', '+ New');
    newBtn.type = 'button';
    if (options.allowNew === false) newBtn.style.display = 'none';
    listHead.appendChild(newBtn);
    const lockNote = el('p', 'chat-lock-note');
    lockNote.style.display = 'none';
    const listBody = el('ul', 'chat-items');
    listPane.appendChild(listHead);
    listPane.appendChild(lockNote);
    listPane.appendChild(listBody);

    const pane = el('section', 'chat-pane');
    root.appendChild(listPane);
    root.appendChild(pane);

    // ------------------------------------------------------------ list
    function renderList() {
      listBody.innerHTML = '';
      lockNote.style.display = lockedReason ? '' : 'none';
      lockNote.textContent = lockedReason || '';

      const shown = filterFn ? conversations.filter(filterFn) : conversations;
      if (shown.length === 0) {
        listBody.appendChild(el('li', 'chat-no-items', options.emptyText || 'No conversations yet.'));
      }

      shown.forEach(function (conv) {
        const item = el('li', 'chat-item' + (conv.key === activeKey && mode === 'chat' ? ' active' : '') + (conv.unread ? ' unread' : ''));
        item.tabIndex = 0;
        item.appendChild(el('div', 'chat-avatar', initials(conv.title)));
        const text = el('div', 'chat-item-text');
        const top = el('div', 'chat-item-top');
        top.appendChild(el('strong', 'chat-item-title', conv.title));
        top.appendChild(el('span', 'chat-item-time', formatTime(conv.lastAt)));
        text.appendChild(top);
        text.appendChild(el('span', 'chat-type-tag', TYPE_LABELS[conv.counterpartType] || ''));
        (conv.badges || []).forEach(function (badge) {
          text.appendChild(el('span', 'chat-badge ' + (badge.className || ''), badge.text));
        });
        text.appendChild(el('div', 'chat-item-last', conv.lastText || ''));
        item.appendChild(text);
        if (conv.unread) item.appendChild(el('span', 'chat-dot'));
        item.addEventListener('click', function () { openConversation(conv.key); });
        item.addEventListener('keydown', function (e) { if (e.key === 'Enter') openConversation(conv.key); });
        listBody.appendChild(item);
      });
    }

    function reportUnread() {
      if (options.onUnread) options.onUnread(conversations.filter(function (c) { return c.unread; }).length);
    }

    async function refreshList() {
      try {
        const data = await api.list();
        conversations = data.conversations || [];
        lockedReason = data.locked || null;
        renderList();
        reportUnread();
      } catch (err) {
        // keep what we have; the next poll will try again
      }
    }

    // ------------------------------------------------------------ conversation pane
    function showEmpty() {
      mode = 'empty';
      activeKey = null;
      root.classList.remove('chat--pane-open');
      pane.innerHTML = '';
      const box = el('div', 'chat-empty');
      box.appendChild(el('h3', '', 'Pick a conversation'));
      box.appendChild(el('p', '', 'Choose a conversation on the left, or start a new one.'));
      pane.appendChild(box);
      renderList();
    }

    function buildComposer(onSend, placeholder) {
      const form = el('form', 'chat-form');
      const input = el('textarea', 'chat-input');
      input.rows = 2;
      input.maxLength = 2000;
      input.placeholder = placeholder || 'Write a message…';
      input.setAttribute('aria-label', 'Message');
      const button = el('button', 'chat-btn', 'Send');
      button.type = 'submit';
      const error = el('div', 'chat-error');
      error.style.display = 'none';

      async function submit() {
        const text = input.value.trim();
        if (!text || busy) return;
        busy = true;
        button.disabled = true;
        error.style.display = 'none';
        try {
          await onSend(text);
          input.value = '';
        } catch (err) {
          error.textContent = err.message;
          error.style.display = '';
        }
        busy = false;
        button.disabled = false;
        input.focus();
      }

      form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submit();
        }
      });

      const row = el('div', 'chat-form-row');
      row.appendChild(input);
      row.appendChild(button);
      form.appendChild(row);
      form.appendChild(error);
      return { form: form, input: input };
    }

    function backButton() {
      const back = el('button', 'chat-back', '← All conversations');
      back.type = 'button';
      back.addEventListener('click', showEmpty);
      return back;
    }

    function renderMessages(container, conv, keepScroll) {
      const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
      container.innerHTML = '';
      if (conv.messages.length === 0) {
        container.appendChild(el('p', 'chat-no-messages', 'No messages yet. Say hello!'));
      }
      conv.messages.forEach(function (m) {
        const bubble = el('div', 'chat-msg ' + (m.mine ? 'mine' : 'theirs'));
        bubble.appendChild(el('div', 'chat-msg-text', m.text));
        const meta = el('div', 'chat-msg-meta', (m.mine ? '' : m.label + ' · ') + formatTime(m.timestamp));
        if (options.messageActions) {
          options.messageActions(conv, m).forEach(function (action) {
            const link = el('button', 'chat-msg-action', action.label);
            link.type = 'button';
            link.addEventListener('click', async function () {
              try {
                await action.onClick();
                await reopen();
              } catch (err) {
                if (err && err.message !== 'Cancelled') window.alert(err.message);
              }
            });
            meta.appendChild(link);
          });
        }
        bubble.appendChild(meta);
        container.appendChild(bubble);
      });
      if (!keepScroll || nearBottom) container.scrollTop = container.scrollHeight;
    }

    function renderChat(conv, keepScroll) {
      let messagesBox = pane.querySelector('.chat-messages');
      if (!messagesBox || pane.dataset.key !== conv.key) {
        pane.innerHTML = '';
        pane.dataset.key = conv.key;
        pane.appendChild(backButton());
        const head = el('div', 'chat-pane-head');
        head.appendChild(el('div', 'chat-avatar', initials(conv.title)));
        const titles = el('div', '');
        titles.appendChild(el('strong', '', conv.title));
        titles.appendChild(el('div', 'chat-pane-sub', TYPE_LABELS[conv.counterpartType] || ''));
        head.appendChild(titles);
        pane.appendChild(head);
        if (options.renderHeader) {
          const extra = el('div', 'chat-pane-extra');
          options.renderHeader(conv, extra);
          pane.appendChild(extra);
        }

        messagesBox = el('div', 'chat-messages');
        pane.appendChild(messagesBox);

        const composer = buildComposer(async function (text) {
          const data = await api.send(conv.key, text);
          renderMessages(messagesBox, data.conversation, false);
          lastRenderedCount = data.conversation.messages.length;
          refreshList();
        });
        pane.appendChild(composer.form);
        keepScroll = false;
      }
      renderMessages(messagesBox, conv, keepScroll);
      lastRenderedCount = conv.messages.length;
    }

    async function openConversation(key) {
      try {
        const data = await api.open(key);
        activeKey = key;
        mode = 'chat';
        root.classList.add('chat--pane-open');
        pane.dataset.key = '';
        renderChat(data.conversation, false);
        const known = conversations.find(function (c) { return c.key === key; });
        if (known && known.unread) {
          known.unread = false;
          reportUnread();
        }
        renderList();
        refreshList();
      } catch (err) {
        pane.innerHTML = '';
        pane.appendChild(backButton());
        pane.appendChild(el('p', 'chat-error', err.message));
      }
    }

    async function reopen() {
      if (mode !== 'chat' || !activeKey) return;
      const data = await api.open(activeKey);
      renderChat(data.conversation, true);
    }

    async function pollOpen() {
      if (mode !== 'chat' || !activeKey || document.hidden || busy) return;
      try {
        const data = await api.open(activeKey);
        if (data.conversation.messages.length !== lastRenderedCount) {
          renderChat(data.conversation, true);
        }
      } catch (err) {
        // ignore; try again on the next poll
      }
    }

    // ------------------------------------------------------------ new conversation
    async function showNew(preselect) {
      mode = 'new';
      activeKey = null;
      root.classList.add('chat--pane-open');
      pane.dataset.key = '';
      pane.innerHTML = '';
      pane.appendChild(backButton());
      pane.appendChild(el('h3', 'chat-new-title', 'New message'));
      renderList();

      let data;
      try {
        data = contactsCache || await api.contacts();
        contactsCache = data;
      } catch (err) {
        pane.appendChild(el('p', 'chat-error', err.message));
        return;
      }

      if (data.locked) {
        pane.appendChild(el('p', 'chat-lock-note', data.locked));
        return;
      }
      if (!data.contacts.length) {
        pane.appendChild(el('p', 'chat-no-messages', 'There is nobody you can message yet.'));
        return;
      }

      let selected = preselect
        ? data.contacts.find(function (c) { return c.type === preselect.type && c.id === Number(preselect.id); })
        : null;
      if (preselect && !selected) {
        pane.appendChild(el('p', 'chat-error', 'You cannot message that account right now.'));
      }

      const search = el('input', 'chat-search');
      search.type = 'search';
      search.placeholder = 'Search by name…';
      const picker = el('ul', 'chat-contacts');
      const chosen = el('div', 'chat-chosen');

      function renderChosen() {
        chosen.innerHTML = '';
        if (selected) {
          chosen.appendChild(el('span', '', 'To: '));
          chosen.appendChild(el('strong', '', selected.name));
          chosen.appendChild(el('span', 'chat-type-tag', TYPE_LABELS[selected.type] || ''));
        } else {
          chosen.appendChild(el('span', 'chat-muted', 'Choose who to message:'));
        }
      }

      function renderContacts() {
        picker.innerHTML = '';
        const term = search.value.trim().toLowerCase();
        data.contacts
          .filter(function (c) { return !term || c.name.toLowerCase().includes(term); })
          .forEach(function (c) {
            const item = el('li', 'chat-contact' + (selected && selected.type === c.type && selected.id === c.id ? ' active' : ''));
            item.appendChild(el('div', 'chat-avatar', initials(c.name)));
            const text = el('div', '');
            text.appendChild(el('strong', '', c.name));
            text.appendChild(el('div', 'chat-pane-sub', (TYPE_LABELS[c.type] || '') + (c.subtitle ? ' · ' + c.subtitle : '')));
            item.appendChild(text);
            item.addEventListener('click', function () {
              selected = c;
              renderChosen();
              renderContacts();
              composer.input.focus();
            });
            picker.appendChild(item);
          });
      }

      const composer = buildComposer(async function (text) {
        if (!selected) throw new Error('Please choose who to message first.');
        const result = await api.start(selected, text);
        contactsCache = null;
        await refreshList();
        activeKey = result.conversation.key;
        mode = 'chat';
        pane.dataset.key = '';
        renderChat(result.conversation, false);
        renderList();
      }, 'Write your first message…');

      search.addEventListener('input', renderContacts);
      pane.appendChild(chosen);
      pane.appendChild(search);
      pane.appendChild(picker);
      pane.appendChild(composer.form);
      renderChosen();
      renderContacts();
    }

    newBtn.addEventListener('click', function () { showNew(null); });

    // ------------------------------------------------------------ start up
    (async function init() {
      showEmpty();
      await refreshList();

      if (options.openKey) {
        openConversation(options.openKey);
        return;
      }

      const target = options.startWith;
      if (target) {
        const existing = conversations.find(function (c) { return c.counterpartType === target.type && c.counterpartId === Number(target.id); });
        if (existing) openConversation(existing.key);
        else showNew(target);
      } else if (options.openFirst && conversations.length) {
        openConversation(conversations[0].key);
      }
    })();

    setInterval(function () { if (!document.hidden) refreshList(); }, POLL_LIST_MS);
    setInterval(pollOpen, POLL_OPEN_MS);

    return {
      refresh: refreshList,
      open: openConversation,
      setFilter: function (fn) {
        filterFn = fn;
        renderList();
      }
    };
  };
})();
