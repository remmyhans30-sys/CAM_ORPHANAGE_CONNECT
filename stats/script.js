/*
 * Statistics view: aggregates across orphanages/needs from the shared
 * data contract in ../shared/data.js. Every number here is derived from
 * need = { title, raised, goal, percent } — nothing is invented.
 */

(function () {
  const CHART_COLORS = {
    coral: '#FF6F59',
    gold: '#FFC857',
    teal: '#1B998B',
    dawnPurple: '#2B2250',
    ink: '#221A3D'
  };

  function formatXAF(amount) {
    return amount.toLocaleString('en-US') + ' XAF';
  }

  function buildOrphanageSummaries() {
    return getOrphanages().map(function (orphanage) {
      const raised = orphanage.needs.reduce(function (sum, n) { return sum + n.raised; }, 0);
      const goal = orphanage.needs.reduce(function (sum, n) { return sum + n.goal; }, 0);
      const percent = goal > 0 ? Math.round((raised / goal) * 100) : 0;
      return {
        id: orphanage.id,
        name: orphanage.name,
        verified: orphanage.verified,
        needCount: orphanage.needs.length,
        raised: raised,
        goal: goal,
        percent: percent
      };
    });
  }

  function buildTotals(orphanageSummaries, allNeeds) {
    const totalRaised = orphanageSummaries.reduce(function (sum, o) { return sum + o.raised; }, 0);
    const totalGoal = orphanageSummaries.reduce(function (sum, o) { return sum + o.goal; }, 0);
    const needsFunded = allNeeds.filter(function (n) { return n.need.percent >= 100; }).length;
    const verifiedCount = orphanageSummaries.filter(function (o) { return o.verified; }).length;

    return {
      totalRaised: totalRaised,
      totalGoal: totalGoal,
      overallPercent: totalGoal > 0 ? Math.round((totalRaised / totalGoal) * 100) : 0,
      orphanageCount: orphanageSummaries.length,
      verifiedCount: verifiedCount,
      needCount: allNeeds.length,
      needsFunded: needsFunded
    };
  }

  function renderTiles(totals) {
    const tiles = [
      {
        label: 'Total raised',
        value: formatXAF(totals.totalRaised),
        sub: totals.overallPercent + '% of ' + formatXAF(totals.totalGoal) + ' goal',
        accent: 'coral'
      },
      {
        label: 'Needs funded',
        value: totals.needsFunded + ' / ' + totals.needCount,
        sub: 'active needs fully met',
        accent: 'teal'
      },
      {
        label: 'Orphanages',
        value: String(totals.orphanageCount),
        sub: totals.verifiedCount + ' verified',
        accent: 'gold'
      },
      {
        label: 'Avg. progress',
        value: totals.overallPercent + '%',
        sub: 'across all active needs',
        accent: 'purple'
      }
    ];

    document.getElementById('statTiles').innerHTML = tiles.map(function (t) {
      return (
        '<div class="col-6 col-lg-3">' +
          '<div class="stat-tile accent-' + t.accent + '">' +
            '<p class="stat-label">' + t.label + '</p>' +
            '<p class="stat-value">' + t.value + '</p>' +
            '<p class="stat-sub">' + t.sub + '</p>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  function renderBreakdownTable(orphanageSummaries) {
    const tbody = document.getElementById('breakdownBody');
    tbody.innerHTML = orphanageSummaries.map(function (o) {
      const pct = Math.max(0, Math.min(100, o.percent));
      const funded = pct >= 100;
      const badge = o.verified
        ? '<span class="badge-verified">Verified</span>'
        : '<span class="badge-unverified">Unverified</span>';

      return (
        '<tr>' +
          '<td class="orphanage-name">' + o.name + '</td>' +
          '<td>' + badge + '</td>' +
          '<td>' + o.needCount + '</td>' +
          '<td>' + formatXAF(o.raised) + '</td>' +
          '<td>' + formatXAF(o.goal) + '</td>' +
          '<td>' +
            '<div class="breakdown-progress">' +
              '<div class="progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
                '<div class="progress-bar' + (funded ? ' is-funded' : '') + '" style="width:' + pct + '%"></div>' +
              '</div>' +
              '<span class="breakdown-pct">' + pct + '%</span>' +
            '</div>' +
          '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function renderOrphanageChart(orphanageSummaries) {
    const ctx = document.getElementById('orphanageChart');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: orphanageSummaries.map(function (o) { return o.name; }),
        datasets: [
          {
            label: 'Raised',
            data: orphanageSummaries.map(function (o) { return o.raised; }),
            backgroundColor: CHART_COLORS.coral,
            borderRadius: 6,
            maxBarThickness: 28
          },
          {
            label: 'Goal',
            data: orphanageSummaries.map(function (o) { return o.goal; }),
            backgroundColor: CHART_COLORS.gold,
            borderRadius: 6,
            maxBarThickness: 28
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: { color: CHART_COLORS.ink, font: { family: 'Work Sans' } },
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: CHART_COLORS.ink,
              font: { family: 'Work Sans' },
              callback: function (value) { return value.toLocaleString('en-US'); }
            },
            grid: { color: '#F1EEE5' }
          }
        },
        plugins: {
          legend: {
            labels: { color: CHART_COLORS.ink, font: { family: 'Work Sans' } }
          },
          tooltip: {
            callbacks: {
              label: function (item) { return item.dataset.label + ': ' + formatXAF(item.raw); }
            }
          }
        }
      }
    });
  }

  function renderStatusChart(allNeeds) {
    const funded = allNeeds.filter(function (n) { return n.need.percent >= 100; }).length;
    const inProgress = allNeeds.filter(function (n) { return n.need.percent > 0 && n.need.percent < 100; }).length;
    const notStarted = allNeeds.filter(function (n) { return n.need.percent <= 0; }).length;

    const ctx = document.getElementById('statusChart');
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Funded', 'In progress', 'Not started'],
        datasets: [{
          data: [funded, inProgress, notStarted],
          backgroundColor: [CHART_COLORS.teal, CHART_COLORS.coral, '#E0D9C8'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: CHART_COLORS.ink, font: { family: 'Work Sans' } }
          }
        }
      }
    });
  }

  const orphanageSummaries = buildOrphanageSummaries();
  const allNeeds = getAllNeeds();
  const totals = buildTotals(orphanageSummaries, allNeeds);

  renderTiles(totals);
  renderBreakdownTable(orphanageSummaries);
  renderOrphanageChart(orphanageSummaries);
  renderStatusChart(allNeeds);
})();
