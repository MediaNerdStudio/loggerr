import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIngestTransport, normalizeRecording } from '../server/validation.js';

test('normalizes authenticated PCM ingest format', () => {
  const recording = normalizeRecording({ title: 'Studio', sourceType: 'ingest', ingestFormat: { sampleRate: 96000, channels: 1 }, mode: 'copy' });
  assert.deepEqual(recording.ingestFormat, { sampleRate: 96000, channels: 1, sampleFormat: 'f32le' });
  assert.equal(recording.mode, 'transcode');
  assert.equal(recording.ingestPort, null);
});

test('validates compressed ingest transport headers', () => {
  assert.deepEqual(normalizeIngestTransport({ 'x-loggerr-codec': 'mp3', 'x-loggerr-sample-rate': '48000', 'x-loggerr-channels': '2', 'x-loggerr-bitrate': '192000' }, { sampleRate: 48000, channels: 2 }), { codec: 'mp3', sampleRate: 48000, channels: 2, bitrate: 192000 });
  assert.throws(() => normalizeIngestTransport({ 'x-loggerr-codec': 'ogg' }, { sampleRate: 48000, channels: 2 }), /Unsupported/);
  assert.throws(() => normalizeIngestTransport({ 'x-loggerr-codec': 'aac', 'x-loggerr-sample-rate': '44100' }, { sampleRate: 48000, channels: 2 }), /Unsupported/);
});

test('uses safe ingest format defaults', () => {
  const recording = normalizeRecording({ title: 'Studio', sourceType: 'ingest', ingestFormat: { sampleRate: 12345, channels: 8 } });
  assert.deepEqual(recording.ingestFormat, { sampleRate: 48000, channels: 2, sampleFormat: 'f32le' });
});
