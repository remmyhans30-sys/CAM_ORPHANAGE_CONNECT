if (!localStorage.getItem('currentAdminEmail')) { window.location.href = 'index.html'; }

function loadPartners() {
  return JSON.parse(localStorage.getItem('partners') || '[]');
}

function savePartners(partners) {
  localStorage.setItem('partners', JSON.stringify(partners));
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

function statusLabel(status) {
  if (status === 'needs-info') return 'Needs info';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function matchesStatusFilter(status, filter) {
  if (filter === 'all') return status !== 'rejected';
  return status === filter;
}

const STALE_PENDING_DAYS = 10;

function daysPending(partner) {
  if (!partner.submittedDate) return null;
  const ms = Date.now() - new Date(partner.submittedDate).getTime();
  return Math.floor(ms / 86400000);
}

function isUrgent(partner) {
  if (partner.verificationStatus !== 'pending' && partner.verificationStatus !== 'needs-info') return false;
  const days = daysPending(partner);
  return days !== null && days >= STALE_PENDING_DAYS;
}

function render() {
  const allPartners = loadPartners();
  const grid = document.getElementById('partners-grid');
  const emptyState = document.getElementById('empty-state');
  const filterEmptyState = document.getElementById('filter-empty-state');

  grid.innerHTML = '';

  if (allPartners.length === 0) {
    grid.classList.add('d-none');
    filterEmptyState.classList.add('d-none');
    emptyState.classList.remove('d-none');
    return;
  }

  emptyState.classList.add('d-none');

  const search = document.getElementById('search-input').value.trim().toLowerCase();
  const statusFilter = document.getElementById('status-filter').value;
  const partners = allPartners.filter(function (p) {
    const matchesSearch = !search || (p.name || '').toLowerCase().includes(search);
    return matchesSearch && matchesStatusFilter(p.verificationStatus, statusFilter);
  });

  if (partners.length === 0) {
    grid.classList.add('d-none');
    filterEmptyState.classList.remove('d-none');
    return;
  }

  grid.classList.remove('d-none');
  filterEmptyState.classList.add('d-none');

  partners.forEach(function (partner) {
    const col = document.createElement('div');
    col.className = 'col-md-6 col-lg-4';

    col.innerHTML =
      '<div class="card card-admin p-4 h-100 d-flex flex-column">' +
        '<div class="d-flex align-items-center gap-3 mb-3">' +
          '<div class="avatar partner-avatar' + (partner.logoUrl ? ' has-photo' : '') + '" style="width:56px;height:56px;font-size:18px; flex-shrink:0;">' +
            (partner.logoUrl ? '<img src="' + encodeURI(partner.logoUrl) + '" alt="">' : initials(partner.name)) +
          '</div>' +
          '<div>' +
            '<h3 class="h6 mb-1">' + escapeHtml(partner.name) + '</h3>' +
            '<span class="status-badge status-' + partner.verificationStatus + '">' + escapeHtml(statusLabel(partner.verificationStatus)) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="d-flex flex-wrap gap-2 mb-3">' +
          '<span class="tier-tag tier-friend">' + escapeHtml(partner.orgType) + '</span>' +
          '<span class="tier-tag ' + (partner.tier === 'Verified Referrer' ? 'tier-sustainer' : 'tier-champion') + '">' + escapeHtml(partner.tier) + '</span>' +
          (isUrgent(partner) ? '<span class="profile-urgent-badge">&#9201; Urgent</span>' : '') +
        '</div>' +
        '<p class="text-muted small mb-3">' + escapeHtml(partner.contactName || '') + (partner.country ? ' &middot; ' + escapeHtml(partner.country) : '') + '</p>' +
        '<a href="partner-profile.html?id=' + encodeURIComponent(partner.id) + '" class="btn btn-admin-primary btn-sm mt-auto">Review profile</a>' +
      '</div>';

    grid.appendChild(col);
  });
}

function seedSampleData() {
  const samplePartners = [
    {
      id: 1,
      name: 'Bafoussam Diaspora Trust',
      contactName: 'Emmanuel Fotso',
      email: 'contact@bafoussamdiaspora.org',
      country: 'France',
      submittedDate: '2025-10-20',
      verificationStatus: 'verified',
      orgType: 'Diaspora Association',
      tier: 'Sponsor',
      status: 'active',
      totalContributed: 1250000,
      placementReferralsCount: 0,
      orphanagesSponsored: [
        { name: "Hope Children's Home", sponsorSince: '2025-11-01', amount: 700000 },
        { name: 'Grace Orphanage', sponsorSince: '2026-03-15', amount: 550000 },
      ],
      pledge: {
        description: "Matches donor gifts to Hope Children's Home up to 500,000 FCFA per year.",
        limit: 500000,
        used: 210000,
      },
      sponsoredByBlurb: 'Proud to support the children of Hope Children\'s Home alongside our diaspora community in France.',
      documents: ['association-registration.pdf', 'board-member-id.pdf'],
      sanctionsScreened: true,
      activityLog: [
        { reviewer: 'admin@camorphanage.org', action: 'Marked as verified', timestamp: '2025-11-05T10:00:00.000Z' },
        { reviewer: 'admin@camorphanage.org', action: 'Approved public "Sponsored by" wording', timestamp: '2025-11-06T09:30:00.000Z' },
      ],
    },
    {
      id: 2,
      name: 'Douala Business Alliance',
      contactName: 'Rose Ateba',
      email: 'partnerships@doualabusiness.org',
      country: 'Cameroon',
      submittedDate: '2026-08-10',
      verificationStatus: 'pending',
      orgType: 'Corporate',
      tier: 'Sponsor',
      status: 'active',
      totalContributed: 0,
      placementReferralsCount: 0,
      orphanagesSponsored: [],
      pledge: {
        description: "Proposes to match donor gifts to Sunrise Children's Home up to 300,000 FCFA for its first year.",
        limit: 300000,
        used: 0,
      },
      sponsoredByBlurb: 'Douala Business Alliance is proud to sponsor local children in our community.',
      documents: ['company-registration.pdf', 'tax-clearance-certificate.pdf'],
      sanctionsScreened: false,
      activityLog: [
        { reviewer: 'system', action: 'Organization submitted registration for review', timestamp: '2026-09-02T14:20:00.000Z' },
      ],
    },
    {
      id: 3,
      name: 'Global Child Aid NGO',
      contactName: 'Samuel Ngu',
      email: 'contact@globalchildaid.org',
      country: 'United Kingdom',
      submittedDate: '2024-08-25',
      verificationStatus: 'verified',
      orgType: 'NGO',
      tier: 'Verified Referrer',
      status: 'active',
      totalContributed: 3200000,
      placementReferralsCount: 4,
      orphanagesSponsored: [
        { name: 'Grace Orphanage', sponsorSince: '2024-09-10', amount: 1800000 },
      ],
      pledge: null,
      sponsoredByBlurb: 'Global Child Aid NGO helps fund emergency care placements across the region.',
      documents: ['ngo-registration.pdf', 'safeguarding-policy.pdf', 'director-id.pdf'],
      sanctionsScreened: true,
      placementCases: [
        {
          submittedDate: '2026-08-20',
          socialWorkerName: 'Grace Mballa',
          socialWorkerPhone: '+237 691 234 567',
          reasonForReferral: 'Child abandoned after both parents deceased; no extended family able to care for her.',
          placementType: 'Residential care',
          educationalStatus: 'Not currently in school',
          livingEnvironmentNotes: 'Previously in an informal neighbor arrangement; unstable and unsupervised.',
          anticipatedDischargeDate: '',
          status: 'pending',
        },
        {
          submittedDate: '2026-06-02',
          socialWorkerName: 'Paul Etoundi',
          socialWorkerPhone: '+237 677 890 123',
          reasonForReferral: 'Removed from home due to neglect; father incarcerated, mother unable to provide care.',
          placementType: 'Residential care',
          educationalStatus: 'Regular education, primary level',
          livingEnvironmentNotes: 'Significant instability over past 2 years, multiple relocations.',
          anticipatedDischargeDate: '2027-06-01',
          status: 'reviewed',
        },
      ],
      activityLog: [
        { reviewer: 'admin@camorphanage.org', action: 'Marked as verified', timestamp: '2024-09-01T08:00:00.000Z' },
        { reviewer: 'admin@camorphanage.org', action: 'Upgraded to Verified Referrer', timestamp: '2024-09-12T11:00:00.000Z' },
      ],
    },
    {
      id: 4,
      name: 'Bafoussam Community Fund',
      contactName: 'Emmanuel F.',
      email: 'contact@bafoussamdiaspora.org',
      country: 'France',
      submittedDate: '2026-09-01',
      verificationStatus: 'pending',
      orgType: 'Diaspora Association',
      tier: 'Sponsor',
      status: 'active',
      totalContributed: 0,
      placementReferralsCount: 0,
      orphanagesSponsored: [],
      pledge: null,
      sponsoredByBlurb: '',
      documents: [],
      sanctionsScreened: false,
      activityLog: [],
    },
    {
      id: 5,
      name: 'Yaoundé Traders Union',
      contactName: 'Paul Biya Jr.',
      email: 'contact@yaoundetraders.org',
      country: 'Cameroon',
      submittedDate: '2026-07-15',
      verificationStatus: 'rejected',
      rejectionReason: 'Registration certificate did not match the organization name provided.',
      appealMessage: 'We have corrected the registration paperwork and re-submitted it under the correct legal name. Please review again.',
      appealDate: '2026-08-30',
      orgType: 'Corporate',
      tier: 'Sponsor',
      status: 'active',
      totalContributed: 0,
      placementReferralsCount: 0,
      orphanagesSponsored: [],
      pledge: null,
      sponsoredByBlurb: '',
      documents: ['registration-certificate-corrected.pdf'],
      sanctionsScreened: false,
      activityLog: [
        { reviewer: 'admin@camorphanage.org', action: 'Rejected', timestamp: '2026-07-20T12:00:00.000Z' },
      ],
    },
  ];

  savePartners(samplePartners);
  render();
}

function clearAllData() {
  if (!confirm('Clear all partner organization data? This cannot be undone.')) return;
  localStorage.removeItem('partners');
  render();
}

document.getElementById('seed-btn').addEventListener('click', seedSampleData);
document.getElementById('clear-btn').addEventListener('click', clearAllData);
document.getElementById('status-filter').addEventListener('change', render);
document.getElementById('search-input').addEventListener('input', render);

render();
