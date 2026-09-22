const FLOOR_DB = -100;

function level(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(FLOOR_DB, Math.min(6, parsed)) : FLOOR_DB;
}

export function createAudioMonitor(config = {}) {
  return {
    thresholdDb: Number(config.silenceThresholdDb ?? -50),
    durationSeconds: Number(config.silenceDurationSeconds ?? 10),
    channels: [{ peakDb: FLOOR_DB, rmsDb: FLOOR_DB }, { peakDb: FLOOR_DB, rmsDb: FLOOR_DB }],
    seenChannels: 0,
    silentSince: null,
    silent: false,
    updatedAt: null,
    buffer: '',
    lastEmitAt: 0
  };
}

export function processMeterLine(monitor, line, now = Date.now()) {
  if (line.startsWith('frame:')) {
    const channels = monitor.channels.slice(0, Math.max(1, monitor.seenChannels));
    const belowThreshold = channels.every(channel => channel.rmsDb <= monitor.thresholdDb);
    if (belowThreshold) monitor.silentSince ??= now;
    else { monitor.silentSince = null; monitor.silent = false; }
    monitor.silent = belowThreshold && now - monitor.silentSince >= monitor.durationSeconds * 1000;
    monitor.updatedAt = new Date(now).toISOString();
    return true;
  }
  const match = line.match(/^lavfi\.astats\.(\d+)\.(Peak_level|RMS_level)=(.+)$/);
  if (!match) return false;
  const channelIndex = Math.min(1, Number(match[1]) - 1);
  const property = match[2] === 'Peak_level' ? 'peakDb' : 'rmsDb';
  monitor.channels[channelIndex][property] = level(match[3]);
  monitor.seenChannels = Math.max(monitor.seenChannels, channelIndex + 1);
  if (monitor.seenChannels === 1) monitor.channels[1] = { ...monitor.channels[0] };
  return false;
}

export function consumeMeterOutput(monitor, chunk, now = Date.now()) {
  monitor.buffer += chunk;
  const lines = monitor.buffer.split(/\r?\n/);
  monitor.buffer = lines.pop() || '';
  let frame = false;
  for (const line of lines) frame = processMeterLine(monitor, line, now) || frame;
  if (!frame || now - monitor.lastEmitAt < 100) return false;
  monitor.lastEmitAt = now;
  return true;
}

export function audioStatus(monitor, now = Date.now()) {
  return {
    channels: monitor.channels.map(channel => ({ ...channel })),
    silent: monitor.silent,
    silenceSeconds: monitor.silentSince ? Math.max(0, (now - monitor.silentSince) / 1000) : 0,
    thresholdDb: monitor.thresholdDb,
    updatedAt: monitor.updatedAt
  };
}
