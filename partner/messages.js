if (!localStorage.getItem('partnerToken')) { window.location.href = 'index.html'; }

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

let threadCache = null;

function renderThread(thread) {
  const box = document.getElementById('conversation-thread');

  if (!thread) {
    box.innerHTML = '<p class="text-muted small mb-0">No messages yet. Send one below to start the conversation.</p>';
    return;
  }

  const entries = [];

  if (thread.body) {
    entries.push({ text: thread.body, timestamp: thread.timestamp, fromAdmin: thread.fromAdmin });
  }

  (thread.replies || []).forEach(function (r) {
    entries.push({ text: r.text, timestamp: r.timestamp, fromAdmin: r.sender !== 'partner', auto: r.auto });
  });

  if (entries.length === 0) {
    box.innerHTML = '<p class="text-muted small mb-0">No messages yet. Send one below to start the conversation.</p>';
    return;
  }

  box.innerHTML = entries.map(function (e) {
    const when = new Date(e.timestamp);
    const whenText = isNaN(when.getTime()) ? e.timestamp : when.toLocaleString();
    const label = e.auto ? 'Auto-reply' : (e.fromAdmin ? 'Admin support' : 'You');
    return (
      '<div class="mb-3">' +
        '<div class="small text-muted mb-1">' + escapeHtml(label) + ' &mdash; ' + escapeHtml(whenText) + '</div>' +
        '<div class="profile-info-note mb-0">' + escapeHtml(e.text) + '</div>' +
      '</div>'
    );
  }).join('');

  box.scrollTop = box.scrollHeight;
}

function loadThread() {
  return apiRequest('/partner-auth/messages').then(function (data) {
    threadCache = data.message;
    renderThread(threadCache);
  }).catch(function (err) {
    document.getElementById('conversation-thread').innerHTML =
      '<p class="text-danger small mb-0">Could not load messages: ' + escapeHtml(err.message) + '. Is the backend running?</p>';
  });
}

document.getElementById('send-reply-btn').addEventListener('click', function () {
  const textarea = document.getElementById('reply-textarea');
  const text = textarea.value.trim();
  const statusEl = document.getElementById('reply-status');
  if (!text) return;

  apiRequest('/partner-auth/messages/reply', { method: 'POST', body: { text: text } })
    .then(function (data) {
      threadCache = data.message;
      renderThread(threadCache);
      textarea.value = '';
      statusEl.textContent = 'Sent.';
      setTimeout(function () { statusEl.textContent = ''; }, 2000);
    })
    .catch(function (err) {
      alert('Could not send message: ' + err.message);
    });
});

loadThread();
