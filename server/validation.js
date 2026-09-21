import { slug } from './store.js';

export function normalizeRecording(input, existing = {}) {
  const title = String(input.title || '').trim();
  if (!title) throw new Error('Title is required');
  const sourceType = input.sourceType === 'ingest' ? 'ingest' : 'stream';
  if (sourceType === 'stream' && !/^https?:\/\//i.test(input.sourceUrl || '')) throw new Error('A valid HTTP(S) stream URL is required');
  return {
    ...existing,
    title,
    enabled: input.enabled !== false,
    sourceType,
    sourceUrl: sourceType === 'stream' ? input.sourceUrl.trim() : '',
    ingestPort: sourceType === 'ingest' ? Math.min(65535, Math.max(1024, Number(input.ingestPort) || 9100)) : null,
    triggerMode: input.triggerMode === 'trigger' ? 'trigger' : 'continuous',
    triggered: existing.triggered || false,
    schedule: input.schedule || { type: 'continuous' },
    chunkMinutes: [5, 15, 30, 60, 120].includes(Number(input.chunkMinutes)) ? Number(input.chunkMinutes) : 60,
    mode: sourceType === 'ingest' ? 'transcode' : input.mode === 'copy' ? 'copy' : 'transcode',
    sourceExtension: ['aac', 'mp3', 'ogg', 'opus'].includes(input.sourceExtension) ? input.sourceExtension : 'aac',
    presetId: input.presetId || 'mp3-128',
    prefix: String(input.prefix || ''),
    streamName: String(input.streamName || ''),
    dateFormat: ['YYYY-MM-DD', 'YYYYMMDD', 'DDMMYY'].includes(input.dateFormat) ? input.dateFormat : 'YYYY-MM-DD',
    folder: slug(input.folder || title),
    retention: input.retention?.unit === 'forever' ? { unit: 'forever', value: 0 } : { unit: ['days', 'months', 'years'].includes(input.retention?.unit) ? input.retention.unit : 'months', value: Math.max(1, Number(input.retention?.value) || 1) }
  };
}
