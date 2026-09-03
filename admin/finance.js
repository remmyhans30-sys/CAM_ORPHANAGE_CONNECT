function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function formatFcfa(amount) {
  return Number(amount || 0).toLocaleString('en-US') + ' FCFA';
}

const orphanages = JSON.parse(localStorage.getItem('orphanages') || '[]');
const needs = JSON.parse(localStorage.getItem('needs') || '[]');

const groupsEl = document.getElementById('finance-groups');
const emptyState = document.getElementById('empty-state');

if (needs.length === 0) {
  emptyState.classList.remove('d-none');
} else {
  orphanages.forEach(function (orphanage) {
    const orphanageNeeds = needs.filter(function (n) { return String(n.orphanageId) === String(orphanage.id); });
    if (orphanageNeeds.length === 0) return;

    const totalRaised = orphanageNeeds.reduce(function (sum, n) { return sum + Number(n.raised || 0); }, 0);
    const totalGoal = orphanageNeeds.reduce(function (sum, n) { return sum + Number(n.goal || 0); }, 0);

    const group = document.createElement('div');
    group.className = 'card card-admin p-4';

    const needRows = orphanageNeeds.map(function (need) {
      const percent = need.goal > 0 ? Math.min(100, Math.round((need.raised / need.goal) * 100)) : 0;
      return (
        '<div class="finance-need-row">' +
          '<div class="d-flex justify-content-between mb-1">' +
            '<span>' + escapeHtml(need.title) + '</span>' +
            '<span class="text-muted small">' + formatFcfa(need.raised) + ' / ' + formatFcfa(need.goal) + '</span>' +
          '</div>' +
          '<div class="progress finance-progress">' +
            '<div class="progress-bar" style="width: ' + percent + '%"></div>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    group.innerHTML =
      '<div class="d-flex justify-content-between align-items-start mb-2">' +
        '<h2 class="h5 mb-0">' + escapeHtml(orphanage.name) + '</h2>' +
        '<span class="text-muted small">' + formatFcfa(totalRaised) + ' raised of ' + formatFcfa(totalGoal) + '</span>' +
      '</div>' +
      needRows;

    groupsEl.appendChild(group);
  });

  if (groupsEl.children.length === 0) {
    emptyState.classList.remove('d-none');
  }
}
