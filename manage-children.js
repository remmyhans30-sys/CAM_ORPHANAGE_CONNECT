/*
 * Manage Children (admin): add / edit / delete child profiles.
 * Persists via localStorage, seeded from the sample CHILDREN list in
 * ../shared/data.js on first load.
 */

(function () {
  const STORAGE_KEY = 'camoc_admin_children_v1';

  const childrenBody = document.getElementById('childrenBody');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const orphanageFilter = document.getElementById('orphanageFilter');
  const statusFilter = document.getElementById('statusFilter');
  const addChildBtn = document.getElementById('addChildBtn');

  const childModalEl = document.getElementById('childModal');
  const childModal = new bootstrap.Modal(childModalEl);
  const childModalLabel = document.getElementById('childModalLabel');
  const childForm = document.getElementById('childForm');
  const childSubmitBtn = document.getElementById('childSubmitBtn');
  const childIdInput = document.getElementById('childId');
  const childName = document.getElementById('childName');
  const childAge = document.getElementById('childAge');
  const childGender = document.getElementById('childGender');
  const childOrphanage = document.getElementById('childOrphanage');
  const childStatus = document.getElementById('childStatus');
  const childNotes = document.getElementById('childNotes');

  let children = [];

  function loadChildren() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        // fall through to reseed on corrupt data
      }
    }
    const seed = getChildren().slice();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }

  function saveChildren() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(children));
  }

  function orphanageName(id) {
    const o = getOrphanageById(id);
    return o ? o.name : 'Unknown orphanage';
  }

  function populateOrphanageOptions() {
    getOrphanages().forEach(function (o) {
      const filterOpt = document.createElement('option');
      filterOpt.value = o.id;
      filterOpt.textContent = o.name;
      orphanageFilter.appendChild(filterOpt);

      const formOpt = document.createElement('option');
      formOpt.value = o.id;
      formOpt.textContent = o.name;
      childOrphanage.appendChild(formOpt);
    });
  }

  function matchesFilters(child) {
    const query = searchInput.value.trim().toLowerCase();
    if (query && !child.name.toLowerCase().includes(query)) return false;
    if (orphanageFilter.value && child.orphanageId !== orphanageFilter.value) return false;
    if (statusFilter.value && child.status !== statusFilter.value) return false;
    return true;
  }

  function statusClass(status) {
    return status === 'Sponsored' ? 'status-sponsored' : 'status-needs-sponsor';
  }

  function rowHtml(child) {
    return (
      '<tr>' +
        '<td>' +
          '<div class="d-flex align-items-center gap-2">' +
            '<img src="' + (child.photo || '../login/images/photo1.jpg') + '" alt="" class="row-avatar">' +
            '<span class="row-name">' + child.name + '</span>' +
          '</div>' +
        '</td>' +
        '<td>' + child.age + '</td>' +
        '<td>' + child.gender + '</td>' +
        '<td>' + orphanageName(child.orphanageId) + '</td>' +
        '<td><span class="badge-status ' + statusClass(child.status) + '">' + child.status + '</span></td>' +
        '<td>' +
          '<button type="button" class="btn-row-action btn-row-edit edit-btn" data-id="' + child.id + '">Edit</button>' +
          '<button type="button" class="btn-row-action btn-row-delete delete-btn" data-id="' + child.id + '">Delete</button>' +
        '</td>' +
      '</tr>'
    );
  }

  function render() {
    const visible = children.filter(matchesFilters);
    childrenBody.innerHTML = visible.map(rowHtml).join('');
    emptyState.classList.toggle('d-none', visible.length > 0);
  }

  function openAddModal() {
    childForm.reset();
    childIdInput.value = '';
    childModalLabel.textContent = 'Add child';
    childSubmitBtn.textContent = 'Add child';
    childModal.show();
  }

  function openEditModal(id) {
    const child = children.find(function (c) { return c.id === id; });
    if (!child) return;

    childIdInput.value = child.id;
    childName.value = child.name;
    childAge.value = child.age;
    childGender.value = child.gender;
    childOrphanage.value = child.orphanageId;
    childStatus.value = child.status;
    childNotes.value = child.notes || '';

    childModalLabel.textContent = 'Edit child';
    childSubmitBtn.textContent = 'Save changes';
    childModal.show();
  }

  function handleSubmit(e) {
    e.preventDefault();

    const record = {
      name: childName.value.trim(),
      age: Number(childAge.value),
      gender: childGender.value,
      orphanageId: childOrphanage.value,
      status: childStatus.value,
      notes: childNotes.value.trim()
    };

    if (!record.name || !record.orphanageId) return;

    if (childIdInput.value) {
      const existing = children.find(function (c) { return c.id === childIdInput.value; });
      Object.assign(existing, record);
    } else {
      children.push(Object.assign({
        id: 'child-' + Date.now(),
        photo: '../login/images/photo' + (1 + Math.floor(Math.random() * 8)) + '.jpg'
      }, record));
    }

    saveChildren();
    render();
    childModal.hide();
  }

  function handleDelete(id) {
    const child = children.find(function (c) { return c.id === id; });
    if (!child) return;
    if (!window.confirm('Remove ' + child.name + '\'s profile? This cannot be undone.')) return;

    children = children.filter(function (c) { return c.id !== id; });
    saveChildren();
    render();
  }

  childrenBody.addEventListener('click', function (e) {
    const editBtn = e.target.closest('.edit-btn');
    if (editBtn) { openEditModal(editBtn.dataset.id); return; }

    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn) { handleDelete(deleteBtn.dataset.id); }
  });

  addChildBtn.addEventListener('click', openAddModal);
  childForm.addEventListener('submit', handleSubmit);
  searchInput.addEventListener('input', render);
  orphanageFilter.addEventListener('change', render);
  statusFilter.addEventListener('change', render);

  populateOrphanageOptions();
  children = loadChildren();
  render();
})();
