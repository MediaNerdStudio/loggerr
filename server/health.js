import { getDb, id, save } from './store.js';

export function healthCondition(recording, status, now = new Date()) {
  if (status.state === 'error') return 'error';
  if (status.audio?.silent) return 'silent';
  const stale = status.audio?.updatedAt && now.getTime() - new Date(status.audio.updatedAt).getTime() > (recording.monitoring?.signalLossSeconds || 10) * 1000;
  return status.state === 'recording' && stale ? 'signal-loss' : status.state;
}

export class HealthTracker {
  constructor() { this.previous = new Map(); }
  evaluate(recordings, statuses, now = new Date()) {
    let changed = false;
    for (const recording of recordings) {
      const status = statuses[recording.id] || { state: 'stopped', audio: null };
      const condition = healthCondition(recording, status, now);
      const previous = this.previous.get(recording.id);
      if (previous !== undefined && previous !== condition) {
        getDb().healthEvents.unshift({ id: id(), recordingId: recording.id, recordingTitle: recording.title, from: previous, to: condition, createdAt: now.toISOString() });
        changed = true;
      }
      this.previous.set(recording.id, condition);
    }
    if (changed) { getDb().healthEvents = getDb().healthEvents.slice(0, 5000); save(); }
  }
  history(recordingId, limit = 200) { return getDb().healthEvents.filter(event => !recordingId || event.recordingId === recordingId).slice(0, Math.min(1000, Math.max(1, limit))); }
  summary(recordings, statuses, now = new Date()) {
    return recordings.map(recording => {
      const status = statuses[recording.id] || { state: 'stopped' };
      const state = healthCondition(recording, status, now);
      const events = getDb().healthEvents.filter(event => event.recordingId === recording.id);
      const incidents = events.filter(event => ['error', 'silent', 'signal-loss'].includes(event.to));
      return { recordingId: recording.id, title: recording.title, state, audioUpdatedAt: status.audio?.updatedAt || null, incidentCount: incidents.length, lastIncidentAt: incidents[0]?.createdAt || null, lastTransitionAt: events[0]?.createdAt || status.startedAt || null, observedAt: now.toISOString() };
    });
  }
}
