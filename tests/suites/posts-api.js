// Run with VIDEO_MAX_MB=2 ORPHANAGE_VIDEO_QUOTA_MB=5 set for the site (small limits keep the test quick).
const fs = require('fs');
const SITE = 'http://127.0.0.2:4555';
const A = SITE + '/api';
let failures = 0;
const check = (label, ok, detail) => { console.log(label.padEnd(68), (ok ? 'ok' : 'FAIL') + (detail ? '  ' + detail : '')); if (!ok) failures++; };
const { sql } = require('../helpers/db');

async function call(path, method, body, token) {
  const res = await fetch(A + path, { method: method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function upload(path, token, bytes, name, type) {
  const res = await fetch(A + path, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': type || 'video/mp4', 'X-Filename': encodeURIComponent(name || 'clip.mp4') }, body: bytes });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
function mp4(size) {
  const b = Buffer.alloc(size, 7);
  b.writeUInt32BE(24, 0); b.write('ftyp', 4, 'latin1'); b.write('isom', 8, 'latin1'); b.writeUInt32BE(512, 12); b.write('isomiso2', 16, 'latin1');
  return b;
}
function webm(size) { const b = Buffer.alloc(size, 3); Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(b); return b; }
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]).toString('base64');
const MB = 1024 * 1024;

(async () => {
  const stamp = Date.now();
  const admin = (await call('/auth/login', 'POST', { email: 'owner@cam-test.org', password: 'Str0ng-Test-Pass!' })).body.token;
  const mk = async (name, role) => (await call('/users/register', 'POST', { acceptTerms: true, fullname: name + ' ' + stamp, email: name.replace(/ /g, '').toLowerCase() + stamp + '@example.com', password: 'secret1', role })).body;
  const home = await mk('Post Home', 'volunteer');
  const draft = await mk('Draft Post Home', 'volunteer');
  const other = await mk('Other Post Home', 'volunteer');
  const list = (await call('/orphanages', 'GET', null, admin)).body.orphanages;
  const oid = list.find((o) => o.name === 'Post Home ' + stamp).id;
  const otherId = list.find((o) => o.name === 'Other Post Home ' + stamp).id;
  const verify = (id) => call('/orphanages/' + id, 'PUT', { status: 'verified', registrationNumber: 'PH-' + id + '-' + stamp, termsAgreed: true }, admin);
  await verify(oid); await verify(otherId);

  const approved = await mk('Approved Donor', 'user');
  await call('/donors/' + approved.user.id, 'PUT', { status: 'active' }, admin);
  const pending = await mk('Pending Donor', 'user');
  const partner = (await call('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Post Partner ' + stamp, email: 'pp' + stamp + '@example.com', password: 'secret1' })).body;
  const prow = (await call('/partners', 'GET', null, admin)).body.partners.find((p) => p.name === 'Post Partner ' + stamp);
  await call('/partners/' + prow.id, 'PUT', { verificationStatus: 'verified', sanctionsScreened: true, termsAgreed: true }, admin);
  const draftPartner = (await call('/partner-auth/register', 'POST', { acceptTerms: true, name: 'Draft Post Partner ' + stamp, email: 'dp' + stamp + '@example.com', password: 'secret1' })).body;

  console.log('--- WHO MAY POST');
  let r = await call('/my-orphanage/posts', 'POST', { type: 'story', text: 'Hello' }, draft.token);
  check('1 an unverified orphanage cannot post', r.status === 403, r.body.error && r.body.error.slice(0, 60));
  r = await call('/my-orphanage/posts', 'GET', null, draft.token);
  check('2 ... and is told so when it opens the page', r.status === 200 && r.body.canPost === false);
  r = await call('/my-orphanage/posts', 'POST', { type: 'story', text: 'Hello' });
  check('3 no login is refused', r.status === 401);
  r = await call('/my-orphanage/posts', 'POST', { type: 'story', text: 'Hello' }, approved.token);
  check('4 a donor token cannot post', r.status === 403);
  check('5 a database rule also blocks posts from an unverified home', /Only a verified orphanage/.test(sql("INSERT INTO orphanage_posts (orphanage_id, body) SELECT id, 'x' FROM orphanages WHERE name = 'Draft Post Home " + stamp + "'")));

  console.log('--- WRITING POSTS');
  r = await call('/my-orphanage/posts', 'POST', { type: 'story', title: 'How our home began', text: 'We started in 2012 with six children and one room.', photo: { filename: 'home.png', data: png } }, home.token);
  const story = r.body.post;
  check('6 story with a photo', r.status === 201 && story.type === 'story' && /^\/api\/files\/photo\//.test(story.photoUrl) && story.title === 'How our home began', r.status + ' ' + (r.body.error || ''));
  r = await call('/my-orphanage/posts', 'POST', { type: 'gift', title: '20 mattresses', text: 'Thank you to everyone who gave 20 mattresses this week. The children sleep well now.' }, home.token);
  const gift = r.body.post;
  check('7 "gift received" post', r.status === 201 && gift.type === 'gift');
  r = await call('/my-orphanage/posts', 'POST', { type: 'update', text: 'The new term starts on Monday.' }, home.token);
  check('8 news update without a title', r.status === 201 && r.body.post.title === null);
  check('9 unknown type refused', (await call('/my-orphanage/posts', 'POST', { type: 'ad', text: 'x' }, home.token)).status === 400);
  check('10 empty text refused', (await call('/my-orphanage/posts', 'POST', { type: 'story', text: '   ' }, home.token)).status === 400);
  check('11 text over 2,000 characters refused', (await call('/my-orphanage/posts', 'POST', { type: 'story', text: 'x'.repeat(2001) }, home.token)).status === 400);
  check('12 title over 150 characters refused', (await call('/my-orphanage/posts', 'POST', { type: 'story', title: 't'.repeat(151), text: 'x' }, home.token)).status === 400);
  r = await call('/my-orphanage/posts', 'POST', { type: 'story', text: 'with a bad photo', photo: { filename: 'x.png', data: Buffer.from('not an image').toString('base64') } }, home.token);
  check('13 a bad photo refuses the whole post (nothing half-saved)', r.status === 400 && (await call('/my-orphanage/posts', 'GET', null, home.token)).body.posts.length === 3, r.body.error);

  console.log('--- VIDEOS');
  r = await upload('/my-orphanage/posts/' + story.id + '/video', home.token, mp4(1.5 * MB), 'tour of the home.mp4');
  check('14 an MP4 is accepted', r.status === 201 && /\/api\/files\/video\/[0-9a-f]{32}\?t=\d+\.[0-9a-f]{64}/.test(r.body.post.videoUrl) && r.body.post.videoName === 'tour of the home.mp4', r.status + ' ' + (r.body.error || ''));
  const videoPath = r.body.post.videoUrl;
  r = await upload('/my-orphanage/posts/' + gift.id + '/video', home.token, webm(500000), 'thanks.webm', 'video/webm');
  check('15 a WebM is accepted', r.status === 201);
  r = await upload('/my-orphanage/posts/' + gift.id + '/video', home.token, Buffer.from('<html><script>alert(1)</script></html>'.repeat(500)), 'video.mp4');
  check('16 a web page renamed .mp4 is refused', r.status === 400 && /MP4 or WebM/.test(r.body.error), r.body.error);
  r = await upload('/my-orphanage/posts/' + gift.id + '/video', home.token, Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(100)]), 'photo.mp4');
  check('17 an image container (HEIC) is refused', r.status === 400);
  r = await upload('/my-orphanage/posts/' + gift.id + '/video', home.token, mp4(3 * MB), 'big.mp4');
  check('18 a video over the limit is refused', (r.status === 400 || r.status === 413) && /too large/.test(r.body.error), r.status + ' ' + r.body.error);
  r = await upload('/my-orphanage/posts/' + gift.id + '/video', home.token, mp4(12 * MB), 'huge.mp4');
  check('18b a much bigger file is stopped at the door (413)', r.status === 413 && /too large/.test(r.body.error), r.status + ' ' + r.body.error);
  r = await upload('/my-orphanage/posts/' + gift.id + '/video', home.token, Buffer.alloc(0), 'empty.mp4');
  check('19 an empty video is refused', r.status === 400);
  r = await upload('/my-orphanage/posts/' + story.id + '/video', other.token, mp4(1000), 'sneaky.mp4');
  check('20 another orphanage cannot add a video to my post', r.status === 404, r.status);
  const before = sql("SELECT COUNT(*) FROM uploads WHERE purpose = 'video'");
  r = await upload('/my-orphanage/posts/' + story.id + '/video', home.token, mp4(1.2 * MB), 'replacement.mp4');
  check('21 replacing a video removes the old file', r.status === 201 && sql("SELECT COUNT(*) FROM uploads WHERE purpose = 'video'") === before, before + ' videos before and after');
  const postForQuota = (await call('/my-orphanage/posts', 'POST', { type: 'update', text: 'quota test' }, home.token)).body.post;
  const quota = [];
  for (let i = 0; i < 4; i++) quota.push((await upload('/my-orphanage/posts/' + postForQuota.id + '/video', home.token, mp4(1.9 * MB), 'q' + i + '.mp4')).status);
  check('22 total video storage per orphanage is capped (5 MB here)', quota.includes(400), quota.join(','));
  const quotaMsg = (await upload('/my-orphanage/posts/' + postForQuota.id + '/video', home.token, mp4(1.9 * MB), 'q.mp4')).body.error;
  check('23 ... with a clear message', /limit of 5 MB/.test(quotaMsg || ''), quotaMsg);

  console.log('--- WHO MAY WATCH');
  r = await call('/browse/orphanages/' + oid + '/updates', 'GET', null, approved.token);
  const feed = r.body.posts || [];
  const withVideo = feed.find((p) => p.id === story.id);
  check('24 an approved donor sees the posts, newest first', r.status === 200 && feed.length >= 4 && feed[0].id > feed[feed.length - 1].id, r.status + ' ' + feed.length + ' posts');
  check('25 posts carry type, title, text, photo and a video link', withVideo && withVideo.type === 'story' && withVideo.title && withVideo.photoUrl && withVideo.videoUrl);
  check('26 a pending donor is refused', (await call('/browse/orphanages/' + oid + '/updates', 'GET', null, pending.token)).status === 403);
  check('27 no login is refused', (await call('/browse/orphanages/' + oid + '/updates')).status === 401);
  check('28 a verified partner sees them too', (await call('/partner-auth/orphanages/' + oid + '/updates', 'GET', null, partner.token)).body.posts.length === feed.length);
  check('29 an unverified partner is refused', (await call('/partner-auth/orphanages/' + oid + '/updates', 'GET', null, draftPartner.token)).status === 403);
  check('30 an unverified orphanage has no public updates', (await call('/browse/orphanages/' + list.find((o) => o.name === 'Draft Post Home ' + stamp).id + '/updates', 'GET', null, approved.token)).status === 404);
  const link = withVideo.videoUrl;
  let res = await fetch(SITE + link);
  const bytes = Buffer.from(await res.arrayBuffer());
  check('31 the signed link plays the video', res.status === 200 && res.headers.get('content-type') === 'video/mp4' && bytes.length === Math.floor(1.2 * MB) && res.headers.get('x-content-type-options') === 'nosniff', res.status + ' ' + res.headers.get('content-type') + ' ' + bytes.length);
  res = await fetch(SITE + link, { headers: { Range: 'bytes=100-199' } });
  check('32 seeking works (range request)', res.status === 206 && (await res.arrayBuffer()).byteLength === 100, res.status);
  res = await fetch(SITE + link.split('?')[0]);
  check('33 the bare video address (no signature) is refused', res.status === 403);
  res = await fetch(SITE + link.replace(/(\d+)\.([0-9a-f]{64})/, (m, e, s) => e + '.' + s.replace(/.$/, s.endsWith('0') ? '1' : '0')));
  check('34 a tampered signature is refused', res.status === 403);
  const id = link.match(/video\/([0-9a-f]{32})/)[1];
  res = await fetch(SITE + '/api/files/video/' + id + '?t=' + (Math.floor(Date.now() / 1000) - 10) + '.' + '0'.repeat(64));
  check('35 an expired / forged link is refused', res.status === 403);
  const otherLink = (await call('/my-orphanage/posts', 'GET', null, home.token)).body.posts.find((p) => p.videoUrl && p.id !== story.id).videoUrl;
  res = await fetch(SITE + otherLink.replace(/video\/[0-9a-f]{32}/, 'video/' + id));
  check('36 a signature for one video does not open another', res.status === 403);
  res = await fetch(SITE + '/api/files/photo/' + id);
  check('37 a video cannot be fetched through the public photo route', res.status === 404);
  res = await fetch(SITE + '/server/uploads/' + id + '.mp4');
  check('38 the uploads folder is not downloadable', res.status === 404);

  console.log('--- DELETING AND MODERATION');
  r = await call('/my-orphanage/posts/' + story.id, 'DELETE', null, other.token);
  check('39 another orphanage cannot delete my post', r.status === 404);
  const filesBefore = sql("SELECT COUNT(*) FROM uploads WHERE id IN ('" + id + "')");
  r = await call('/my-orphanage/posts/' + story.id, 'DELETE', null, home.token);
  check('40 owner deletes a post: its photo and video are removed too', r.status === 204 && sql("SELECT COUNT(*) FROM uploads WHERE id = '" + id + "'") === '0' && filesBefore === '1');
  res = await fetch(SITE + link);
  check('41 the old video link stops working', res.status === 404 || res.status === 403, res.status);
  r = await call('/my-orphanage/posts/' + gift.id + '/video', 'DELETE', null, home.token);
  check('42 owner removes just the video', r.status === 200 && r.body.post.videoUrl === null);
  const adminOrph = (await call('/orphanages/' + oid, 'GET', null, admin)).body.orphanage;
  check('43 admin sees posts with id, type and "has video"', adminOrph.posts.length >= 3 && adminOrph.posts.every((p) => p.id && p.type) && adminOrph.posts.some((p) => p.hasVideo === false), adminOrph.posts.length + ' posts');
  const withVid = adminOrph.posts.find((p) => p.hasVideo);
  r = await call('/orphanages/' + oid + '/posts/' + withVid.id + '/video-link', 'GET', null, admin);
  check('44 admin can open a video link to review it', r.status === 200 && (await fetch(SITE + r.body.url)).status === 200);
  check('45 only admins get that link', (await call('/orphanages/' + oid + '/posts/' + withVid.id + '/video-link', 'GET', null, home.token)).status === 401);
  adminOrph.posts = adminOrph.posts.filter((p) => p.id !== adminOrph.posts[0].id);
  const hiddenId = (await call('/orphanages/' + oid, 'GET', null, admin)).body.orphanage.posts[0].id;
  await call('/orphanages/' + oid, 'PUT', adminOrph, admin);
  const after = (await call('/browse/orphanages/' + oid + '/updates', 'GET', null, approved.token)).body.posts;
  check('46 an admin removing a post hides it from supporters', !after.some((p) => p.id === hiddenId), after.length + ' left');
  check('47 ... and it is kept (hidden), not erased', sql("SELECT COUNT(*) FROM orphanage_posts WHERE id = " + hiddenId + " AND hidden_at IS NOT NULL") === '1');

  console.log('--- POST LIMIT');
  let limitStatus = 0;
  for (let i = 0; i < 12; i++) { limitStatus = (await call('/my-orphanage/posts', 'POST', { type: 'update', text: 'spam ' + i }, other.token)).status; if (limitStatus === 429) break; }
  check('48 at most 10 posts a day per orphanage', limitStatus === 429);

  console.log('--- SOCIAL LINKS');
  r = await call('/my-orphanage/social', 'PUT', { links: { facebook: 'https://www.facebook.com/hopehome', instagram: 'instagram.com/hope_home', youtube: 'https://youtu.be/abc', whatsapp: '+237 677 123 456', website: 'hopehome.org', tiktok: '' } }, home.token);
  check('49 links saved and tidied (https added, phone becomes wa.me)', r.status === 200 && r.body.socialLinks.instagram === 'https://instagram.com/hope_home' && r.body.socialLinks.whatsapp === 'https://wa.me/237677123456' && r.body.socialLinks.website === 'https://hopehome.org/' && !r.body.socialLinks.tiktok, JSON.stringify(r.body.socialLinks));
  for (const [label, links] of [['javascript:', { website: 'javascript:alert(1)' }], ['http (not https)', { website: 'http://example.org' }], ['wrong site', { facebook: 'https://evil.example.com/facebook.com' }], ['look-alike host', { facebook: 'https://facebook.com.evil.example/x' }], ['credentials in link', { website: 'https://user:pw@example.org' }], ['localhost', { website: 'https://localhost/x' }], ['IP address', { website: 'https://10.0.0.1/x' }], ['not a url', { youtube: 'hello there' }]]) {
    const bad = await call('/my-orphanage/social', 'PUT', { links }, home.token);
    check('50 refused: ' + label, bad.status === 400, bad.body.error);
  }
  r = await call('/my-orphanage/social', 'GET', null, home.token);
  check('51 earlier valid links survive a refused save', Object.keys(r.body.socialLinks).length === 5);
  const browse = (await call('/browse/orphanages', 'GET', null, approved.token)).body.orphanages.find((o) => o.id === oid);
  check('52 donors see the links and the update count in the orphanage list', browse.socialLinks.facebook === 'https://www.facebook.com/hopehome' && browse.updatesCount === 2, 'updates ' + browse.updatesCount);
  const pview = (await call('/partner-auth/orphanages/' + oid, 'GET', null, partner.token)).body.orphanage;
  check('53 partners see the links; old raw "posts" field is gone', pview.socialLinks.youtube === 'https://youtu.be/abc' && pview.posts === undefined);
  r = await call('/my-orphanage/social', 'PUT', { links: {} }, home.token);
  check('54 saving an empty set removes all links', r.status === 200 && Object.keys(r.body.socialLinks).length === 0);
  check('55 a draft orphanage can prepare its links', (await call('/my-orphanage/social', 'PUT', { links: { facebook: 'facebook.com/draft' } }, draft.token)).status === 200);
  check('56 database rejects a non-https link', /ck_social_https/.test(sql("INSERT INTO orphanage_social_links (orphanage_id, platform, url) VALUES (" + oid + ", 'website', 'http://x.org')")));

  console.log(failures === 0 ? '\nALL PASSED' : '\n' + failures + ' FAILED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('CRASH', e); process.exit(2); });
