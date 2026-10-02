if (!localStorage.getItem('currentAdminEmail')) { window.location.href = 'index.html'; }

// Visit requests, read-only: the orphanage decides, the admin team keeps an eye on them.

let visits = [];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === null || str === undefined ? '' : String(str);
  return div.innerHTML;
}

const STATUS_LABEL = { pending: 'Waiting', approved: 'Approved', declined: 'Declined', cancelled: 'Cancelled' };
const STATUS_CLASS = { pending: 'status-pending', approved: 'status-verified', declined: 'status-rejected', cancelled: 'status-rejected' };

function formatDate(value) {
  const date = new Date(value + 'T00:00:00');
  return isNaN(date) ? value : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function render() {
  const term = document.getElementById('search-input').value.trim().toLowerCase();
  const status = document.getElementById('status-filter').value;

  const rows = visits.filter(function (v) {
    if (status !== 'all' && v.status !== status) return false;
    return !term || (v.requesterName + ' ' + v.orphanageName).toLowerCase().indexOf(term) !== -1;
  });

  const body = document.getElementById('visits-body');
  if (rows.length === 0) {
    body.innerHTML = '<tr><td colspan="6" class="text-muted">' + (visits.length === 0 ? 'No visit requests yet.' : 'No requests match.') + '</td></tr>';
    return;
  }

  body.innerHTML = rows.map(function (v) {
    return (
      '<tr>' +
        '<td>' + escapeHtml(formatDate(v.preferredDate)) + '</td>' +
        '<td>' + escapeHtml(v.orphanageName) + '</td>' +
        '<td>' + escapeHtml(v.requesterName) +
          '<div class="small text-muted">' + escapeHtml(v.requesterType === 'partner' ? 'Partner' : 'Donor') + ' &middot; ' + escapeHtml(v.requesterEmail || '') + '</div>' +
          (v.message ? '<div class="small text-muted">&ldquo;' + escapeHtml(v.message) + '&rdquo;</div>' : '') +
        '</td>' +
        '<td>' + escapeHtml(v.visitorsCount) + '</td>' +
        '<td><span class="status-badge ' + (STATUS_CLASS[v.status] || '') + '">' + escapeHtml(STATUS_LABEL[v.status] || v.status) + '</span></td>' +
        '<td class="small">' + escapeHtml(v.responseNote || '') + '</td>' +
      '</tr>'
    );
  }).join('');
}

apiRequest('/visit-requests').then(function (data) {
  visits = data.visits;
  render();
}).catch(function (err) {
  const box = document.getElementById('load-error');
  box.textContent = 'Could not load visit requests: ' + err.message;
  box.classList.remove('d-none');
  document.getElementById('visits-body').innerHTML = '';
});

document.getElementById('search-input').addEventListener('input', render);
document.getElementById('status-filter').addEventListener('change', render);
