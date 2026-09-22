import test from 'node:test';
import assert from 'node:assert/strict';
import { healthCondition } from '../server/health.js';

const recording = { monitoring: { signalLossSeconds: 10 } };

test('health condition reports recording with fresh audio', () => {
  const now = new Date('2026-09-22T12:00:00Z');
  assert.equal(healthCondition(recording, { state: 'recording', audio: { updatedAt: '2026-09-22T11:59:55Z', silent: false } }, now), 'recording');
});

test('health condition detects stale audio, silence, and errors', () => {
  const now = new Date('2026-09-22T12:00:00Z');
  assert.equal(healthCondition(recording, { state: 'recording', audio: { updatedAt: '2026-09-22T11:59:40Z', silent: false } }, now), 'signal-loss');
  assert.equal(healthCondition(recording, { state: 'recording', audio: { updatedAt: now.toISOString(), silent: true } }, now), 'silent');
  assert.equal(healthCondition(recording, { state: 'error' }, now), 'error');
});
