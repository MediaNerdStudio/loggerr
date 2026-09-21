import fs from 'node:fs';
import path from 'node:path';
import { MEDIA_DIR } from './store.js';

const audioExtensions = new Set(['.aac', '.mp3', '.m4a', '.ogg', '.wav', '.flac', '.opus']);
export function listFiles(recording) {
  const directory = path.resolve(MEDIA_DIR, recording.folder || '');
  if (!directory.startsWith(MEDIA_DIR) || !fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isFile() && audioExtensions.has(path.extname(entry.name).toLowerCase())).map(entry => {
    const stat = fs.statSync(path.join(directory, entry.name));
    return { name: entry.name, size: stat.size, modifiedAt: stat.mtime.toISOString(), date: stat.mtime.toISOString().slice(0, 10), url: `/media/${encodeURIComponent(recording.folder || '')}/${encodeURIComponent(entry.name)}` };
  }).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}
