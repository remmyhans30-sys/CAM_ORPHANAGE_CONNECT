const db = require('../db');
const { HttpError } = require('../errors');
const common = require('./common');
const { videoUrl } = require('../uploads');

// What an orphanage shares with its supporters: stories, news updates and thank-yous for gifts
// received (orphanage_posts, with an optional photo and video), and links to its own pages
// elsewhere (orphanage_social_links).

const TYPES = ['story', 'update', 'gift'];
const MAX_POSTS_PER_DAY = 10;

// For the viewers (approved donors, verified partners, the home itself). A video gets a short-lived link.
function toPost(row) {
  return {
    id: row.id,
    type: row.post_type,
    title: row.title,
    text: row.body,
    date: db.dateOnly(row.created_at),
    createdAt: db.isoTime(row.created_at),
    photoUrl: common.photoUrlOf(row.photo_upload_id),
    videoUrl: row.video_upload_id ? videoUrl(row.video_upload_id) : null,
    videoName: row.video_name || null,
  };
}

const BASE = `
  SELECT p.*, v.original_name AS video_name
  FROM orphanage_posts p
  LEFT JOIN uploads v ON v.id = p.video_upload_id`;

// Newest first. Hidden posts (removed by an admin) are never listed.
async function forOrphanage(orphanageId) {
  return (await db.q(BASE + ' WHERE p.orphanage_id = ? AND p.hidden_at IS NULL ORDER BY p.id DESC', [orphanageId])).map(toPost);
}

async function countFor(orphanageIds) {
  const map = new Map(orphanageIds.map((id) => [id, 0]));
  if (orphanageIds.length === 0) return map;
  (await db.q('SELECT orphanage_id, COUNT(*) AS n FROM orphanage_posts WHERE orphanage_id IN (?) AND hidden_at IS NULL GROUP BY orphanage_id', [orphanageIds]))
    .forEach((r) => map.set(r.orphanage_id, r.n));
  return map;
}

async function getOwn(id, orphanageId) {
  const row = await db.one(BASE + ' WHERE p.id = ? AND p.orphanage_id = ?', [id, orphanageId]);
  return row || null;
}

async function create({ orphanageId, type, title, text, photoUploadId }) {
  if (!TYPES.includes(type)) throw new HttpError(400, 'Please choose what kind of post this is.');
  const body = common.text(text);
  if (!body) throw new HttpError(400, 'Please write something for your post.');
  if (body.length > 2000) throw new HttpError(400, 'Your post is too long (2,000 characters at most).');
  const heading = common.text(title, 150);
  if (title && String(title).trim().length > 150) throw new HttpError(400, 'The title is too long (150 characters at most).');

  const today = await db.one('SELECT COUNT(*) AS n FROM orphanage_posts WHERE orphanage_id = ? AND created_at > ?', [orphanageId, db.sqlTime(Date.now() - 24 * 3600 * 1000)]);
  if (today.n >= MAX_POSTS_PER_DAY) throw new HttpError(429, 'You have posted ' + MAX_POSTS_PER_DAY + ' times in the last day. Please try again tomorrow.');

  const result = await db.run(
    'INSERT INTO orphanage_posts (orphanage_id, post_type, title, body, photo_upload_id) VALUES (?, ?, ?, ?, ?)',
    [orphanageId, type, heading, body, photoUploadId || null]
  );
  return result.insertId;
}

async function setVideo(id, uploadId) {
  await db.run('UPDATE orphanage_posts SET video_upload_id = ? WHERE id = ?', [uploadId, id]);
}

// Removes a post and tells the caller which files went with it.
async function remove(id, orphanageId) {
  const row = await getOwn(id, orphanageId);
  if (!row) return null;
  await db.run('DELETE FROM orphanage_posts WHERE id = ?', [id]);
  return { photo: row.photo_upload_id, video: row.video_upload_id };
}

// ---- links to the home's own pages ---------------------------------------------

const PLATFORMS = ['website', 'facebook', 'instagram', 'youtube', 'tiktok', 'x', 'whatsapp'];
const HOSTS = {
  facebook: ['facebook.com', 'fb.com', 'fb.me'],
  instagram: ['instagram.com'],
  youtube: ['youtube.com', 'youtu.be'],
  tiktok: ['tiktok.com'],
  x: ['x.com', 'twitter.com'],
  whatsapp: ['wa.me', 'whatsapp.com'],
};
const LABELS = { website: 'Website', facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', tiktok: 'TikTok', x: 'X', whatsapp: 'WhatsApp' };

// Only plain https links to the right site are kept, so a link can never run code or lead somewhere unexpected.
function normalizeLink(platform, input) {
  let value = String(input || '').trim();
  if (!value) return null;

  if (platform === 'whatsapp' && /^\+?[\d\s()-]{7,20}$/.test(value)) {
    return 'https://wa.me/' + value.replace(/\D/g, '');
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = 'https://' + value;

  let url;
  try {
    url = new URL(value);
  } catch (err) {
    throw new HttpError(400, 'The ' + LABELS[platform] + ' link does not look like a web address.');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new HttpError(400, 'The ' + LABELS[platform] + ' link must be a normal https:// address.');
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|web)\./, '');
  const allowed = HOSTS[platform];
  if (allowed && !allowed.some((h) => host === h || host.endsWith('.' + h))) {
    throw new HttpError(400, 'The ' + LABELS[platform] + ' link must be an address on ' + allowed[0] + '.');
  }
  if (!allowed && (!host.includes('.') || host === 'localhost' || /^\d+(\.\d+){3}$/.test(host))) {
    throw new HttpError(400, 'The website link must be a normal web address such as https://example.org.');
  }
  const clean = url.toString();
  if (clean.length > 300) throw new HttpError(400, 'The ' + LABELS[platform] + ' link is too long.');
  return clean;
}

async function linksFor(orphanageIds) {
  const map = new Map(orphanageIds.map((id) => [id, {}]));
  if (orphanageIds.length === 0) return map;
  (await db.q('SELECT orphanage_id, platform, url FROM orphanage_social_links WHERE orphanage_id IN (?)', [orphanageIds]))
    .forEach((r) => { map.get(r.orphanage_id)[r.platform] = r.url; });
  return map;
}

// Saves the whole set: a platform that is left empty is removed.
async function saveLinks(orphanageId, input) {
  const wanted = {};
  for (const platform of PLATFORMS) {
    if (input && Object.prototype.hasOwnProperty.call(input, platform)) {
      const link = normalizeLink(platform, input[platform]);
      if (link) wanted[platform] = link;
    }
  }
  await db.tx(async () => {
    await db.run('DELETE FROM orphanage_social_links WHERE orphanage_id = ?', [orphanageId]);
    for (const platform of Object.keys(wanted)) {
      await db.run('INSERT INTO orphanage_social_links (orphanage_id, platform, url) VALUES (?, ?, ?)', [orphanageId, platform, wanted[platform]]);
    }
  });
  return wanted;
}

module.exports = { TYPES, PLATFORMS, forOrphanage, countFor, getOwn, create, setVideo, remove, linksFor, saveLinks, normalizeLink };
