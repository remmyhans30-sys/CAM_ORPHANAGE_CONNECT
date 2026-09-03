document.getElementById('add-orphanage-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const documentFiles = Array.from(document.getElementById('orphanage-documents').files);

  const orphanage = {
    id: Date.now(),
    name: document.getElementById('orphanage-name').value.trim(),
    location: document.getElementById('orphanage-location').value.trim(),
    registrationNumber: document.getElementById('orphanage-reg-number').value.trim(),
    story: document.getElementById('orphanage-story').value.trim(),
    status: document.getElementById('orphanage-status').value,
    childrenCount: Number(document.getElementById('orphanage-children').value) || 0,
    documents: documentFiles.map(function (file) { return file.name; }),
  };

  const orphanages = JSON.parse(localStorage.getItem('orphanages') || '[]');
  orphanages.push(orphanage);
  localStorage.setItem('orphanages', JSON.stringify(orphanages));

  const successBox = document.getElementById('add-orphanage-success');
  successBox.classList.remove('d-none');
  this.reset();
});
