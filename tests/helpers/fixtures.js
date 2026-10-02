// Small made-up files that the tests upload: they only have the first bytes of a real PNG, PDF or
// MP4, which is what the site checks. They are written to tests/.output/fixtures when first needed,
// so no binary files are kept in the project.
const fs = require('fs');
const path = require('path');
const { OUTPUT } = require('./site');

const DIR = path.join(OUTPUT, 'fixtures');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function mp4(size) {
  const b = Buffer.alloc(size, 7);
  b.writeUInt32BE(24, 0);
  b.write('ftypisom', 4, 'latin1');
  return b;
}

function pdf(size) {
  const head = Buffer.from('%PDF-1.4\n');
  return Buffer.concat([head, Buffer.alloc(size - head.length, 66)]);
}

const FILES = {
  'me.png': () => Buffer.concat([PNG, Buffer.alloc(200, 1)]),
  'logo.png': () => Buffer.concat([PNG, Buffer.alloc(200, 2)]),
  'post-photo.png': () => Buffer.concat([PNG, Buffer.alloc(300, 1)]),
  'post-clip.mp4': () => mp4(300000),
  'post-big.mp4': () => mp4(3 * 1024 * 1024),
  'post-notes.txt': () => Buffer.from('just some notes'),
  'reg.pdf': () => pdf(409),
};

// The path of a fixture, creating the file the first time.
function fixture(name) {
  if (!FILES[name]) throw new Error('Unknown fixture: ' + name);
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, name);
  if (!fs.existsSync(file)) fs.writeFileSync(file, FILES[name]());
  return file;
}

module.exports = { DIR, fixture };
