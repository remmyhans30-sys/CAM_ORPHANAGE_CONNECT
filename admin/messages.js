if (!localStorage.getItem('currentAdminEmail')) { window.location.href = 'index.html'; }

function loadMessages() {
  return JSON.parse(localStorage.getItem('messages') || '[]');
}

function saveMessages(messages) {
  localStorage.setItem('messages', JSON.stringify(messages));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function initials(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function accountTypeLabel(type) {
  if (type === 'donor') return 'Donor';
  if (type === 'orphanage') return 'Orphanage';
  if (type === 'partner') return 'Partner Org';
  return type;
}

function profileUrlFor(msg) {
  if (msg.accountType === 'donor') return 'donor-profile.html?id=' + encodeURIComponent(msg.accountId);
  if (msg.accountType === 'orphanage') return 'verification.html?id=' + encodeURIComponent(msg.accountId);
  if (msg.accountType === 'partner') return 'partner-profile.html?id=' + encodeURIComponent(msg.accountId);
  return '#';
}

const messageModalEl = document.getElementById('message-modal');
const messageModal = new bootstrap.Modal(messageModalEl);
let activeMessageId = null;

function lastActivityTimestamp(msg) {
  const replies = msg.replies || [];
  if (replies.length === 0) return msg.timestamp;
  const lastReply = replies[replies.length - 1];
  return new Date(lastReply.timestamp) > new Date(msg.timestamp) ? lastReply.timestamp : msg.timestamp;
}

function previewText(msg) {
  const replies = msg.replies || [];
  if (replies.length > 0) return replies[replies.length - 1].text;
  if (msg.body) return msg.body;
  return 'No messages yet';
}

function render() {
  const allMessages = loadMessages().slice().sort(function (a, b) { return new Date(lastActivityTimestamp(b)) - new Date(lastActivityTimestamp(a)); });
  const list = document.getElementById('messages-list');
  const emptyState = document.getElementById('empty-state');
  const filterEmptyState = document.getElementById('filter-empty-state');

  list.innerHTML = '';

  if (allMessages.length === 0) {
    list.classList.add('d-none');
    filterEmptyState.classList.add('d-none');
    emptyState.classList.remove('d-none');
    return;
  }

  emptyState.classList.add('d-none');

  const search = document.getElementById('search-input').value.trim().toLowerCase();
  const readFilter = document.getElementById('read-filter').value;

  const messages = allMessages.filter(function (msg) {
    const matchesSearch = !search ||
      (msg.senderName || '').toLowerCase().includes(search) ||
      (msg.subject || '').toLowerCase().includes(search) ||
      previewText(msg).toLowerCase().includes(search);
    const matchesRead = readFilter === 'all' || !msg.read;
    return matchesSearch && matchesRead;
  });

  if (messages.length === 0) {
    list.classList.add('d-none');
    filterEmptyState.classList.remove('d-none');
    return;
  }

  list.classList.remove('d-none');
  filterEmptyState.classList.add('d-none');

  list.innerHTML = messages.map(function (msg) {
    const when = new Date(lastActivityTimestamp(msg));
    const whenText = isNaN(when.getTime()) ? msg.timestamp : when.toLocaleString();

    return (
      '<div class="account-row-link message-row" data-message-id="' + msg.id + '" style="cursor:pointer;">' +
        '<div class="account-row d-flex align-items-center gap-3 flex-wrap' + (msg.read ? '' : ' message-unread') + '">' +
          '<div class="row-avatar g' + ((msg.id % 5) + 1) + '">' + initials(msg.senderName) + '</div>' +
          '<div class="flex-grow-1" style="min-width: 200px;">' +
            '<div class="d-flex align-items-center gap-2">' +
              (msg.read ? '' : '<span class="message-unread-dot"></span>') +
              '<strong>' + escapeHtml(msg.senderName) + '</strong>' +
              '<span class="tier-tag tier-friend">' + escapeHtml(accountTypeLabel(msg.accountType)) + '</span>' +
            '</div>' +
            '<div class="small text-muted text-truncate" style="max-width: 320px;">' + escapeHtml(previewText(msg)) + '</div>' +
          '</div>' +
          '<div class="text-end small text-muted" style="min-width: 140px;">' +
            whenText +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

function buildModalBody(msg) {
  const when = new Date(msg.timestamp);
  const whenText = isNaN(when.getTime()) ? msg.timestamp : when.toLocaleString();

  const repliesList = (msg.replies || []).map(function (r) {
    const replyWhen = new Date(r.timestamp);
    const replyWhenText = isNaN(replyWhen.getTime()) ? r.timestamp : replyWhen.toLocaleString();
    return (
      '<div class="profile-post">' +
        '<span class="profile-post-date">' + (r.auto ? 'Auto-reply' : 'Admin reply') + ' &mdash; ' + escapeHtml(replyWhenText) + '</span>' +
        '<p class="small mb-0 mt-1">' + escapeHtml(r.text) + '</p>' +
      '</div>'
    );
  }).join('');

  return (
    '<p class="small text-muted mb-1">' + (msg.fromAdmin ? 'You messaged ' : 'From ') + '<strong class="text-body">' + escapeHtml(msg.senderName) + '</strong> (' + escapeHtml(accountTypeLabel(msg.accountType)) + ') &mdash; ' + escapeHtml(whenText) + '</p>' +
    '<p class="small mb-3"><a href="' + profileUrlFor(msg) + '">View account profile</a></p>' +
    (msg.body ? '<div class="profile-info-note mb-3">' + escapeHtml(msg.body) + '</div>' : '<p class="text-muted small mb-3">No messages yet &mdash; start the conversation below.</p>') +
    (repliesList ? '<h3 class="h6">Replies</h3>' + repliesList : '') +
    '<h3 class="h6 mt-3">Reply</h3>' +
    '<textarea class="form-control small" id="reply-textarea" rows="3" placeholder="Type your reply..."></textarea>' +
    '<div class="d-flex align-items-center gap-2 mt-2">' +
      '<button type="button" class="btn btn-admin-primary btn-sm" id="send-reply-btn">Send reply</button>' +
      '<span class="small text-muted" id="reply-status"></span>' +
    '</div>'
  );
}

const AUTO_REPLY_TEXT = "Thank you for reaching out. Our admin team has received your message and will respond within 1-2 business days.";

function openMessage(id) {
  const messages = loadMessages();
  const msg = messages.find(function (m) { return m.id === id; });
  if (!msg) return;

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

  if (changed) {
    saveMessages(messages);
    render();
  }

  activeMessageId = id;
  document.getElementById('message-modal-title').textContent = msg.subject;
  document.getElementById('message-modal-body').innerHTML = buildModalBody(msg);
  messageModal.show();
}

document.getElementById('messages-list').addEventListener('click', function (e) {
  const row = e.target.closest('.message-row');
  if (!row) return;
  openMessage(Number(row.dataset.messageId));
});

document.getElementById('message-modal-body').addEventListener('click', function (e) {
  if (e.target.id !== 'send-reply-btn') return;
  if (activeMessageId === null) return;

  const textarea = document.getElementById('reply-textarea');
  const text = textarea.value.trim();
  if (!text) return;

  const messages = loadMessages();
  const msg = messages.find(function (m) { return m.id === activeMessageId; });
  if (!msg) return;

  msg.replies = msg.replies || [];
  msg.replies.push({ text: text, timestamp: new Date().toISOString() });
  saveMessages(messages);
  render();

  document.getElementById('message-modal-body').innerHTML = buildModalBody(msg);

  const statusEl = document.getElementById('reply-status');
  if (statusEl) {
    statusEl.textContent = '(Simulated) Reply sent.';
  }
});

function seedSampleData() {
  const sampleMessages = [
    {
      id: 1,
      senderName: "Hope Children's Home",
      accountType: 'orphanage',
      accountId: 1,
      subject: 'Question about need approval',
      body: "Hello, we submitted a new need for school fees last week but haven't heard back. Could someone confirm it's under review?",
      timestamp: '2026-09-02T09:15:00.000Z',
      read: false,
      replies: [],
    },
    {
      id: 2,
      senderName: 'Ngozi Adeyemi',
      accountType: 'donor',
      accountId: 1,
      subject: "Donation receipt didn't arrive",
      body: 'Hi, I made a donation last week but never received a receipt by email. Could you check on this for me?',
      timestamp: '2026-09-03T14:40:00.000Z',
      read: false,
      replies: [],
    },
    {
      id: 3,
      senderName: 'Global Child Aid NGO',
      accountType: 'partner',
      accountId: 3,
      subject: 'Update on placement case documentation',
      body: 'We wanted to let you know additional documentation for the case submitted in August has been prepared and can be sent over if needed.',
      timestamp: '2026-08-25T11:00:00.000Z',
      read: true,
      replies: [
        { text: 'Thank you, please go ahead and send the additional documentation whenever ready.', timestamp: '2026-08-25T15:30:00.000Z' },
      ],
    },
  ];

  saveMessages(sampleMessages);
  render();
}

function clearAllData() {
  if (!confirm('Clear all messages? This cannot be undone.')) return;
  localStorage.removeItem('messages');
  render();
}

document.getElementById('seed-btn').addEventListener('click', seedSampleData);
document.getElementById('clear-btn').addEventListener('click', clearAllData);
document.getElementById('search-input').addEventListener('input', render);
document.getElementById('read-filter').addEventListener('change', render);

render();

const deepLinkId = new URLSearchParams(window.location.search).get('id');
if (deepLinkId !== null) {
  openMessage(Number(deepLinkId));
}
