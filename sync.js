// Automatic backup into a folder of the user's choosing — typically one a
// cloud client (Google Drive via Insync, Dropbox, Nextcloud…) already syncs,
// so the app never talks to any cloud itself. Main runs it at startup and at
// quit (see main.js): the store is written as a backup bundle in EXACTLY the
// format "Save backup…" produces, so "Restore backup…" reads it unchanged.
//
// Layout inside the chosen folder:
//   sticky-notes-backup.json                 the latest state (overwritten)
//   history/sticky-notes-YYYY-MM-DD_HHMMSS.json
//                                            one dated copy per CHANGE — a
//                                            backup that merely repeats the
//                                            previous one adds nothing; the
//                                            oldest are pruned past `keep`
// The dated copies are the point: a note deleted by mistake is still in
// yesterday's file even after the latest backup has faithfully recorded
// the deletion.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const LATEST_NAME = 'sticky-notes-backup.json';
const HISTORY_DIR = 'history';
const HISTORY_RE = /^sticky-notes-(\d{4}-\d{2}-\d{2}_\d{6})\.json$/;
const DEFAULT_KEEP = 30;

// The user-facing settings file (userData/sync.json). Per machine on
// purpose: a folder path means nothing on another computer, so it never
// rides along inside notes.json or a backup.
function loadSyncConfig(file) {
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!c || typeof c !== 'object') return {};
    return {
      dir: typeof c.dir === 'string' && c.dir ? c.dir : null,
      keep: Number.isInteger(c.keep) && c.keep > 0 ? c.keep : DEFAULT_KEEP,
      last: c.last && typeof c.last === 'object' ? c.last : null,
    };
  } catch {
    return {};
  }
}

function saveSyncConfig(file, cfg) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

// What "the same state" means for the history: the store without the image
// bundle (images are content-addressed and only ever ADDED to a bundle, so
// their presence follows from the notes that reference them).
function storeFingerprint(store) {
  const { images, ...rest } = store || {};
  return crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}

function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function listHistory(dir) {
  try {
    return fs.readdirSync(path.join(dir, HISTORY_DIR)).filter(f => HISTORY_RE.test(f)).sort();
  } catch {
    return [];
  }
}

/* writeBackup({ dir, store, images, now, keep })
 *   dir     the chosen folder (created if missing)
 *   store   the notes.json object
 *   images  { name: base64 } bundle for the pictures the notes reference
 *   now     Date (injectable for tests)
 *   keep    how many dated copies to retain
 * Returns { ok, path, changed, historyPath, pruned } or { ok:false, error }.
 * Never throws — a backup must not take the app down with it.
 */
function writeBackup({ dir, store, images = {}, now = new Date(), keep = DEFAULT_KEEP }) {
  try {
    if (!dir) return { ok: false, error: 'no backup folder chosen' };
    if (!store || typeof store !== 'object' || Array.isArray(store)) return { ok: false, error: 'nothing to back up' };
    fs.mkdirSync(dir, { recursive: true });
    const count = Object.keys(images || {}).length;
    const payload = count ? { ...store, images } : { ...store };
    const text = JSON.stringify(payload, null, 2);

    // Has the state changed since the last backup here? Compare against the
    // latest file's fingerprint, so a restart with nothing edited adds no
    // history entry.
    const latest = path.join(dir, LATEST_NAME);
    let previous = null;
    try { previous = storeFingerprint(JSON.parse(fs.readFileSync(latest, 'utf8'))); } catch {}
    const current = storeFingerprint(payload);
    const changed = previous !== current;

    writeAtomic(latest, text);

    let historyPath = null;
    const pruned = [];
    if (changed) {
      const hdir = path.join(dir, HISTORY_DIR);
      fs.mkdirSync(hdir, { recursive: true });
      historyPath = path.join(hdir, `sticky-notes-${stamp(now)}.json`);
      writeAtomic(historyPath, text);
      const files = listHistory(dir);
      for (const f of files.slice(0, Math.max(0, files.length - keep))) {
        try { fs.unlinkSync(path.join(hdir, f)); pruned.push(f); } catch {}
      }
    }
    return { ok: true, path: latest, changed, historyPath, pruned, images: count };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  loadSyncConfig, saveSyncConfig, writeBackup, storeFingerprint, listHistory,
  LATEST_NAME, HISTORY_DIR, DEFAULT_KEEP,
};
