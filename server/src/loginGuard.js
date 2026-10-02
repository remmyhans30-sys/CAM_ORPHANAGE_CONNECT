const { HttpError } = require('./errors');

// Slows down password guessing on the three login forms: admins ('admin'), donors and orphanages
// ('users') and partners ('partner'). All limits count wrong passwords within LOGIN_LOCK_MINUTES
// (default 15); when one is reached, the next attempts have to wait until that time has passed.
//
// - LOGIN_MAX_ATTEMPTS (default 5) wrong passwords for one email from one internet address. Only that
//   address is held back, so someone typing wrong passwords on purpose cannot lock the real person
//   out from their own computer.
// - LOGIN_MAX_PER_EMAIL (default 50) wrong passwords for one email from all addresses together, so
//   spreading the guesses over many computers does not help either.
// - LOGIN_MAX_PER_ADDRESS (default 100) wrong passwords from one address, whatever the email. It is
//   generous because many people can share one address (a cyber café, a school, mobile data).
//
// Unknown emails are counted the same way, so the answer never reveals who has an account. The shared
// login page tries the donor form and then the partner form, so each form keeps its own counts: one
// attempt there counts once on each. A correct password clears the counts for that address, and a
// password reset clears all of them.
// The counts are kept in memory: the site runs as one process, and a restart only clears them.

function setting(name, fallback) {
  const value = Number(process.env[name]);
  return value > 0 ? value : fallback;
}

const MAX_PER_EMAIL_AND_ADDRESS = setting('LOGIN_MAX_ATTEMPTS', 5);
const MAX_PER_EMAIL = setting('LOGIN_MAX_PER_EMAIL', 50);
const MAX_PER_ADDRESS = setting('LOGIN_MAX_PER_ADDRESS', 100);
const WINDOW_MS = setting('LOGIN_LOCK_MINUTES', 15) * 60 * 1000;
const FORMS = ['admin', 'users', 'partner'];

// key -> times of wrong passwords. Keys are 'form email address', 'form email' and 'address address'
// (a space cannot appear in a real email address).
const failures = new Map();

function normalize(email) {
  return String(email || '').trim().toLowerCase();
}

function keysFor(form, email, address) {
  const account = form + ' ' + normalize(email);
  return [[account + ' ' + address, MAX_PER_EMAIL_AND_ADDRESS], [account, MAX_PER_EMAIL], ['address ' + address, MAX_PER_ADDRESS]];
}

// The failures still inside the time window, oldest first.
function recent(key, now) {
  const times = (failures.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (times.length) failures.set(key, times);
  else failures.delete(key);
  return times;
}

// Refuses (429) while this email or address has to wait. Call it before checking the password.
function check(form, email, address) {
  const now = Date.now();
  let until = 0;
  keysFor(form, email, String(address)).forEach(([key, max]) => {
    const times = recent(key, now);
    // The wait ends when the oldest counted failure leaves the window.
    if (times.length >= max) until = Math.max(until, times[times.length - max] + WINDOW_MS);
  });
  if (until > now) {
    const minutes = Math.ceil((until - now) / 60000);
    throw new HttpError(429, 'Too many sign-in attempts. Please wait ' + minutes + ' minute' + (minutes === 1 ? '' : 's') + ' and try again.');
  }
}

// Records a wrong password, or an email with no account.
function fail(form, email, address) {
  const now = Date.now();
  keysFor(form, email, String(address)).forEach(([key]) => failures.set(key, recent(key, now).concat(now)));
}

// A correct password: this address starts again for this email on every form, and so does the
// email's overall count. Another address that is waiting for this email keeps waiting.
function succeed(email, address) {
  FORMS.forEach((form) => {
    const account = form + ' ' + normalize(email);
    failures.delete(account);
    failures.delete(account + ' ' + address);
  });
}

// A password reset proves the person controls the email: every count for it is cleared.
function clear(email) {
  const prefixes = FORMS.map((form) => form + ' ' + normalize(email));
  Array.from(failures.keys()).forEach((key) => {
    if (prefixes.some((p) => key === p || key.startsWith(p + ' '))) failures.delete(key);
  });
}

// Old entries are dropped now and then, so the list cannot grow without end.
setInterval(() => {
  const now = Date.now();
  Array.from(failures.keys()).forEach((key) => recent(key, now));
}, 10 * 60 * 1000).unref();

module.exports = { check, fail, succeed, clear };
