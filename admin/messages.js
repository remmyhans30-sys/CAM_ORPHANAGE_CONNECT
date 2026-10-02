if (!localStorage.getItem('currentAdminEmail')) { window.location.href = 'index.html'; }

// Support Center: one conversation with every donor, orphanage and partner who has written to you
// (or whom you have written to), in the same chat window the rest of the site uses.

const supportApi = window.createSupportChatApi();

function matchesFilters(conv) {
  const search = document.getElementById('search-input').value.trim().toLowerCase();
  const readFilter = document.getElementById('read-filter').value;
  const statusFilter = document.getElementById('status-filter').value;
  const priorityFilter = document.getElementById('priority-filter').value;

  if (search && !(conv.searchText || ((conv.title || '') + ' ' + (conv.lastText || ''))).toLowerCase().includes(search)) return false;
  if (readFilter === 'unread' && !conv.unread) return false;
  if (statusFilter !== 'all' && conv.status !== statusFilter) return false;
  if (priorityFilter !== 'all' && conv.priority !== priorityFilter) return false;
  return true;
}

// Status, priority, profile link and delete, above the conversation.
function renderTicketControls(conv, container) {
  function select(label, id, values, current, format) {
    const wrap = document.createElement('span');
    const text = document.createElement('label');
    text.textContent = label;
    text.setAttribute('for', id);
    const control = document.createElement('select');
    control.id = id;
    values.forEach(function (v) {
      const option = document.createElement('option');
      option.value = v;
      option.textContent = format(v);
      if (v === current) option.selected = true;
      control.appendChild(option);
    });
    wrap.appendChild(text);
    wrap.appendChild(control);
    return { wrap: wrap, control: control };
  }

  const status = select('Status', 'ticket-status-select', ['open', 'in-progress', 'resolved', 'closed'], conv.status, function (v) {
    return v === 'in-progress' ? 'In progress' : v.charAt(0).toUpperCase() + v.slice(1);
  });
  const priority = select('Priority', 'ticket-priority-select', ['low', 'normal', 'high', 'urgent'], conv.priority, function (v) {
    return v.charAt(0).toUpperCase() + v.slice(1);
  });

  const saved = document.createElement('span');
  saved.id = 'ticket-status-save-status';

  function save() {
    supportApi.update(conv.key, { status: status.control.value, priority: priority.control.value })
      .then(function () {
        saved.textContent = 'Saved.';
        setTimeout(function () { saved.textContent = ''; }, 2000);
        chat.refresh();
      })
      .catch(function (err) { alert('Could not save changes to the server: ' + err.message); });
  }
  status.control.addEventListener('change', save);
  priority.control.addEventListener('change', save);

  const profile = document.createElement('a');
  profile.href = conv.profileUrl;
  profile.textContent = 'View account profile';

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'chat-danger';
  remove.id = 'delete-message-btn';
  remove.textContent = 'Delete conversation';
  remove.addEventListener('click', function () {
    if (!confirm('Delete this conversation? This cannot be undone.')) return;
    supportApi.remove(conv.key)
      .then(function () { window.location.href = 'messages.html'; })
      .catch(function (err) { alert('Could not delete: ' + err.message); });
  });

  container.appendChild(status.wrap);
  container.appendChild(priority.wrap);
  container.appendChild(saved);
  container.appendChild(profile);
  container.appendChild(remove);
}

const deepLinkId = new URLSearchParams(window.location.search).get('id');

const chat = window.createChat({
  root: document.getElementById('chat-root'),
  api: supportApi,
  listTitle: 'Conversations',
  emptyText: 'No conversations match. Use "+ New" to message any donor, orphanage or partner.',
  filter: matchesFilters,
  renderHeader: renderTicketControls,
  openKey: deepLinkId !== null ? 'support-' + Number(deepLinkId) : null,
});

['search-input', 'read-filter', 'status-filter', 'priority-filter'].forEach(function (id) {
  const el = document.getElementById(id);
  el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', function () { chat.setFilter(matchesFilters); });
});
