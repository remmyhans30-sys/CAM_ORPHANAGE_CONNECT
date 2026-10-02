// The browser protections every answer carries, checked with the site in live-site mode (NODE_ENV=production).
const SITE = 'http://127.0.0.2:4555';
let failures = 0;
const check = (label, ok, detail) => { console.log(label.padEnd(70), (ok ? 'ok' : 'FAIL') + (detail !== undefined && detail !== '' ? '  ' + detail : '')); if (!ok) failures++; };
const get = (path, headers) => fetch(SITE + path, { headers: headers || {} });
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]).toString('base64');

(async () => {
  const stamp = Date.now();
  const home = await (await fetch(SITE + '/api/users/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acceptTerms: true, fullname: 'Header Home ' + stamp, email: 'hh' + stamp + '@example.com', password: 'secret1', role: 'volunteer' }) })).json();
  const upload = await (await fetch(SITE + '/api/my-orphanage/photo', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + home.token }, body: JSON.stringify({ filename: 'front.png', data: PNG }) })).json();
  const photo = upload.orphanage && upload.orphanage.photoUrl;

  console.log('--- EVERY ANSWER');
  check('0 an uploaded photo to test with', Boolean(photo), photo);
  const paths = ['/', '/login/index.html', '/donor/index.html', '/api/health', '/api/site/stats', '/no-such-page', '/api/no-such-thing', photo];
  for (const path of paths) {
    const res = await get(path);
    const h = (name) => res.headers.get(name) || '';
    const csp = h('content-security-policy');
    const ok = csp.includes("script-src 'self' https://cdn.jsdelivr.net") && csp.includes("frame-ancestors 'none'") && csp.includes("object-src 'none'") &&
      h('x-content-type-options') === 'nosniff' && h('x-frame-options') === 'DENY' && h('referrer-policy') === 'strict-origin-when-cross-origin' &&
      h('permissions-policy').includes('camera=()') && h('cross-origin-opener-policy') === 'same-origin' && !res.headers.has('x-powered-by');
    check('1 ' + path + ' (' + res.status + ')', ok, ok ? '' : JSON.stringify(Object.fromEntries(res.headers)));
  }

  console.log('--- LIVE SITE ONLY');
  let res = await get('/');
  check('2 the policy does not mention the local test address', !res.headers.get('content-security-policy').includes('localhost'));
  check('3 plain http: no HTTPS-only header', !res.headers.has('strict-transport-security'));
  res = await get('/', { 'X-Forwarded-Proto': 'https' });
  check('4 behind the host\'s HTTPS: browsers told to use HTTPS only', (res.headers.get('strict-transport-security') || '').startsWith('max-age='), res.headers.get('strict-transport-security'));
  res = await get('/api/site/stats', { Origin: 'https://another-site.example' });
  check('5 another website cannot read the API', !res.headers.has('access-control-allow-origin'), res.headers.get('access-control-allow-origin') || 'no permission sent');
  res = await fetch(SITE + '/api/users/login', { method: 'OPTIONS', headers: { Origin: 'https://another-site.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  check('6 ... nor send it requests from a page of its own', !res.headers.has('access-control-allow-origin'));

  console.log(failures === 0 ? '\nALL PASSED' : '\n' + failures + ' FAILED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('CRASH', e); process.exit(2); });
