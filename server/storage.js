import fs from 'node:fs';
import path from 'node:path';
import { MEDIA_DIR } from './store.js';

function scan(directory) {
  let audioBytes = 0; let waveformBytes = 0; let fileCount = 0;
  if (!fs.existsSync(directory)) return { audioBytes, waveformBytes, fileCount, totalBytes: 0 };
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) { const child = scan(target); audioBytes += child.audioBytes; waveformBytes += child.waveformBytes; fileCount += child.fileCount; }
    else { const size = fs.statSync(target).size; if (entry.name.endsWith('.peaks.json')) waveformBytes += size; else { audioBytes += size; fileCount += 1; } }
  }
  return { audioBytes, waveformBytes, fileCount, totalBytes: audioBytes + waveformBytes };
}

export function storageUsage(recordings) {
  const perRecording = Object.fromEntries(recordings.map(recording => [recording.id, scan(path.resolve(MEDIA_DIR, recording.folder || ''))]));
  return { ...scan(MEDIA_DIR), recordings: perRecording, generatedAt: new Date().toISOString() };
}
