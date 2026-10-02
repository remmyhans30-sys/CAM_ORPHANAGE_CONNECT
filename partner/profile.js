if (!localStorage.getItem('partnerToken')) { window.location.href = 'index.html'; }

// Partner profile: complete the organization's details, upload documents, submit for verification.

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === null || str === undefined ? '' : String(str);
  return div.innerHTML;
}

function initials(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

let partner = null;

const STATUS_LABELS = { draft: 'Incomplete', pending: 'Pending', 'needs-info': 'Needs info', verified: 'Verified', rejected: 'Rejected' };

function show(id, message) {
  const box = document.getElementById(id);
  box.textContent = message;
  box.classList.remove('d-none');
}

function hide(id) {
  document.getElementById(id).classList.add('d-none');
}

function renderStatus() {
  const badge = document.getElementById('status-badge');
  badge.className = 'status-badge ms-auto status-' + partner.verificationStatus;
  badge.textContent = STATUS_LABELS[partner.verificationStatus] || partner.verificationStatus;

  const notes = {
    draft: ['warning', 'Your profile is not complete yet. Fill in the checklist below, then submit it for verification. You can already look around the portal.'],
    pending: ['info', 'Your organization is awaiting verification by the CAM Orphanage Connect team.'],
    'needs-info': ['warning', 'The team needs more information' + (partner.infoRequestMessage ? ': ' + partner.infoRequestMessage : '.') + ' Update your profile and resubmit.'],
    verified: ['success', 'Your organization is verified.'],
    rejected: ['danger', 'Your application was not approved' + (partner.rejectionReason ? ': ' + partner.rejectionReason : '.')]
  };
  const note = notes[partner.verificationStatus];
  document.getElementById('status-note').innerHTML = note
    ? '<div class="alert alert-' + note[0] + ' py-2 mb-0">' + escapeHtml(note[1]) + '</div>'
    : '';
}

function renderChecklist() {
  const card = document.getElementById('checklist-card');
  const editable = partner.verificationStatus === 'draft' || partner.verificationStatus === 'needs-info';
  card.style.display = partner.verificationStatus === 'verified' || partner.verificationStatus === 'rejected' ? 'none' : '';

  const items = partner.checklist || [];
  const required = items.filter(function (i) { return i.required; });
  const done = required.filter(function (i) { return i.done; }).length;

  document.getElementById('checklist-progress').style.width = Math.round((done / Math.max(1, required.length)) * 100) + '%';
  document.getElementById('checklist-summary').textContent = partner.verificationStatus === 'pending'
    ? 'Submitted. Our team is reviewing your organization.'
    : done + ' of ' + required.length + ' required items done. The team reviews your organization once you submit it.';

  document.getElementById('checklist').innerHTML = items.map(function (item) {
    return '<li class="d-flex gap-2 align-items-center small mb-1' + (item.done ? ' text-muted' : '') + '" data-key="' + escapeHtml(item.key) + '">' +
      '<i class="bi ' + (item.done ? 'bi-check-circle-fill text-success' : 'bi-circle') + '"></i>' +
      '<span' + (item.done ? ' style="text-decoration: line-through;"' : '') + '>' + escapeHtml(item.label) + '</span>' +
      (item.required ? '' : '<span class="badge text-bg-light">optional</span>') +
      '</li>';
  }).join('');
  // The email link may be lost or expired: offer a new one, on its own line under the item.
  if (items.some(function (i) { return i.key === 'emailConfirmed' && !i.done; })) {
    const li = document.querySelector('#checklist li[data-key="emailConfirmed"]');
    const control = window.CocEmailConfirm.resendControl(API_BASE, localStorage.getItem('partnerToken'), 'btn btn-sm btn-outline-primary');
    control.className += ' w-100 ps-4';
    li.classList.add('flex-wrap');
    li.querySelector('span').style.cssText = 'flex: 1 1 0; min-width: 0;';
    li.appendChild(control);
  }

  const submitBtn = document.getElementById('submit-review-btn');
  submitBtn.style.display = editable ? '' : 'none';
  submitBtn.disabled = done < required.length;
  submitBtn.innerHTML = '<i class="bi bi-send-check"></i> ' + (partner.verificationStatus === 'needs-info' ? 'Resubmit for verification' : 'Submit for verification');
}

function fillForm() {
  document.getElementById('org-name').value = partner.name || '';
  document.getElementById('org-type').value = partner.orgType || '';
  document.getElementById('org-country').value = partner.country || '';
  document.getElementById('org-contact').value = partner.contactName || '';
  document.getElementById('org-blurb').value = partner.sponsoredByBlurb || '';
  document.getElementById('pledge-description').value = partner.pledge ? partner.pledge.description : '';
  document.getElementById('pledge-limit').value = partner.pledge ? partner.pledge.limit : '';
  document.getElementById('org-terms').checked = Boolean(partner.termsAgreed);

  const locked = partner.verificationStatus === 'verified';
  document.getElementById('pledge-description').disabled = locked;
  document.getElementById('pledge-limit').disabled = locked;
}

function renderUploads() {
  const logoBox = document.getElementById('logo-box');
  logoBox.innerHTML = '';
  if (partner.logoUrl) {
    const img = document.createElement('img');
    img.src = partner.logoUrl;
    img.alt = '';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit';
    logoBox.appendChild(img);
  } else {
    logoBox.textContent = initials(partner.name);
  }

  const list = document.getElementById('doc-list');
  list.innerHTML = '';
  if (partner.documents.length === 0) {
    list.innerHTML = '<li class="text-muted small">No documents uploaded yet.</li>';
  }
  partner.documents.forEach(function (doc) {
    const li = document.createElement('li');
    li.className = 'd-flex justify-content-between align-items-center bg-light rounded px-3 py-2 mb-2 small';
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = doc.name + (doc.size ? ' (' + Math.max(1, Math.round(doc.size / 1024)) + ' KB)' : '');
    link.addEventListener('click', function (e) {
      e.preventDefault();
      openDocument(doc);
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-link btn-sm text-danger p-0';
    remove.innerHTML = '<i class="bi bi-trash"></i> Remove';
    remove.addEventListener('click', function () { removeDocument(doc); });
    li.appendChild(link);
    li.appendChild(remove);
    list.appendChild(li);
  });
}

function renderAll() {
  renderStatus();
  renderChecklist();
  renderUploads();
}

document.getElementById('profile-form').addEventListener('submit', function (e) {
  e.preventDefault();
  hide('profile-error');
  hide('profile-saved');

  const name = document.getElementById('org-name').value.trim();
  if (!name) {
    show('profile-error', 'Organization name cannot be empty.');
    return;
  }

  const body = {
    name: name,
    orgType: document.getElementById('org-type').value,
    country: document.getElementById('org-country').value.trim(),
    contactName: document.getElementById('org-contact').value.trim(),
    sponsoredByBlurb: document.getElementById('org-blurb').value.trim(),
    termsAgreed: document.getElementById('org-terms').checked
  };
  if (partner.verificationStatus !== 'verified') {
    body.pledgeDescription = document.getElementById('pledge-description').value.trim();
    body.pledgeLimit = document.getElementById('pledge-limit').value;
  }

  const button = document.getElementById('save-profile-btn');
  button.disabled = true;
  apiRequest('/partner-auth/me', { method: 'PUT', body: body })
    .then(function (data) {
      partner = data.partner;
      fillForm();
      renderAll();
      document.getElementById('profile-saved').classList.remove('d-none');
    })
    .catch(function (err) { show('profile-error', err.message); })
    .then(function () { button.disabled = false; });
});

document.getElementById('submit-review-btn').addEventListener('click', function () {
  hide('submit-error');
  const button = this;
  button.disabled = true;
  apiRequest('/partner-auth/me/submit', { method: 'POST' })
    .then(function (data) {
      partner = data.partner;
      renderAll();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    })
    .catch(function (err) {
      show('submit-error', err.message);
      renderChecklist();
    });
});

// Uploads
const uploadInput = document.getElementById('upload-input');
let uploadKind = null;
const UPLOAD_TARGETS = {
  logo: { path: '/partner-auth/me/logo', accept: 'image/jpeg,image/png,image/webp' },
  document: { path: '/partner-auth/me/documents', accept: 'application/pdf,image/jpeg,image/png' }
};

document.querySelectorAll('[data-upload]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    uploadKind = btn.dataset.upload;
    uploadInput.accept = UPLOAD_TARGETS[uploadKind].accept;
    uploadInput.value = '';
    uploadInput.click();
  });
});

