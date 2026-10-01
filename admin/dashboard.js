/*
 * Admin dashboard: read-only summary tiles pulled from the same
 * localStorage-backed data the management pages write to (falling back to
 * the seed data in ../shared/data.js when a page hasn't been visited yet).
 */

(function () {
  const CHILDREN_KEY = 'camoc_admin_children_v1';
  const NEEDS_KEY = 'camoc_admin_needs_v1';
  const VISITS_KEY = 'camoc_admin_visits_v1';

  function formatXAF(amount) {
    return amount.toLocaleString('en-US') + ' XAF';
  }

  function readJSON(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function loadChildren() {
    return readJSON(CHILDREN_KEY, getChildren());
  }

  function loadNeeds() {
    const map = readJSON(NEEDS_KEY, null);
    if (map) {
      return Object.keys(map).reduce(function (rows, orphanageId) {
        return rows.concat(map[orphanageId]);
      }, []);
    }
    return getOrphanages().reduce(function (rows, o) {
      return rows.concat(o.needs);
    }, []);
  }

  function loadVisits() {
    return readJSON(VISITS_KEY, getVisitRequests());
  }

  function renderTiles() {
    const orphanages = getOrphanages();
    const children = loadChildren();
    const needs = loadNeeds();
    const visits = loadVisits();
    const donations = getDonations();

    const needingSponsor = children.filter(function (c) { return c.status === 'Needs Sponsor'; }).length;
    const fundedNeeds = needs.filter(function (n) { return n.percent >= 100; }).length;
    const totalRaised = needs.reduce(function (sum, n) { return sum + n.raised; }, 0);
    const pendingVisits = visits.filter(function (v) { return v.status === 'Pending'; }).length;
    const totalDonated = donations
      .filter(function (d) { return d.status === 'Completed'; })
      .reduce(function (sum, d) { return sum + d.amount; }, 0);

    const tiles = [
      { label: 'Orphanages', value: String(orphanages.length), sub: orphanages.filter(function (o) { return o.verified; }).length + ' verified', accent: 'coral' },
      { label: 'Children', value: String(children.length), sub: needingSponsor + ' need a sponsor', accent: 'gold' },
      { label: 'Active needs', value: String(needs.length), sub: fundedNeeds + ' fully funded', accent: 'teal' },
      { label: 'Total raised', value: formatXAF(totalRaised), sub: 'across all needs', accent: 'purple' },
      { label: 'Pending visit requests', value: String(pendingVisits), sub: visits.length + ' total requests', accent: 'coral' },
      { label: 'Donations received', value: formatXAF(totalDonated), sub: donations.length + ' donations logged', accent: 'gold' }
    ];

    document.getElementById('dashboardTiles').innerHTML = tiles.map(function (t) {
      return (
        '<div class="col-6 col-lg-4">' +
          '<div class="stat-tile accent-' + t.accent + '">' +
            '<p class="stat-label">' + t.label + '</p>' +
            '<p class="stat-value">' + t.value + '</p>' +
            '<p class="stat-sub mb-0">' + t.sub + '</p>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  renderTiles();
})();
