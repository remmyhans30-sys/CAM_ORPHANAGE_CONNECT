// Browser journey for stories, videos and social links (run with VIDEO_MAX_MB=2 for the site).
const { fixture } = require('../helpers/fixtures');
const fs = require('fs');
const path = require('path');
const { connect, sleep } = require('../helpers/browser');
const SITE = 'http://127.0.0.2:4555';
const out = (l, v) => console.log(l.padEnd(62), v);
const J = { 'Content-Type': 'application/json' };

(async () => {
  const png = fixture('post-photo.png');
  fs.writeFileSync(png, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 1)]));
  const mp4 = fixture('post-clip.mp4');
  const b4 = Buffer.alloc(300000, 7); b4.writeUInt32BE(24, 0); b4.write('ftyp', 4, 'latin1'); b4.write('isom', 8, 'latin1');
  fs.writeFileSync(mp4, b4);
  const txt = fixture('post-notes.txt');
  fs.writeFileSync(txt, 'just some notes');
  const big = fixture('post-big.mp4');
  const bb = Buffer.alloc(3 * 1024 * 1024, 7); bb.writeUInt32BE(24, 0); bb.write('ftyp', 4, 'latin1'); bb.write('isom', 8, 'latin1');
  fs.writeFileSync(big, bb);

  const b = await connect();
  const stamp = Date.now();
  const api = async (p, method, body, token) => (await fetch(SITE + '/api' + p, { method: method || 'GET', headers: Object.assign({}, J, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined })).json();
  const admin = (await api('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' })).token;
  const reg = (name, role) => api('/users/register', 'POST', { acceptTerms: true, fullname: name + ' ' + stamp, email: name.replace(/ /g, '').toLowerCase() + stamp + '@example.com', password: 'secret1', role });
  const home = await reg('Story Home', 'volunteer');
  const draft = await reg('Draft Story Home', 'volunteer');
  const oid = (await api('/orphanages', 'GET', null, admin)).orphanages.find((o) => o.name === 'Story Home ' + stamp).id;
  await api('/orphanages/' + oid, 'PUT', { status: 'verified', registrationNumber: 'SH-' + stamp, termsAgreed: true, location: 'Kribi' }, admin);
  const donor = await reg('Story Donor', 'user');
  await api('/donors/' + donor.user.id, 'PUT', { status: 'active' }, admin);
  const partner = await api('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Story Partner ' + stamp, email: 'sp' + stamp + '@example.com', password: 'secret1' });
  const prow = (await api('/partners', 'GET', null, admin)).partners.find((p) => p.name === 'Story Partner ' + stamp);
  await api('/partners/' + prow.id, 'PUT', { verificationStatus: 'verified', sanctionsScreened: true, termsAgreed: true }, admin);

  const session = (name, role, token) => JSON.stringify({ token, role, fullname: name, email: 'x@example.com' });
  async function signInAs(setup) {
    await b.go(SITE + '/login/index.html', `document.readyState === 'complete'`);
    await b.js(`localStorage.clear(); sessionStorage.clear(); ${setup}`);
  }

  console.log('--- ORPHANAGE POSTS');
  await signInAs(`localStorage.setItem('cocSession', ${JSON.stringify(session('Story Home', 'volunteer', home.token))})`);
  await b.go(SITE + '/orphanage/index.html', `document.getElementById('post-form') !== null && document.getElementById('post-submit') !== null`);
  await b.js(`document.querySelector('[data-view=posts]').click()`);
  await b.waitFor(`document.getElementById('view-posts').classList.contains('active') && document.getElementById('post-video-hint').textContent.includes('MB')`);
  out('1 the tab shows the composer, the limit and no lock:', await b.js(`document.getElementById('post-video-hint').textContent + ' | locked note hidden: ' + (document.getElementById('posts-locked').style.display === 'none') + ' | button enabled: ' + !document.getElementById('post-submit').disabled`));
  await b.js(`document.getElementById('post-form').requestSubmit()`);
  await sleep(300);
  out('2 empty message is caught:', await b.js(`document.getElementById('post-error').textContent`));
  await b.js(`document.getElementById('post-text').value = 'x'; document.getElementById('post-text').dispatchEvent(new Event('input'))`);
  out('3 character counter:', await b.js(`document.getElementById('post-count').textContent`));
  await b.setFile('#post-video', txt);
  await b.js(`document.getElementById('post-text').value = 'Thank you for the mattresses'; document.getElementById('post-form').requestSubmit()`);
  await sleep(300);
  out('4 a text file as video is refused before upload:', await b.js(`document.getElementById('post-error').textContent`));
  await b.setFile('#post-video', big);
  await b.js(`document.getElementById('post-form').requestSubmit()`);
  await sleep(300);
  out('5 a too-big video is refused with the limit:', await b.js(`document.getElementById('post-error').textContent`));
  await b.js(`(() => { document.getElementById('post-type').value = 'gift'; document.getElementById('post-title').value = '20 mattresses arrived'; document.getElementById('post-text').value = 'Thank you to everyone who gave 20 mattresses.\\n\\nThe children sleep well now.'; })()`);
  await b.setFile('#post-photo', png);
  await b.setFile('#post-video', mp4);
  await b.js(`document.getElementById('post-form').requestSubmit()`);
  await b.waitFor(`document.querySelector('#posts-list .cu-post') !== null`, 15000);
  out('6 the post appears in "Your posts":', await b.js(`document.querySelector('#posts-list .cu-badge').textContent + ' | ' + document.querySelector('#posts-list .cu-title').textContent`));
  out('7 photo and video are shown with the post:', await b.js(`'photo ' + !!document.querySelector('#posts-list .cu-photo') + ', video ' + !!document.querySelector('#posts-list video.cu-video[src*="/api/files/video/"]')`));
  out('8 success note, form cleared:', await b.js(`document.getElementById('post-success').textContent + ' | text empty: ' + (document.getElementById('post-text').value === '')`));
  out('9 the video link works from the page:', await b.js(`fetch(document.querySelector('#posts-list video').getAttribute('src')).then(r => r.status + ' ' + r.headers.get('content-type'))`));
  out('10 post buttons (replace / remove video, delete):', await b.js(`[...document.querySelectorAll('#posts-list .post-card-actions button')].map(x => x.textContent).join(' | ')`));
  await b.js(`(() => { document.getElementById('post-type').value = 'story'; document.getElementById('post-text').value = 'A second post, no media.'; document.getElementById('post-form').requestSubmit(); })()`);
  await b.waitFor(`document.querySelectorAll('#posts-list .cu-post').length === 2`, 10000);
  out('11 second post (no media) is first in the list:', await b.js(`document.querySelectorAll('#posts-list .cu-post').length + ' posts | newest: ' + document.querySelector('#posts-list .cu-post .cu-text').textContent.slice(0, 24)`));

  console.log('--- SOCIAL LINKS');
  await b.js(`(() => { document.getElementById('social-facebook').value = 'facebook.com/storyhome'; document.getElementById('social-whatsapp').value = '+237 677 123 456'; document.getElementById('social-website').value = 'javascript:alert(1)'; document.getElementById('social-form').requestSubmit(); })()`);
  await sleep(500);
  out('12 an unsafe link is refused with a clear message:', await b.js(`document.getElementById('social-error').textContent`));
  await b.js(`document.getElementById('social-website').value = ''; document.getElementById('social-form').requestSubmit()`);
  await b.waitFor(`document.getElementById('social-success').classList.contains('show')`);
  out('13 valid links saved and tidied in the form:', await b.js(`document.getElementById('social-facebook').value + ' | ' + document.getElementById('social-whatsapp').value`));

  console.log('--- DRAFT ORPHANAGE');
  await signInAs(`localStorage.setItem('cocSession', ${JSON.stringify(session('Draft Story Home', 'volunteer', draft.token))})`);
  await b.go(SITE + '/orphanage/index.html', `document.getElementById('post-submit') !== null`);
  await b.js(`document.querySelector('[data-view=posts]').click()`);
  await b.waitFor(`document.getElementById('posts-locked').style.display !== 'none'`);
  out('14 unverified home: lock note shown, Publish disabled:', await b.js(`'note ' + (document.getElementById('posts-locked').style.display !== 'none') + ', publish disabled ' + document.getElementById('post-submit').disabled`));
  await b.js(`document.getElementById('social-instagram').value = 'instagram.com/draft'; document.getElementById('social-form').requestSubmit()`);
  await b.waitFor(`document.getElementById('social-success').classList.contains('show')`);
  out('15 ... but it can already save its social links:', await b.js(`document.getElementById('social-success').textContent`));

  console.log('--- DONOR WATCHES');
  await signInAs(`localStorage.setItem('cocSession', ${JSON.stringify(session('Story Donor', 'user', donor.token))})`);
  await b.go(SITE + '/donor/index.html', `document.querySelectorAll('.orphanage-updates-btn').length > 0`);
  out('16 the card offers "Stories & videos (2)":', await b.js(`[...document.querySelectorAll('.card-orphanage')].find(c => c.innerText.includes('Story Home ${stamp}')).querySelector('.orphanage-updates-btn').textContent`));
  await b.js(`[...document.querySelectorAll('.card-orphanage')].find(c => c.innerText.includes('Story Home ${stamp}')).querySelector('.orphanage-updates-btn').click()`);
  await b.waitFor(`!!document.querySelector('dialog.cu-dialog[open] .cu-post')`);
  out('17 window with posts, newest first:', await b.js(`document.querySelector('.cu-dialog-title').textContent + ' | ' + document.querySelectorAll('.cu-dialog .cu-post').length + ' posts'`));
  out('18 gift post shows badge, title, two paragraphs, photo, video:', await b.js(`(() => { const p = [...document.querySelectorAll('.cu-dialog .cu-post')].find(x => x.querySelector('.cu-badge-gift')); return p.querySelector('.cu-badge').textContent + ' | ' + p.querySelector('.cu-title').textContent + ' | paragraphs ' + p.querySelectorAll('.cu-text').length + ' | photo ' + !!p.querySelector('.cu-photo') + ' | video ' + !!p.querySelector('video'); })()`));
  out('19 social links shown, opening safely in a new tab:', await b.js(`[...document.querySelectorAll('.cu-dialog .cu-link')].map(a => a.textContent + ' ' + a.getAttribute('rel') + ' ' + a.target).join(' ; ')`));
  out('20 a link points to the tidied address:', await b.js(`document.querySelector('.cu-dialog .cu-link[href*="facebook"]').href`));
  await b.js(`document.querySelector('.cu-close').click()`);
  out('21 closing removes the window:', await b.js(`!document.querySelector('dialog.cu-dialog')`));

  console.log('--- PARTNER WATCHES');
  await signInAs(`localStorage.setItem('partnerToken', ${JSON.stringify(partner.token)}); localStorage.setItem('partnerEmail', 'p@example.com')`);
  await b.go(SITE + '/partner/orphanage-view.html?id=' + oid, `document.querySelectorAll('#posts-panel .cu-post').length > 0`);
  out('22 partner page lists the same posts and links:', await b.js(`document.querySelectorAll('#posts-panel .cu-post').length + ' posts | ' + document.querySelectorAll('#posts-panel .cu-link').length + ' links | video ' + !!document.querySelector('#posts-panel video')`));

  console.log('--- ADMIN REVIEW');
  await signInAs(`localStorage.setItem('currentAdminEmail', 'owner@cam-test.org'); localStorage.setItem('currentAdminRole', 'Super Admin'); localStorage.setItem('adminToken', ${JSON.stringify(admin)})`);
  await b.go(SITE + '/admin/verification.html', `typeof openProfileModal === 'function'`);
  await b.js(`fetchOrphanagesFromApi().then(() => fetchNeedsFromApi ? fetchNeedsFromApi() : null).then(() => openProfileModal(${oid}))`);
  await b.waitFor(`!!document.querySelector('#profile-modal-body .profile-post')`);
  out('23 admin sees posts with type, title and "Watch video":', await b.js(`[...document.querySelectorAll('#profile-modal-body .profile-post')].map(p => p.innerText.replace(/\\n/g, ' ').slice(0, 70)).join(' || ')`));
  await b.js(`document.querySelector('.remove-post-btn[data-post-index]').click()`);
  await sleep(1500);
  const left = (await api('/browse/orphanages/' + oid + '/updates', 'GET', null, donor.token)).posts;
  out('24 admin removes a post: supporters no longer see it:', left.length + ' post(s) left');

  console.log('--- PHONE WIDTH');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 1, mobile: true });
  await signInAs(`localStorage.setItem('cocSession', ${JSON.stringify(session('Story Home', 'volunteer', home.token))})`);
  await b.go(SITE + '/orphanage/index.html', `document.getElementById('post-form') !== null`);
  await b.js(`document.querySelector('[data-view=posts]').click()`);
  await sleep(600);
  out('25 portal tab fits a 360px phone (no sideways scroll):', await b.js(`'overflow ' + (document.documentElement.scrollWidth > 361)`));
  await signInAs(`localStorage.setItem('cocSession', ${JSON.stringify(session('Story Donor', 'user', donor.token))})`);
  await b.go(SITE + '/donor/index.html', `document.querySelectorAll('.orphanage-updates-btn').length > 0`);
  await b.js(`document.querySelector('.orphanage-updates-btn').click()`);
  await b.waitFor(`!!document.querySelector('dialog.cu-dialog[open] .cu-post')`);
  out('26 viewer window fits a 360px phone:', await b.js(`(() => { const r = document.querySelector('dialog.cu-dialog').getBoundingClientRect(); return Math.round(r.left) + '..' + Math.round(r.right) + ' of 360, page overflow ' + (document.documentElement.scrollWidth > 361); })()`));
  await b.send('Emulation.clearDeviceMetricsOverride');

  out('27 page JS errors:', b.errors.length ? b.errors.join(' ; ') : 'none');
  out('28 failed requests (expected: refused uploads only):', b.netIssues.filter((x) => !/favicon|video\/\d|posts\/\d+\/video|\/social/.test(x)).join(' ; ') || 'none');
  process.exit(0);
})().catch((e) => { console.log('TEST FAILED', e); process.exit(1); });
