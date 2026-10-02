// Opens every page as the right kind of user, at phone / tablet / desktop widths, and reports
// horizontal overflow, page errors and backend requests that failed.
const { connect, sleep } = require('../helpers/browser');
const SITE = 'http://127.0.0.2:4555';
const J = { 'Content-Type': 'application/json' };
const WIDTHS = [360, 768, 1280];

(async () => {
  const stamp = Date.now();
  const api = async (path, method, body, token) => (await fetch(SITE + '/api' + path, { method: method || 'GET', headers: Object.assign({}, J, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined })).json();
  const login = await api('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' });
  const admin = login.token;

  // a full cast: verified orphanage with needs and a pledge, approved donor, verified partner, chats
  const orph = await api('/users/register', 'POST', { acceptTerms: true, fullname: 'Audit Home ' + stamp, email: 'ao' + stamp + '@example.com', password: 'secret1', role: 'volunteer' });
  const need = (await api('/my-orphanage/needs', 'POST', { title: 'School books', description: 'Books for the term', goal: 90000 }, orph.token)).need;
  const oid = (await api('/orphanages', 'GET', null, admin)).orphanages.find((o) => o.name === 'Audit Home ' + stamp).id;
  await api('/orphanages/' + oid, 'PUT', { status: 'verified', registrationNumber: 'REG-' + Date.now() + Math.random().toString(36).slice(2, 7), termsAgreed: true }, admin);
  const donor = await api('/users/register', 'POST', { acceptTerms: true, fullname: 'Audit Donor', email: 'ad' + stamp + '@example.com', password: 'secret1', role: 'user' });
  const drow = (await api('/donors', 'GET', null, admin)).donors.find((d) => d.email === 'ad' + stamp + '@example.com');
  await api('/donors/' + drow.id, 'PUT', { status: 'active' }, admin);
  await api('/pledges', 'POST', { needId: need.id, amount: 5000 }, donor.token);
  const partner = await api('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Audit Partner', email: 'ap' + stamp + '@example.com', password: 'secret1' });
  const prow = (await api('/partners', 'GET', null, admin)).partners.find((p) => p.email === 'ap' + stamp + '@example.com');
  await api('/partners/' + prow.id, 'PUT', { verificationStatus: 'verified', sanctionsScreened: true, termsAgreed: true }, admin);
  await api('/my-messages/chats', 'POST', { withType: 'orphanage', withId: oid, text: 'Hello from the audit donor' }, donor.token);
  await api('/my-messages/team/reply', 'POST', { text: 'Question for the team' }, donor.token);

  const SESSIONS = {
    visitor: '',
    admin: `localStorage.setItem('adminToken','${admin}');localStorage.setItem('currentAdminEmail','${login.admin.email}');localStorage.setItem('currentAdminRole','${login.admin.role}');localStorage.setItem('currentAdminDisplayName','${login.admin.name}')`,
    donor: `sessionStorage.setItem('cocSession', JSON.stringify({fullname:'Audit Donor',email:'d',role:'user',token:'${donor.token}'}))`,
    orphanage: `sessionStorage.setItem('cocSession', JSON.stringify({fullname:'Audit Home',email:'o',role:'volunteer',token:'${orph.token}'}))`,
    partner: `localStorage.setItem('partnerToken','${partner.token}');localStorage.setItem('partnerEmail','p')`,
  };

  const PAGES = [
    ['visitor', ['login/reset-password.html', 'index.html', 'how-it-works.html', 'for-donors.html', 'for-orphanages.html', 'for-partners.html', 'about.html', 'faq.html', 'contact.html', 'safeguarding.html', 'terms.html', 'credits.html', 'login/index.html', 'login/register.html', 'login/register.html?role=partner', 'login/forgot-password.html', 'admin/index.html', 'partner/index.html']],
    ['donor', ['donor/index.html', 'donor/orphanage.html?id=' + oid, 'donor/profile.html', 'donor/messages.html']],
    ['orphanage', ['orphanage/index.html']],
    ['partner', ['partner/dashboard.html', 'partner/profile.html', 'partner/orphanages.html', 'partner/orphanage-view.html?id=' + oid, 'partner/messages.html']],
    ['admin', ['admin/visits.html', 'admin/dashboard.html', 'admin/verification.html', 'admin/donors.html', 'admin/donor-profile.html?id=' + drow.id, 'admin/partners.html', 'admin/partner-profile.html?id=' + prow.id, 'admin/programs.html', 'admin/needs.html', 'admin/donations.html', 'admin/finance.html', 'admin/reports.html', 'admin/messages.html', 'admin/conversations.html', 'admin/settings.html', 'admin/users.html', 'admin/activity-log.html', 'admin/profile.html']],
  ];

  const b = await connect();
  let problems = 0;
  const report = [];

  for (const [who, pages] of PAGES) {
    for (const page of pages) {
      // fresh session for this page
      await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
      await b.go(SITE + '/login/forgot-password.html');
      await b.js('localStorage.clear(); sessionStorage.clear(); ' + SESSIONS[who]);

      const row = { who, page, overflow: {}, errors: [], net: [] };
      for (const width of WIDTHS) {
        b.errors.length = 0;
        b.netIssues.length = 0;
        await b.send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: width < 500 });
        await b.go(SITE + '/' + page);
        await sleep(1800); // let the page load its data
        // scroll through so lazy images load
        const total = await b.js('document.documentElement.scrollHeight');
        for (let y = 0; y < total; y += 600) { await b.js('window.scrollTo(0,' + y + ')'); await sleep(60); }
        await b.js('window.scrollTo(0,0)');
        const over = await b.js(`(() => {
          const vw = document.documentElement.clientWidth;
          const worst = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 2 && getComputedStyle(e).position !== 'fixed' && !e.closest('.table-responsive, .modal, .offcanvas, [style*="overflow"]'); })
            .slice(0, 3).map(e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '') + ' +' + Math.round(e.getBoundingClientRect().right - vw));
          return { px: document.documentElement.scrollWidth - vw, worst };
        })()`);
        row.overflow[width] = over.px > 1 ? over.px + 'px (' + over.worst.join(', ') + ')' : 'ok';
        if (width === 1280) {
          row.errors = b.errors.slice();
          row.net = b.netIssues.filter((u) => u.includes('127.0.0.2')).slice();
        }
      }
      const bad = Object.values(row.overflow).some((v) => v !== 'ok') || row.errors.length || row.net.length;
      if (bad) problems++;
      report.push(row);
      console.log((bad ? 'ISSUE ' : 'ok    ') + (who + ' ' + page).padEnd(52) + ' overflow 360/768/1280: ' + WIDTHS.map((w) => row.overflow[w] === 'ok' ? 'ok' : row.overflow[w]).join(' / ') +
        (row.errors.length ? ' | JS: ' + row.errors.join(' ; ') : '') + (row.net.length ? ' | NET: ' + row.net.join(' ; ') : ''));
    }
  }
  console.log('\nPages checked:', report.length, '| pages with issues:', problems);
  if (problems === 0) console.log('ALL PASSED');
  b.close();
  process.exit(problems ? 1 : 0);
})().catch((e) => { console.error('AUDIT FAILED', e); process.exit(1); });
