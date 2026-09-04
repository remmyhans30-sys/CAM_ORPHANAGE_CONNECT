const orphanageSelect = document.getElementById('need-orphanage');
const orphanages = JSON.parse(localStorage.getItem('orphanages') || '[]');

if (orphanages.length === 0) {
  document.getElementById('no-orphanages-hint').classList.remove('d-none');
} else {
  orphanages.forEach(function (orphanage) {
    const option = document.createElement('option');
    option.value = orphanage.id;
    option.textContent = orphanage.name;
    orphanageSelect.appendChild(option);
  });
}

document.getElementById('add-need-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const goal = Number(document.getElementById('need-goal').value);
  const orphanageId = orphanageSelect.value;

  const need = {
    title: document.getElementById('need-title').value.trim(),
    raised: 0,
    goal: goal,
    percent: 0,
    orphanageId: orphanageId,
    date: new Date().toISOString().slice(0, 10),
  };

  const needs = JSON.parse(localStorage.getItem('needs') || '[]');
  needs.push(need);
  localStorage.setItem('needs', JSON.stringify(needs));

  const successBox = document.getElementById('add-need-success');
  successBox.classList.remove('d-none');
  this.reset();
});
