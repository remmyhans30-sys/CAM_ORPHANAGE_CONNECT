if (!localStorage.getItem('currentAdminEmail')) { window.location.href = 'index.html'; }

// Chat Monitor: read every orphanage <-> donor / partner conversation and step in as the team,
// in the same chat window the rest of the site uses.

const monitorApi = window.createMonitorChatApi();

function matchesFilters(conv) {
  const term = document.getElementById('search-input').value.trim().toLowerCase();
  const kind = document.getElementById('kind-filter').value;
  if (kind !== 'all' && conv.kind !== kind) return false;
  return !term || (conv.searchText || conv.title).toLowerCase().includes(term);
}

const chat = window.createChat({
  root: document.getElementById('chat-root'),
  api: monitorApi,
  listTitle: 'Orphanage chats',
  allowNew: false,
  emptyText: 'No orphanage chats yet. They appear here as soon as an orphanage and a donor or partner start talking.',
  filter: matchesFilters,
  messageActions: function (conv, message) {
    if (message.text.indexOf('[Message removed') === 0) return [];
    return [{
      label: 'Remove',
      onClick: function () {
        if (!confirm('Remove this message? The people in the chat will see that the team removed a message.')) {
          return Promise.reject(new Error('Cancelled'));
        }
        return monitorApi.removeMessage(conv.key, message.index);
      }
    }];
  }
});

['search-input', 'kind-filter'].forEach(function (id) {
  const el = document.getElementById(id);
  el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', function () { chat.setFilter(matchesFilters); });
});