uploadInput.addEventListener('change', function () {
  const file = uploadInput.files[0];
  if (!file || !uploadKind) return;
  hide('upload-error');

  if (file.size > MAX_UPLOAD_BYTES) {
    show('upload-error', 'That file is too large. The limit is 3 MB.');
    return;
  }

  const kind = uploadKind;
  const reader = new FileReader();
  reader.onload = function () {
    apiRequest(UPLOAD_TARGETS[kind].path, { method: 'POST', body: { filename: file.name, data: String(reader.result) } })
      .then(function (data) {
        partner = data.partner;
        renderAll();
      })
      .catch(function (err) { show('upload-error', err.message); });
  };
  reader.onerror = function () { show('upload-error', 'Could not read that file. Please try another one.'); };
  reader.readAsDataURL(file);
});

function removeDocument(doc) {
  if (!window.confirm('Remove "' + doc.name + '"?')) return;
  hide('upload-error');
  apiRequest('/partner-auth/me/documents/' + doc.id, { method: 'DELETE' })
    .then(function (data) {
      partner = data.partner;
      renderAll();
    })
    .catch(function (err) { show('upload-error', err.message); });
}

// Documents are private, so they are fetched with the login and opened from memory.
function openDocument(doc) {
  const opened = window.open('', '_blank');
  fetch(API_BASE + '/files/document/' + encodeURIComponent(doc.id), {
    headers: { Authorization: 'Bearer ' + localStorage.getItem('partnerToken') }
  })
    .then(function (response) {
      if (!response.ok) throw new Error('not found');
      return response.blob();
    })
    .then(function (blob) {
      const url = URL.createObjectURL(blob);
      if (opened) opened.location.href = url; else window.location.href = url;
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    })
    .catch(function () {
      if (opened) opened.close();
      show('upload-error', 'Could not open "' + doc.name + '".');
    });
}

apiRequest('/partner-auth/me')
  .then(function (data) {
    partner = data.partner;
    fillForm();
    renderAll();
  })
  .catch(function (err) { show('load-error', err.message); });
