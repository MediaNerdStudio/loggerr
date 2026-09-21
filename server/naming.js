import path from 'node:path';
import { slug } from './store.js';

export function datePattern(pattern = 'YYYY-MM-DD') {
  if (pattern === 'DDMMYY') return '%d%m%y';
  if (pattern === 'YYYYMMDD') return '%Y%m%d';
  return '%Y-%m-%d';
}

export function outputPattern(recording, extension) {
  const prefix = slug(recording.prefix || recording.title);
  const stream = recording.streamName ? `_${slug(recording.streamName)}` : '';
  return path.join(recording.folder || slug(recording.title), `${prefix}${stream}_${datePattern(recording.dateFormat)}_%H%M%S.${extension}`);
}
