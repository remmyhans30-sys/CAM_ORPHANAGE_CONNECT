// Standard browser protections, sent with every answer (pages, API replies and files).
//
// The Content-Security-Policy says where pages may load things from: the site itself, Google Fonts,
// jsDelivr (Bootstrap and its icons) and, in a frame on the admin review page, Google Maps. Scripts can
// only come from files, never from code written inside a page, so text that someone slips into a page
// cannot run. Style attributes are allowed, because the pages use many of them.

const production = process.env.NODE_ENV === 'production';

const POLICY = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
  "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  // On your own computer, pages opened from 127.0.0.1 call the server at localhost:4000.
  "connect-src 'self'" + (production ? '' : ' http://localhost:4000'),
  "frame-src https://www.google.com https://maps.google.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', POLICY);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // Over HTTPS (the live site), browsers are told to use HTTPS only for the next 180 days.
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
}

module.exports = { securityHeaders, POLICY };
