// A donor opens an orphanage's full profile from the Give page, reads it, pledges from it.
const { fixture } = require('../helpers/fixtures');
const fs = require('fs');
const path = require('path');
const { connect, sleep } = require('../helpers/browser');
const SITE = 'http://127.0.0.2:4555';
const A = SITE + '/api';
let failures = 0;
const check = (label, ok, detail) => { console.log(label.padEnd(72), (ok ? 'ok' : 'FAIL') + (detail !== undefined && detail !== '' ? '  ' + detail : '')); if (!ok) failures++; };

async function call(p, method, body, token) {
  const res = await fetch(A + p, { method: method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
// Real photos from the site, and a fake one that passes the upload check but cannot be shown.
const IMG = path.join(__dirname, '..', '..', 'assets', 'img') + '/';
const jpg = (name) => fs.readFileSync(IMG + name).toString('base64');
const brokenPng = fs.readFileSync(fixture('post-photo.png')).toString('base64');

(async () => {
  const stamp = Date.now();
  const NAME = 'UI Profile Home ' + stamp;
  const PHONE = '+237 699 111 ' + String(stamp).slice(-3);
  const EMAIL = 'ui-secret-' + stamp + '@example.com';
  const admin = (await call('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' })).body.token;
  const mk = async (name, role) => (await call('/users/register', 'POST', { acceptTerms: true, fullname: name, email: name.replace(/ /g, '').toLowerCase() + '@example.com', password: 'secret1', role })).body;

  const home = await mk(NAME, 'volunteer');
  await call('/my-orphanage', 'PUT', {
    location: 'Bamenda, North-West', registrationNumber: 'UI-' + stamp, foundedYear: 2009, capacity: 40, childrenCount: 26,
    contactName: 'Mrs Ngum', contactPhone: PHONE, contactEmail: EMAIL, termsAgreed: true, storyLanguage: 'fr',
    story: 'Nous avons commencé en 2009 avec six enfants et une seule pièce.\nLes voisins nous ont aidés.\n\nToday we care for 26 children, and they all go to school.',
    paymentProvider: 'Orange Money', paymentAccountName: 'UI Holder ' + stamp, paymentAccountNumber: '6' + String(stamp).slice(-8),
  }, home.token);
  await call('/my-orphanage/photo', 'POST', { filename: 'home.jpg', data: jpg('hand-pump-1280.jpg') }, home.token);
  await call('/my-orphanage/cover', 'POST', { filename: 'cover.jpg', data: jpg('village-kitchen-1280.jpg') }, home.token);
  const oid = (await call('/orphanages', 'GET', null, admin)).body.orphanages.find((o) => o.name === NAME).id;
  await call('/orphanages/' + oid, 'PUT', { status: 'verified', paymentAccountConfirmed: true }, admin);

  const BROKEN = 'UI Broken Photo Home of the Association for Orphaned and Vulnerable Children of the North-West Region ' + stamp;
  const broken = (await call('/users/register', 'POST', { acceptTerms: true, fullname: BROKEN, email: 'broken' + stamp + '@example.com', password: 'secret1', role: 'volunteer' })).body;
  await call('/my-orphanage', 'PUT', { registrationNumber: 'BR-' + stamp, termsAgreed: true }, broken.token);
  await call('/my-orphanage/photo', 'POST', { filename: 'home.png', data: brokenPng }, broken.token);
  await call('/my-orphanage/cover', 'POST', { filename: 'cover.png', data: brokenPng }, broken.token);
  const brokenId = (await call('/orphanages', 'GET', null, admin)).body.orphanages.find((o) => o.name === BROKEN).id;
  await call('/orphanages/' + brokenId, 'PUT', { status: 'verified' }, admin);
  const needA = (await call('/my-orphanage/needs', 'POST', { title: 'Exercise books ' + stamp, description: 'Books for 26 children', goal: 50000 }, home.token)).body.need;
  const needB = (await call('/my-orphanage/needs', 'POST', { title: 'Mosquito nets ' + stamp, goal: 20000 }, home.token)).body.need;
  const gift = (await call('/my-orphanage/posts', 'POST', { type: 'gift', title: 'New mosquito nets', text: 'Thank you! Every bed has a net now.', photo: { filename: 'nets.jpg', data: jpg('classroom-960.jpg') } }, home.token)).body.post;
  await call('/my-orphanage/posts', 'POST', { type: 'update', text: 'School starts on Monday.' }, home.token);
  const clip = fs.readFileSync(fixture('post-clip.mp4'));
  await fetch(A + '/my-orphanage/posts/' + gift.id + '/video', { method: 'POST', headers: { Authorization: 'Bearer ' + home.token, 'Content-Type': 'video/mp4', 'X-Filename': 'nets.mp4' }, body: clip });
  await call('/my-orphanage/social', 'PUT', { links: { facebook: 'https://www.facebook.com/uiprofilehome', website: 'https://uiprofilehome.example.org' } }, home.token);

  const giver = await mk('UI Giver ' + stamp, 'user');
  const donor = await mk('UI Donor ' + stamp, 'user');
  const waiting = await mk('UI Waiting ' + stamp, 'user');
  await call('/donors/' + giver.user.id, 'PUT', { status: 'active' }, admin);
  await call('/donors/' + donor.user.id, 'PUT', { status: 'active' }, admin);
  await call('/pledges', 'POST', { needId: needB.id, amount: 20000 }, giver.token);

  const b = await connect();
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  const signIn = async (who, name) => {
    await b.go(SITE + '/login/index.html');
    await b.js(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('cocSession', JSON.stringify({ fullname: '${name}', role: 'user', token: '${who.token}' }))`);
  };

  console.log('--- FROM THE GIVE PAGE');
  await signIn(donor, 'UI Donor');
  await b.go(SITE + '/donor/index.html', `document.querySelectorAll('.card-orphanage').length > 0`);
  const card = `[...document.querySelectorAll('.card-orphanage')].find(c => c.innerText.includes('${NAME}'))`;
  check('1 the card has a "View full profile" button', (await b.js(`${card}.querySelector('.orphanage-profile-btn').getAttribute('href')`)) === 'orphanage.html?id=' + oid);
  check('2 the name is a link to the profile too', (await b.js(`${card}.querySelector('.orphanage-name-link').getAttribute('href')`)) === 'orphanage.html?id=' + oid);
  check('3 the card shows only the first lines of the story', (await b.js(`getComputedStyle(${card}.querySelector('.orphanage-story')).webkitLineClamp`)) === '3');
  await b.js(`${card}.querySelector('.orphanage-profile-btn').click()`);
  await b.waitFor(`location.pathname.endsWith('/donor/orphanage.html') && !document.getElementById('profileContent').classList.contains('d-none')`);
  await b.waitFor(`document.querySelectorAll('#updatesPanel .cu-post').length === 2`);

  console.log('--- THE PROFILE');
  const text = (id) => b.js(`document.getElementById('${id}').innerText`);
  check('4 page title is the home\'s name', (await b.js('document.title')) === NAME + ' - CAM Orphanage Connect', await b.js('document.title'));
  check('5 name, verified badge, place and year', (await text('homeName')) === NAME && (await b.js(`!!document.querySelector('.home-identity .badge-verified')`)) && (await text('homeLocation')) === 'Bamenda, North-West · Caring for children since 2009', await text('homeLocation'));
  check('6 cover and profile photos are shown', await b.waitFor(`(() => { const i = [...document.querySelectorAll('#homeCover img, #homeAvatar img')]; return i.length === 2 && i.every(x => x.complete && x.naturalWidth > 0 && /\\/api\\/files\\/photo\\//.test(x.src)); })()`));
  const nameBelowCover = `document.getElementById('homeName').getBoundingClientRect().top >= document.getElementById('homeCover').getBoundingClientRect().bottom`;
  check('6a the name is below the cover photo, not on it', await b.js(nameBelowCover));
  check('6b the buttons at the top line up', await b.js(`(() => { const c = [...document.querySelectorAll('.home-actions .btn')].map(x => { const r = x.getBoundingClientRect(); return Math.round(r.top + r.height / 2); }); return c.length === 3 && c.every(y => Math.abs(y - c[0]) <= 1); })()`));
  const tiles = await b.js(`[...document.querySelectorAll('.home-tile')].map(t => t.innerText.replace(/\\n/g, ' ')).join(' | ')`);
  check('7 fact tiles', tiles === '26 Children in care | 40 Capacity | 2009 Founded | 1 Open need', tiles);
  check('8 the story keeps its paragraphs and line breaks', (await b.js(`document.querySelectorAll('#homeStory p').length`)) === 2 && (await b.js(`document.querySelector('#homeStory p').innerText`)).includes('pièce.\nLes voisins'));
  check('9 a note says the story is in French', (await text('storyLanguage')) === 'Written by the home in French.');
  const trust = await b.js(`[...document.querySelectorAll('#trustFacts dt')].map(dt => dt.innerText + ': ' + dt.nextElementSibling.innerText).join(' | ')`);
  const pretty = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  check('10 what our team checked', trust.includes('VERIFIED: By the CAM Orphanage Connect team on ' + pretty) && trust.includes('UI-' + stamp) && trust.includes('Mrs Ngum') && trust.includes('not a personal one') && /SINCE: \w+ \d{4}/.test(trust), trust);
  const record = await text('recordPanel');
  check('11 support so far', record.includes('20,000 XAF') && record.includes('1 supporter') && record.includes('1 need fully pledged') && record.includes('2 stories and updates shared'), record.replace(/\n/g, ' / '));
  check('12 one open need with a Pledge button', (await b.js(`document.querySelectorAll('#needsList .need-row').length`)) === 1 && (await b.js(`document.querySelector('#needsList .donate-btn').textContent`)) === 'Pledge');
  check('13 fully pledged needs listed apart', (await text('metNeedsList')).includes('Mosquito nets ' + stamp) && (await text('metNeedsList')).includes('20,000 XAF'));
  check('14 stories: 2 posts, a photo and a video', (await b.js(`document.querySelectorAll('#updatesPanel .cu-photo').length`)) === 1 && /\/api\/files\/video\/[0-9a-f]{32}\?t=/.test(await b.js(`document.querySelector('#updatesPanel video').getAttribute('src')`)));
  check('15 social pages open in a new tab', (await b.js(`[...document.querySelectorAll('#updatesPanel .cu-link')].map(a => a.textContent + '>' + a.target + '>' + a.rel).join(',')`)) === 'Website>_blank>noopener noreferrer nofollow,Facebook>_blank>noopener noreferrer nofollow');
  const pageText = await b.js('document.body.innerText');
  check('16 the phone number and email are not on the page', !pageText.includes(PHONE) && !pageText.includes(EMAIL));
  check('17 no empty photo gallery section', await b.js(`document.getElementById('gallerySection').classList.contains('d-none')`));
  check('18 "Message this orphanage" opens the chat with this home', (await b.js(`document.getElementById('messageLink').getAttribute('href')`)) === 'messages.html?with=orphanage-' + oid);

  console.log('--- PLEDGING FROM THE PROFILE');
  await b.js(`document.querySelector('#needsList .donate-btn').click()`);
  check('19 the pledge window opens for the right need', await b.waitFor(`document.getElementById('donateModal').classList.contains('show')`) && (await text('donateNeedTitle')) === needA.title && (await text('donateOrphanageName')) === NAME);
  await b.js(`document.querySelector('.btn-quick-amount[data-amount="10000"]').click(); document.getElementById('donateForm').requestSubmit()`);
  check('20 the pledge is recorded', await b.waitFor(`!document.getElementById('donateAlert').classList.contains('d-none')`) && (await text('donateAlert')).includes('Thank you! Your pledge of 10,000 XAF'));
  check('21 the page updates behind the window', await b.waitFor(`document.getElementById('recordPanel').innerText.includes('30,000 XAF') && document.getElementById('recordPanel').innerText.includes('2 supporters') && document.querySelector('#needsList .need-amounts').innerText === '10,000 XAF of 50,000 XAF'`), await text('recordPanel'));
  await b.js(`bootstrap.Modal.getInstance(document.getElementById('donateModal')).hide()`);
  await b.waitFor(`!document.querySelector('.modal.show')`);
  await b.js(`document.getElementById('visitBtn').click()`);
  check('22 "Request a visit" opens the visit form for this home', await b.waitFor(`!!document.querySelector('dialog.cv-dialog[open]')`) && (await b.js(`document.querySelector('dialog.cv-dialog').innerText`)).includes(NAME));
  await b.js(`document.querySelector('dialog.cv-dialog').close(); document.querySelector('dialog.cv-dialog').remove()`);
  check('23 "See what they need" jumps to the needs', (await b.js(`document.querySelector('.home-actions a[href="#needs"]') !== null && document.getElementById('needs') !== null`)) === true);

  console.log('--- ON A PHONE');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 1, mobile: true });
  await b.go(SITE + '/donor/orphanage.html?id=' + oid, `!document.getElementById('profileContent').classList.contains('d-none')`);
  await sleep(400);
  check('24 fits a 360px phone (no sideways scroll)', (await b.js('document.documentElement.scrollWidth')) <= 360, String(await b.js('document.documentElement.scrollWidth')));
  check('25 photo above the name on a phone', await b.js(`getComputedStyle(document.querySelector('.home-identity')).flexDirection === 'column'`));
  check('26 two fact tiles per row', await b.js(`(() => { const t = [...document.querySelectorAll('.home-tile')].map(x => x.getBoundingClientRect().top); return t[0] === t[1] && t[2] > t[0]; })()`));
  await b.go(SITE + '/donor/index.html', `document.querySelectorAll('.card-orphanage').length > 0`);
  check('27 the Give page still fits a phone', (await b.js('document.documentElement.scrollWidth')) <= 360, String(await b.js('document.documentElement.scrollWidth')));
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  console.log('--- A PHOTO THAT CANNOT BE SHOWN');
  await b.go(SITE + '/donor/orphanage.html?id=' + brokenId, `!document.getElementById('profileContent').classList.contains('d-none')`);
  await sleep(600);
  check('27b a broken profile photo falls back to the initials', (await b.js(`document.getElementById('homeAvatar').innerText`)) === 'UB' && (await b.js(`document.querySelectorAll('#homeAvatar img').length`)) === 0);
  check('27c a broken cover photo falls back to a plain band', (await b.js(`document.getElementById('homeCover').classList.contains('is-empty') && document.querySelectorAll('#homeCover img').length === 0`)) === true);
  check('27e a very long name wraps below the cover (laptop)', (await b.js(`document.getElementById('homeName').getBoundingClientRect().height > 50`)) && (await b.js(nameBelowCover)));
  await b.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 1, mobile: true });
  await sleep(300);
  check('27f ... and on a phone, with no sideways scroll', (await b.js(nameBelowCover)) && (await b.js('document.documentElement.scrollWidth')) <= 360);
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  check('27d a home with no story, needs or posts still reads well', (await text('homeStory')).includes('has not written its story yet') && (await text('needsList')).includes('No open needs right now') && (await text('recordPanel')).includes('No pledges yet'));

  console.log('--- WRONG LINKS AND NO ACCESS');
  const before = b.netIssues.length;
  await b.go(SITE + '/donor/orphanage.html?id=abc', `!document.getElementById('loadError').classList.contains('d-none')`);
  check('28 a broken link says the home was not found', (await text('loadError')).includes('could not be found') && (await b.js(`document.getElementById('profileContent').classList.contains('d-none')`)));
  await b.go(SITE + '/donor/orphanage.html?id=99999999', `!document.getElementById('loadError').classList.contains('d-none')`);
  check('29 a home that is not listed says the same', (await text('loadError')).includes('could not be found'));
  const expected404 = b.netIssues.slice(before).filter((s) => !/^404 .*\/api\/browse\/orphanages\/99999999$/.test(s));
  await signIn(waiting, 'UI Waiting');
  await b.go(SITE + '/donor/orphanage.html?id=' + oid, `location.pathname.endsWith('/donor/index.html') && !document.getElementById('accessGate').classList.contains('d-none')`);
  check('30 a donor waiting for approval is sent to the Give page and told why', (await b.js('location.pathname')).endsWith('/donor/index.html') && (await text('gateTitle')).includes('waiting for approval'));
  await b.js(`localStorage.clear(); sessionStorage.clear()`);
  await b.go(SITE + '/donor/orphanage.html?id=' + oid, `location.pathname.endsWith('/donor/index.html') && !document.getElementById('accessGate').classList.contains('d-none')`);
  check('31 someone not signed in is asked to sign in', (await text('gateTitle')) === 'Sign in to see orphanages');

  // The site has no favicon (an old gap, the earlier tests ignore it too).
  const issues = b.netIssues.filter((s) => !/favicon\.ico$/.test(s) && !/^404 .*\/api\/browse\/orphanages\/99999999$/.test(s) && !/^40[13] .*\/api\/browse\/orphanages(\/\d+)?$/.test(s));
  check('32 no JavaScript errors', b.errors.length === 0, b.errors.join(' ; '));
  check('33 no failed requests (other than the expected refusals)', issues.length === 0 && expected404.length === 0, issues.concat(expected404).join(' ; '));
  console.log(failures === 0 ? '\nALL PASSED' : '\n' + failures + ' FAILED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('CRASH', e); process.exit(2); });
