import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRun } from '../server/schedule.js';
import { outputPattern } from '../server/naming.js';

test('continuous recording starts immediately when enabled', () => {
  assert.equal(shouldRun({ enabled: true, triggerMode: 'continuous', schedule: { type: 'continuous' } }), true);
});

test('trigger recording only runs while triggered', () => {
  assert.equal(shouldRun({ enabled: true, triggerMode: 'trigger', triggered: false }), false);
  assert.equal(shouldRun({ enabled: true, triggerMode: 'trigger', triggered: true }), true);
});

test('overnight weekly schedule crosses midnight', () => {
  const recording = { enabled: true, triggerMode: 'continuous', schedule: { type: 'weekly', days: [1], startTime: '22:00', endTime: '02:00' } };
  assert.equal(shouldRun(recording, new Date('2026-09-21T23:00:00')), true);
  assert.equal(shouldRun(recording, new Date('2026-09-22T01:00:00')), true);
  assert.equal(shouldRun(recording, new Date('2026-09-21T12:00:00')), false);
});

test('filename pattern includes normalized fields and wall clock tokens', () => {
  assert.equal(outputPattern({ title: 'Q Music', prefix: 'Qmusic', streamName: '5500', folder: 'qmusic', dateFormat: 'YYYY-MM-DD' }, 'mp3').replaceAll('\\', '/'), 'qmusic/qmusic_5500_%Y-%m-%d_%H%M%S.mp3');
});
