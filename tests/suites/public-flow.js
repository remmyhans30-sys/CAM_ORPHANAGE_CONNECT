const { connect, sleep } = require('../helpers/browser');
const SITE = 'http://127.0.0.2:4555';
const out = (l, v) => console.log(l.padEnd(58), v);

// A new account of the given kind ('user' = donor, 'volunteer' = orphanage); returns its sign-in token.
async function signUp(role, fullname) {
  const email = role + Date.now() + Math.floor(Math.random() * 1000) + '@example.com';
  const res = await fetch(SITE + '/api/users/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acceptTerms: true, fullname, email, password: 'secret1', role }) });
  const body = await res.json();
  if (!body.token) throw new Error('Could not sign up a ' + role + ': ' + JSON.stringify(body));
  return body.token;
}

(async () => {
  const cast = { donorToken: await signUp('user', 'Amara Flow'), orphToken: await signUp('volunteer', 'Hope Flow Home') };
  const b = await connect();
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

  // the Join buttons carry the account type to the sign-up page
  await b.go(SITE + '/login/forgot-password.html');
  await b.js('localStorage.clear(); sessionStorage.clear()');
  await b.go(SITE + '/index.html', `document.querySelectorAll('.hero .btn').length >= 3`);
  const hrefs = await b.js(`[...document.querySelectorAll('.hero .btn-row a')].map(a => a.getAttribute('href')).join(' , ')`);
  out('1 hero buttons:', hrefs);
  for (const [role, label, expected] of [['user', 'Give as a donor', 'Your full name'], ['volunteer', 'Register your orphanage', 'Orphanage name'], ['partner', 'Become a partner', 'Organization name']]) {
    await b.go(SITE + '/index.html', `document.querySelectorAll('.hero .btn').length >= 3`);
    await b.js(`[...document.querySelectorAll('.hero .btn-row a')].find(a => a.textContent.includes('${label}')).click()`);
    await b.waitFor(`location.pathname === '/login/register.html' && !!document.getElementById('fullname')`);
    const state = await b.js(`({ checked: document.querySelector('input[name="role"]:checked') && document.querySelector('input[name="role"]:checked').value, placeholder: document.getElementById('fullname').placeholder })`);
    out('2 "' + label + '" opens sign-up with:', state.checked + ' / "' + state.placeholder + '"' + (state.checked === role && state.placeholder === expected ? '  ok' : '  MISMATCH'));
  }

  // header menu on a phone
  await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await b.go(SITE + '/index.html', `!!document.getElementById('navToggle')`);
  const menuVisible = () => b.js(`getComputedStyle(document.getElementById('navMenu')).display !== 'none'`);
  out('3 phone: menu closed at first:', !(await menuVisible()));
  await b.js(`document.getElementById('navToggle').click()`);
  out('4 phone: menu opens, links shown:', (await menuVisible()) + ' / ' + (await b.js(`document.querySelectorAll('#navMenu .nav-links a').length`)) + ' links');
  await b.js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  out('5 phone: Escape closes it:', !(await menuVisible()));

  // the header recognises signed-in people
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await b.go(SITE + '/login/forgot-password.html');
  await b.js(`sessionStorage.setItem('cocSession', JSON.stringify({fullname:'Amara',email:'d',role:'user',token:'${cast.donorToken}'}))`);
  await b.go(SITE + '/index.html', `!!document.querySelector('.nav-actions')`);
  out('6 signed-in donor sees on the home page:', await b.js(`document.querySelector('.nav-actions').innerText.trim()`) + ' -> ' + await b.js(`document.querySelector('.nav-actions a').getAttribute('href')`));
  await b.go(SITE + '/login/forgot-password.html');
  await b.js(`sessionStorage.clear(); sessionStorage.setItem('cocSession', JSON.stringify({fullname:'Hope',email:'o',role:'volunteer',token:'${cast.orphToken}'}))`);
  await b.go(SITE + '/index.html', `!!document.querySelector('.nav-actions')`);
  out('7 signed-in orphanage links to:', await b.js(`document.querySelector('.nav-actions a').getAttribute('href')`));
  await b.go(SITE + '/login/forgot-password.html');
  await b.js(`sessionStorage.clear(); localStorage.clear()`);
  await b.go(SITE + '/index.html', `!!document.querySelector('.nav-actions')`);
  out('8 visitor sees:', await b.js(`document.querySelector('.nav-actions').innerText.replace(/\\s+/g, ' ').trim()`));

  // live numbers and contact details come from the backend
  const stats = await (await fetch(SITE + '/api/site/stats')).json();
  await b.go(SITE + '/index.html', `![...document.querySelectorAll('[data-stat]')].some(e => e.textContent === '-')`);
  const shown = await b.js(`[...document.querySelectorAll('[data-stat]')].map(e => e.textContent).join(' | ')`);
  out('9 home page numbers (page):', shown);
  out('10 backend numbers (api):', [stats.verifiedOrphanages, stats.openNeeds, stats.totalPledged.toLocaleString('en-US') + ' XAF', stats.approvedDonors, stats.verifiedPartners].join(' | '));

  // contact details set in the admin Settings page show up on the Contact page
  const login = await (await fetch(SITE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' }) })).json();
  await b.go(SITE + '/contact.html', `document.readyState === 'complete'`);
  await sleep(800);
  out('11 contact page before settings (email row hidden):', await b.js(`document.querySelector('[data-site-row="email"]').hidden`));
  await fetch(SITE + '/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token }, body: JSON.stringify({ orgEmail: 'hello@camorphanage.org', orgPhone: '+237 600 000 000', orgAddress: 'Buea, Southwest Region, Cameroon', orgDescription: 'A small team in Cameroon connecting homes and supporters.' }) });
  await b.go(SITE + '/contact.html', `document.readyState === 'complete'`);
  await sleep(1200);
  out('12 after admin saves Settings, Contact shows:', await b.js(`[...document.querySelectorAll('.contact-list li')].filter(li => !li.hidden).map(li => li.innerText.replace(/\\s+/g, ' ').trim().slice(0, 45)).join(' ; ')`));
  out('13 email link:', await b.js(`document.querySelector('[data-site="email"]').getAttribute('href')`));
  await b.go(SITE + '/about.html', `document.readyState === 'complete'`);
  await sleep(1000);
  out('14 About page shows the team description:', await b.js(`!document.querySelector('[data-site-block="description"]').hidden && document.querySelector('[data-site="description"]').textContent.slice(0, 40)`));
  out('15 page JS errors:', b.errors.length ? b.errors.join(' | ') : 'none');
  b.close();
  process.exit(0);
})().catch((e) => { console.error('TEST FAILED', e); process.exit(1); });
