const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

// Files that users upload (verification documents, photos, logos, videos).
// They live in server/uploads, which is never served as plain files: documents are
// opened through an authenticated route, photos through a public one that only
// serves photo-type uploads, and videos only through short-lived signed links given
// to people who are allowed to see them.
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const MAX_BYTES = 3 * 1024 * 1024;
// Videos are bigger. The limits can be lowered on a host with little disk space.
const MAX_VIDEO_MB = Math.min(20, Math.max(1, Number(process.env.VIDEO_MAX_MB) || 15));
const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;
const VIDEO_QUOTA_MB = Math.max(MAX_VIDEO_MB, Number(process.env.ORPHANAGE_VIDEO_QUOTA_MB) || 60);

const MP4_BRANDS = new Set(['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash', '3gp4', '3gp5']);

// The type is decided from the file's own first bytes, never from its name or from
// what the browser claims, and SVG/HTML are not accepted so uploads can't run code.
const SIGNATURES = [
  { mime: 'application/pdf', ext: 'pdf', matches: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/jpeg', ext: 'jpg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', ext: 'webp', matches: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  { mime: 'video/mp4', ext: 'mp4', matches: (b) => b.length > 12 && b.subarray(4, 8).toString('latin1') === 'ftyp' && MP4_BRANDS.has(b.subarray(8, 12).toString('latin1')) },
  { mime: 'video/webm', ext: 'webm', matches: (b) => b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
];

const ALLOWED = {
  document: ['application/pdf', 'image/jpeg', 'image/png'],
  photo: ['image/jpeg', 'image/png', 'image/webp'],
  video: ['video/mp4', 'video/webm'],
};

class UploadError extends Error {}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Checks a file already in memory, writes it to disk and records it.
async function storeBuffer({ ownerUserId, purpose, filename, buffer }) {
  if (!ALLOWED[purpose]) throw new UploadError('Unknown upload type.');
  if (!buffer || buffer.length === 0) throw new UploadError('That file is empty.');
  const limit = purpose === 'video' ? MAX_VIDEO_BYTES : MAX_BYTES;
  if (buffer.length > limit) {
    throw new UploadError('That ' + (purpose === 'video' ? 'video' : 'file') + ' is too large. The limit is ' + (purpose === 'video' ? MAX_VIDEO_MB : 3) + ' MB.');
  }

  const type = SIGNATURES.find((s) => s.matches(buffer));
  if (!type || !ALLOWED[purpose].includes(type.mime)) {
    throw new UploadError(purpose === 'document'
      ? 'Documents must be a PDF, JPG or PNG file.'
      : purpose === 'video'
        ? 'Videos must be an MP4 or WebM file.'
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

// purpose: 'document' (private) or 'photo' (public, used for photos and logos), sent as base64 text.
// ownerUserId is the login that owns the file.
async function saveUpload({ ownerUserId, purpose, filename, data }) {
  if (!ALLOWED[purpose] || purpose === 'video') throw new UploadError('Unknown upload type.');
  if (typeof data !== 'string' || data.length === 0) throw new UploadError('Please choose a file to upload.');

  const base64 = data.replace(/^data:[^;]*;base64,/, '');
  if (base64.length > Math.ceil((MAX_BYTES * 4) / 3) + 8) {
    throw new UploadError('That file is too large. The limit is 3 MB.');
  }
  return storeBuffer({ ownerUserId, purpose, filename, buffer: Buffer.from(base64, 'base64') });
}

// A video arrives as raw bytes (not base64). Each login may keep a limited total of video.
async function saveVideo({ ownerUserId, filename, buffer }) {
  const used = await db.one("SELECT COALESCE(SUM(size_bytes), 0) AS bytes FROM uploads WHERE owner_user_id = ? AND purpose = 'video' AND deleted_at IS NULL", [ownerUserId]);
  if (Number(used.bytes) + (buffer ? buffer.length : 0) > VIDEO_QUOTA_MB * 1024 * 1024) {
    throw new UploadError('You have reached the limit of ' + VIDEO_QUOTA_MB + ' MB of videos. Please delete an older video first.');
  }
  return storeBuffer({ ownerUserId, purpose: 'video', filename, buffer });
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

// ---- video links ---------------------------------------------------------------
// A video is never public. People who may watch it (approved donors, verified partners, the
// owner, admins) get a link that is signed and stops working after a short time.

const LINK_MINUTES = 30;

function signature(id, expires) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET + ':video').update(id + '.' + expires).digest('hex');
}

function videoUrl(id) {
  const expires = Math.floor(Date.now() / 1000) + LINK_MINUTES * 60;
  return '/api/files/video/' + id + '?t=' + expires + '.' + signature(id, expires);
}

function videoLinkIsValid(id, token) {
  const match = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(String(token || ''));
  if (!match) return false;
  if (Number(match[1]) < Math.floor(Date.now() / 1000)) return false;
  return crypto.timingSafeEqual(Buffer.from(match[2], 'hex'), Buffer.from(signature(id, match[1]), 'hex'));
}

module.exports = {
  saveUpload, saveVideo, deleteUpload, filePathFor, photoUrl, idFromPhotoUrl, videoUrl, videoLinkIsValid,
  UploadError, MAX_BYTES, MAX_VIDEO_MB, VIDEO_QUOTA_MB,
};
