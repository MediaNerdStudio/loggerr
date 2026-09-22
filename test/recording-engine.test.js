import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { RecordingEngine } from '../server/recording-engine.js';

test('ingest detaches cleanly when recorder stdin emits EPIPE', () => {
  const engine = new RecordingEngine();
  const stdin = new PassThrough();
  engine.processes.set('feed', { child: { stdin }, ingestConnected: false, ingestClient: null });
  const upload = new PassThrough();
  assert.equal(engine.attachIngest('feed', upload, { name: 'test' }, { codec: 'f32le' }), true);
  assert.doesNotThrow(() => stdin.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' })));
  assert.equal(engine.processes.get('feed').ingestConnected, false);
  upload.destroy(); stdin.destroy();
});
