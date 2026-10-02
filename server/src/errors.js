// An error that should reach the browser as a clear message with this status.
class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || {};
  }
}

// Turns the database's own refusals into friendly answers; anything else is a real bug.
function fromDatabase(err) {
  if (!err || !err.code) return null;
  const text = err.sqlMessage || err.message || '';

  if (err.sqlState === '45000') {
    return new HttpError(400, text);
  }
  if (err.code === 'ER_DUP_ENTRY') {
    if (/uq_users_email/.test(text)) return new HttpError(409, 'An account with this email already exists.');
    if (/uq_orphanages_registration/.test(text)) return new HttpError(409, 'That registration number is already used by another orphanage.');
    return new HttpError(409, 'That already exists.');
  }
  if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    if (/ck_orphanages_verified/.test(text)) return new HttpError(400, 'An orphanage needs a registration number and accepted terms before it can be verified.');
    if (/ck_partner_verified/.test(text)) return new HttpError(400, 'A partner organization needs a sanctions screening and accepted terms before it can be verified.');
    if (/ck_orphanages_year/.test(text)) return new HttpError(400, 'Please enter a valid founding year.');
    if (/ck_needs_goal/.test(text)) return new HttpError(400, 'The goal must be more than zero.');
    if (/ck_messages_body/.test(text)) return new HttpError(400, 'Messages must be between 1 and 2000 characters.');
    return new HttpError(400, 'Those details are not allowed.');
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_ROW_IS_REFERENCED_2') {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') return new HttpError(409, 'This record is used elsewhere (for example it has donations), so it cannot be removed.');
    return new HttpError(400, 'One of the linked records does not exist.');
  }
  if (err.code === 'ER_DATA_TOO_LONG') return new HttpError(400, 'One of the fields is too long.');
  return null;
}

module.exports = { HttpError, fromDatabase };
