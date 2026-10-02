// Connects the shared chat window (../shared/chat.js) to the admin's two inboxes:
//   createSupportChatApi()  one thread per donor / orphanage / partner (the Support Center)
//   createMonitorChatApi()  direct chats between orphanages and donors / partners (the Chat Monitor)
// Uses apiRequest() from api.js, so the admin's login is sent automatically.

(function () {
  const AUTO_REPLY_TEXT = 'Thank you for reaching out. Our admin team has received your message and will respond within 1-2 business days.';
  const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };

  function profileUrl(msg) {
    if (msg.accountType === 'donor') return 'donor-profile.html?id=' + encodeURIComponent(msg.accountId);
    if (msg.accountType === 'orphanage') return 'verification.html?id=' + encodeURIComponent(msg.accountId);
    if (msg.accountType === 'partner') return 'partner-profile.html?id=' + encodeURIComponent(msg.accountId);
    return '#';
  }

  function statusText(status) {
    return status === 'in-progress' ? 'In progress' : (status || 'open').charAt(0).toUpperCase() + (status || 'open').slice(1);
  }

  // One support thread as a conversation: the first message, then the replies in order.
  function toConversation(msg, withMessages) {
    const entries = [];
    if (msg.body) entries.push({ text: msg.body, timestamp: msg.timestamp, sender: msg.fromAdmin ? 'admin' : msg.accountType });
    (msg.replies || []).forEach(function (r) {
      entries.push({ text: r.text, timestamp: r.timestamp, sender: r.auto ? 'auto' : (r.sender || 'admin') });
    });
    const last = entries[entries.length - 1] || null;

    const badges = [];
    if (msg.priority === 'urgent' || msg.priority === 'high') badges.push({ text: msg.priority === 'urgent' ? 'Urgent' : 'High', className: msg.priority === 'urgent' ? 'danger' : '' });
    if ((msg.status || 'open') !== 'open') badges.push({ text: statusText(msg.status), className: 'muted' });

    const conversation = {
      key: 'support-' + msg.id,
      kind: 'support',
      rawId: msg.id,
      title: msg.senderName,
      counterpartType: msg.accountType,
      counterpartId: msg.accountId,
      unread: !msg.read,
      lastText: last ? last.text.slice(0, 80) : 'No messages yet',
      searchText: msg.senderName + ' ' + entries.map(function (m) { return m.text; }).join(' '),
      lastAt: last ? last.timestamp : msg.timestamp,
      status: msg.status || 'open',
      priority: msg.priority || 'normal',
      profileUrl: profileUrl(msg),
      badges: badges,
    };

    if (withMessages) {
      conversation.messages = entries.map(function (m) {
        const fromTeam = m.sender === 'admin' || m.sender === 'auto';
        return {
          text: m.text,
          timestamp: m.timestamp,
          mine: fromTeam,
          label: m.sender === 'auto' ? 'Auto-reply' : (fromTeam ? 'You' : msg.senderName),
        };
      });
    }
    return conversation;
  }

  window.createSupportChatApi = function () {
    function rawIdOf(key) {
      return Number(String(key).replace('support-', ''));
    }
    function fetchOne(key) {
      return apiRequest('/messages/' + rawIdOf(key)).then(function (data) { return data.message; });
    }
    function save(msg) {
      return apiRequest('/messages/' + msg.id, { method: 'PUT', body: msg }).then(function (data) { return data.message; });
    }

    return {
      list: function () {
        return apiRequest('/messages').then(function (data) {
          const conversations = data.messages.map(function (m) { return toConversation(m, false); });
          conversations.sort(function (a, b) {
            const rankA = PRIORITY_RANK.hasOwnProperty(a.priority) ? PRIORITY_RANK[a.priority] : 2;
            const rankB = PRIORITY_RANK.hasOwnProperty(b.priority) ? PRIORITY_RANK[b.priority] : 2;
            if (rankA !== rankB) return rankA - rankB;
            return new Date(b.lastAt) - new Date(a.lastAt);
          });
          return { conversations: conversations };
        });
      },

      // Opening a thread marks it read, and answers an unanswered message with the standard auto-reply.
      open: function (key) {
        return fetchOne(key).then(function (msg) {
          let changed = false;
          if (!msg.read) {
            msg.read = true;
            changed = true;
          }
          if (!msg.fromAdmin && !msg.autoReplied && (msg.replies || []).length === 0) {
            msg.replies = msg.replies || [];
            msg.replies.push({ text: AUTO_REPLY_TEXT, timestamp: new Date().toISOString(), auto: true });
            msg.autoReplied = true;
            changed = true;
          }
          return changed ? save(msg) : msg;
        }).then(function (msg) {
          return { conversation: toConversation(msg, true) };
        });
      },

      send: function (key, text) {
        return fetchOne(key).then(function (msg) {
          msg.replies = msg.replies || [];
          msg.replies.push({ text: text, timestamp: new Date().toISOString(), sender: 'admin' });
          msg.read = true;
          return save(msg);
        }).then(function (msg) {
          return { conversation: toConversation(msg, true) };
        });
      },

      // The admin can start a conversation with any profile.
      contacts: function () {
        return Promise.all([apiRequest('/donors'), apiRequest('/orphanages'), apiRequest('/partners')]).then(function (results) {
          const contacts = [];
          results[1].orphanages.forEach(function (o) {
            contacts.push({ type: 'orphanage', id: o.id, name: o.name, subtitle: [o.location, o.status].filter(Boolean).join(' · ') });
          });
          results[0].donors.forEach(function (d) {
            contacts.push({ type: 'donor', id: d.id, name: d.name, subtitle: [d.location, d.status].filter(Boolean).join(' · ') });
          });
          results[2].partners.forEach(function (p) {
            contacts.push({ type: 'partner', id: p.id, name: p.name, subtitle: [p.orgType, p.verificationStatus].filter(Boolean).join(' · ') });
          });
          return { contacts: contacts };
        });
      },

      start: function (contact, text) {
        return apiRequest('/messages/thread', { method: 'POST', body: { accountType: contact.type, accountId: contact.id, senderName: contact.name } })
          .then(function (data) {
            const msg = data.message;
            msg.replies = msg.replies || [];
            msg.replies.push({ text: text, timestamp: new Date().toISOString(), sender: 'admin' });
            msg.read = true;
            return save(msg);
          })
          .then(function (msg) { return { conversation: toConversation(msg, true) }; });
      },

      // Ticket controls shown above the conversation.
      update: function (key, changes) {
        return fetchOne(key).then(function (msg) {
          Object.keys(changes).forEach(function (k) { msg[k] = changes[k]; });
          return save(msg);
        });
      },

      remove: function (key) {
        return apiRequest('/messages/' + rawIdOf(key), { method: 'DELETE' });
      },
    };
  };

  window.createMonitorChatApi = function () {
    function toView(c, withMessages) {
      const view = {
        key: c.key,
        kind: c.kind,
        title: c.otherName + ' ↔ ' + c.orphanageName,
        counterpartType: 'chat-' + c.kind,
        unread: false,
        lastText: c.lastText,
        lastAt: c.lastAt,
        searchText: c.otherName + ' ' + c.orphanageName + ' ' + c.lastText,
      };
      if (withMessages) {
        view.messages = c.messages.map(function (m, index) {
          return { text: m.text, timestamp: m.timestamp, mine: m.sender === 'admin', label: m.label, index: index };
        });
      }
      return view;
    }

    return {
      list: function () {
        return apiRequest('/conversations').then(function (data) {
          return { conversations: data.conversations.map(function (c) { return toView(c, false); }) };
        });
      },
      open: function (key) {
        return apiRequest('/conversations/' + encodeURIComponent(key)).then(function (data) {
          return { conversation: toView(data.conversation, true) };
        });
      },
      send: function (key, text) {
        return apiRequest('/conversations/' + encodeURIComponent(key) + '/reply', { method: 'POST', body: { text: text } }).then(function (data) {
          return { conversation: toView(data.conversation, true) };
        });
      },
      removeMessage: function (key, index) {
        return apiRequest('/conversations/' + encodeURIComponent(key) + '/messages/' + index, { method: 'DELETE' });
      },
    };
  };
})();
