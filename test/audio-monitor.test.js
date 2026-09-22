import test from 'node:test';
import assert from 'node:assert/strict';
import { audioStatus, consumeMeterOutput, createAudioMonitor, processMeterLine } from '../server/audio-monitor.js';

test('parses stereo peak and RMS levels', () => {
  const monitor = createAudioMonitor();
  processMeterLine(monitor, 'lavfi.astats.1.Peak_level=-3.5');
  processMeterLine(monitor, 'lavfi.astats.1.RMS_level=-14.25');
  processMeterLine(monitor, 'lavfi.astats.2.Peak_level=-4.5');
  processMeterLine(monitor, 'lavfi.astats.2.RMS_level=-15.25');
  assert.deepEqual(audioStatus(monitor).channels, [
    { peakDb: -3.5, rmsDb: -14.25 },
    { peakDb: -4.5, rmsDb: -15.25 }
  ]);
});

test('detects sustained stereo silence and clears on signal', () => {
  const monitor = createAudioMonitor({ silenceThresholdDb: -50, silenceDurationSeconds: 2 });
  processMeterLine(monitor, 'lavfi.astats.1.RMS_level=-60');
  processMeterLine(monitor, 'lavfi.astats.2.RMS_level=-61');
  processMeterLine(monitor, 'frame:1', 1_000);
  processMeterLine(monitor, 'frame:2', 3_100);
  assert.equal(audioStatus(monitor, 3_100).silent, true);
  processMeterLine(monitor, 'lavfi.astats.1.RMS_level=-20');
  processMeterLine(monitor, 'frame:3', 3_200);
  assert.equal(audioStatus(monitor, 3_200).silent, false);
  assert.equal(audioStatus(monitor, 3_200).silenceSeconds, 0);
});

test('duplicates mono levels for the right meter', () => {
  const monitor = createAudioMonitor();
  processMeterLine(monitor, 'lavfi.astats.1.Peak_level=-8');
  processMeterLine(monitor, 'lavfi.astats.1.RMS_level=-18');
  assert.deepEqual(audioStatus(monitor).channels[1], { peakDb: -8, rmsDb: -18 });
});

test('throttles complete meter frame updates', () => {
  const monitor = createAudioMonitor();
  const output = 'frame:1\nlavfi.astats.1.RMS_level=-12\nlavfi.astats.2.RMS_level=-13\n';
  assert.equal(consumeMeterOutput(monitor, output, 1_000), true);
  assert.equal(consumeMeterOutput(monitor, output, 1_050), false);
  assert.equal(consumeMeterOutput(monitor, output, 1_100), true);
});
