import { slug } from './store.js';

export function normalizeIngestTransport(headers, format) {
  const transport = { codec: String(headers['x-loggerr-codec'] || 'f32le').toLowerCase(), sampleRate: Number(headers['x-loggerr-sample-rate']) || format.sampleRate, channels: Number(headers['x-loggerr-channels']) || format.channels, bitrate: Number(headers['x-loggerr-bitrate']) || null };
  if (!['f32le', 's16le', 'mp3', 'aac'].includes(transport.codec) || transport.sampleRate !== format.sampleRate || transport.channels !== format.channels) throw new Error('Unsupported ingest transport format');
  return transport;
}

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
    ingestPort: null,
    ingestFormat: sourceType === 'ingest' ? { sampleRate: [44100, 48000, 88200, 96000].includes(Number(input.ingestFormat?.sampleRate)) ? Number(input.ingestFormat.sampleRate) : 48000, channels: Number(input.ingestFormat?.channels) === 1 ? 1 : 2, sampleFormat: 'f32le' } : null,
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
    retention: input.retention?.unit === 'forever' ? { unit: 'forever', value: 0 } : { unit: ['days', 'months', 'years'].includes(input.retention?.unit) ? input.retention.unit : 'months', value: Math.max(1, Number(input.retention?.value) || 1) },
    monitoring: {
      enabled: input.monitoring?.enabled !== false,
      silenceThresholdDb: Math.min(-1, Math.max(-100, Number(input.monitoring?.silenceThresholdDb) || -50)),
      silenceDurationSeconds: Math.min(3600, Math.max(1, Number(input.monitoring?.silenceDurationSeconds) || 10)),
      signalLossSeconds: Math.min(3600, Math.max(2, Number(input.monitoring?.signalLossSeconds) || 10)),
      alertsEnabled: input.monitoring?.alertsEnabled !== false
    }
  };
}
