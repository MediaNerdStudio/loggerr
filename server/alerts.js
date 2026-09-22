import { getDb, id, save } from './store.js';

export class AlertManager {
  constructor(onChange = () => {}) { this.onChange = onChange; }
  list() { return [...getDb().alerts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  set(recording, type, active, message, severity = 'warning', now = new Date()) {
    const current = getDb().alerts.find(alert => alert.recordingId === recording.id && alert.type === type && alert.active);
    if (active && !current) {
      getDb().alerts.unshift({ id: id(), recordingId: recording.id, recordingTitle: recording.title, type, severity, message, active: true, createdAt: now.toISOString(), resolvedAt: null, acknowledgedAt: null });
      getDb().alerts = getDb().alerts.slice(0, 500); save(); this.onChange(); return true;
    }
    if (!active && current) { current.active = false; current.resolvedAt = now.toISOString(); save(); this.onChange(); return true; }
    return false;
  }
  evaluate(recordings, statuses, now = new Date()) {
    for (const recording of recordings) {
      const status = statuses[recording.id] || { state: 'stopped' };
      const expected = recording.enabled && (status.state === 'recording' || status.state === 'starting');
      const alertsEnabled = recording.monitoring?.alertsEnabled !== false;
      const audio = status.audio;
      this.set(recording, 'silence', alertsEnabled && expected && Boolean(audio?.silent), `Audio is below ${audio?.thresholdDb ?? recording.monitoring?.silenceThresholdDb ?? -50} dBFS`, 'warning', now);
      const lastAudio = audio?.updatedAt ? new Date(audio.updatedAt).getTime() : new Date(status.startedAt || now).getTime();
      const lossSeconds = recording.monitoring?.signalLossSeconds || 10;
      const signalLost = alertsEnabled && expected && Boolean(audio) && now.getTime() - lastAudio > lossSeconds * 1000;
      this.set(recording, 'signal-loss', signalLost, `No audio meter data received for ${lossSeconds} seconds`, 'critical', now);
      this.set(recording, 'recorder-error', status.state === 'error', status.error || 'Recorder process failed', 'critical', now);
    }
  }
  acknowledge(alertId, now = new Date()) {
    const alert = getDb().alerts.find(item => item.id === alertId);
    if (!alert) return null;
    alert.acknowledgedAt = now.toISOString(); save(); this.onChange(); return alert;
  }
  acknowledgeAll(now = new Date()) {
    for (const alert of getDb().alerts) if (!alert.acknowledgedAt) alert.acknowledgedAt = now.toISOString();
    save(); this.onChange();
  }
}
