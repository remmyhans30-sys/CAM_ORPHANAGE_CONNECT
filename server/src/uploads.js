const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

// Files that users upload (verification documents, profile photos, logos).
// They live in server/uploads, which is never served as plain files: documents are
// opened through an authenticated route, photos through a public one that only
// serves photo-type uploads.
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const MAX_BYTES = 3 * 1024 * 1024;

// The type is decided from the file's own first bytes, never from its name or from
// what the browser claims, and SVG/HTML are not accepted so uploads can't run code.
const SIGNATURES = [
  { mime: 'application/pdf', ext: 'pdf', matches: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/jpeg', ext: 'jpg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', ext: 'webp', matches: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

const ALLOWED = {
  document: ['application/pdf', 'image/jpeg', 'image/png'],
  photo: ['image/jpeg', 'image/png', 'image/webp'],
};

class UploadError extends Error {}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// purpose: 'document' (private) or 'photo' (public, used for photos and logos).
// ownerUserId is the login that owns the file.
async function saveUpload({ ownerUserId, purpose, filename, data }) {
  if (!ALLOWED[purpose]) throw new UploadError('Unknown upload type.');
  if (typeof data !== 'string' || data.length === 0) throw new UploadError('Please choose a file to upload.');

  const base64 = data.replace(/^data:[^;]*;base64,/, '');
  if (base64.length > Math.ceil((MAX_BYTES * 4) / 3) + 8) {
    throw new UploadError('That file is too large. The limit is 3 MB.');
  }
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0) throw new UploadError('That file is empty.');
  if (buffer.length > MAX_BYTES) throw new UploadError('That file is too large. The limit is 3 MB.');

  const type = SIGNATURES.find((s) => s.matches(buffer));
  if (!type || !ALLOWED[purpose].includes(type.mime)) {
    throw new UploadError(purpose === 'document'
      ? 'Documents must be a PDF, JPG or PNG file.'
      : 'Photos must be a JPG, PNG or WebP image.');
  }

  const id = crypto.randomBytes(16).toString('hex');
  const cleanName = String(filename || 'file').replace(/[^\w.\- ()]/g, '_').slice(-80) || 'file';
  fs.writeFileSync(path.join(UPLOAD_DIR, id + '.' + type.ext), buffer, { flag: 'wx' });

  try {
    await db.run('INSERT INTO uploads (id, owner_user_id, purpose, original_name, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?)',
      [id, ownerUserId, purpose, cleanName, type.mime, buffer.length]);
  } catch (err) {
    fs.rmSync(path.join(UPLOAD_DIR, id + '.' + type.ext), { force: true });
    throw err;
  }

  return { id, name: cleanName, mime: type.mime, size: buffer.length };
}

function extensionFor(mime) {
  return SIGNATURES.find((s) => s.mime === mime).ext;
}

function filePathFor(upload) {
  return path.join(UPLOAD_DIR, upload.id + '.' + extensionFor(upload.mime_type));
}

async function deleteUpload(id) {
  const upload = await db.one('SELECT * FROM uploads WHERE id = ?', [id]);
  if (!upload) return;
  fs.rmSync(filePathFor(upload), { force: true });
  await db.run('DELETE FROM uploads WHERE id = ?', [id]);
}

function photoUrl(id) {
  return '/api/files/photo/' + id;
}

function idFromPhotoUrl(url) {
  const match = /^\/api\/files\/photo\/([0-9a-f]{32})$/.exec(url || '');
  return match ? match[1] : null;
}

module.exports = { saveUpload, deleteUpload, filePathFor, photoUrl, idFromPhotoUrl, UploadError, MAX_BYTES };
