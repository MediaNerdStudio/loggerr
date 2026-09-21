import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
export const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || './media');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export const defaultPresets = [
  { id: 'pcm-48', name: 'PCM WAV 48 kHz / 24-bit', extension: 'wav', args: ['-c:a', 'pcm_s24le', '-ar', '48000'] },
  { id: 'mp3-128', name: 'MP3 128 kbps / 44.1 kHz', extension: 'mp3', args: ['-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100'] },
  { id: 'mp3-320', name: 'MP3 320 kbps / 48 kHz', extension: 'mp3', args: ['-c:a', 'libmp3lame', '-b:a', '320k', '-ar', '48000'] },
  { id: 'aac-128', name: 'AAC 128 kbps / 44.1 kHz', extension: 'm4a', args: ['-c:a', 'aac', '-b:a', '128k', '-ar', '44100'] },
  { id: 'aac-320', name: 'AAC 320 kbps / 48 kHz', extension: 'm4a', args: ['-c:a', 'aac', '-b:a', '320k', '-ar', '48000'] },
  { id: 'ogg-192', name: 'Ogg Vorbis 192 kbps / 48 kHz', extension: 'ogg', args: ['-c:a', 'libvorbis', '-b:a', '192k', '-ar', '48000'] }
];

const initial = { recordings: [], presets: defaultPresets };
let db;

export function initStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  try { db = { ...initial, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; }
  catch { db = structuredClone(initial); save(); }
  return db;
}

export function getDb() { return db; }
export function save() {
  const temporary = `${DB_FILE}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(db, null, 2));
  fs.renameSync(temporary, DB_FILE);
}
export function id() { return crypto.randomUUID(); }
export function slug(value) {
  return String(value || '').normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'recording';
}
