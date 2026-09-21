import fs from 'node:fs';
import path from 'node:path';
import { MEDIA_DIR } from './store.js';

function cutoff(retention, now) {
  if (!retention || retention.unit === 'forever') return null;
  const date = new Date(now);
  const value = Math.max(1, Number(retention.value) || 1);
  if (retention.unit === 'days') date.setDate(date.getDate() - value);
  if (retention.unit === 'months') date.setMonth(date.getMonth() - value);
  if (retention.unit === 'years') date.setFullYear(date.getFullYear() - value);
  return date;
}

export function applyRetention(recording, now = new Date()) {
  const before = cutoff(recording.retention, now);
  if (!before) return 0;
  const directory = path.resolve(MEDIA_DIR, recording.folder || '');
  if (!directory.startsWith(MEDIA_DIR) || !fs.existsSync(directory)) return 0;
  let removed = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(directory, entry.name);
    if (fs.statSync(file).mtime < before) { fs.unlinkSync(file); removed += 1; }
  }
  return removed;
}
