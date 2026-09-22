import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initStore, getDb, save, id, MEDIA_DIR } from './store.js';
import { normalizeIngestTransport, normalizeRecording } from './validation.js';
import { RecordingEngine } from './recording-engine.js';
import { shouldRun } from './schedule.js';
import { applyRetention } from './retention.js';
import { listFiles } from './media.js';
import { AlertManager } from './alerts.js';
import { PeakQueue } from './peaks.js';
import { createTcpTriggerServer } from './tcp-trigger.js';
import { storageUsage } from './storage.js';
import { HealthTracker } from './health.js';
import { exportFiles } from './export.js';
import { authenticateIngest, createIngestToken, listIngestTokens, revokeIngestToken } from './ingest-auth.js';

const app = express();
const port = Number(process.env.PORT) || 3000;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
initStore();
const engine = new RecordingEngine();
const clients = new Set();
const alerts = new AlertManager();
const peakQueue = new PeakQueue();
const health = new HealthTracker();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/media', express.static(MEDIA_DIR, { acceptRanges: true, fallthrough: false }));

function publicRecording(recording) { return { ...recording, status: engine.status(recording.id) }; }
function broadcast() {
  const payload = `data: ${JSON.stringify(getDb().recordings.map(publicRecording))}\n\n`;
  for (const response of clients) response.write(payload);
}
function triggerRecording(recordingId, action) {
  const recording = getDb().recordings.find(item => item.id === recordingId);
  if (!recording) throw new Error('Recording not found');
  if (recording.triggerMode !== 'trigger') throw new Error('Recording is not trigger-controlled');
  if (!['start', 'stop'].includes(action)) throw new Error('Action must be start or stop');
  recording.triggered = action === 'start'; save(); reconcile();
  return { recordingId, action, state: engine.status(recordingId).state };
}
function reconcile() {
  for (const recording of getDb().recordings) {
    const active = engine.status(recording.id).state !== 'stopped';
    const wanted = shouldRun(recording);
    try {
      if (wanted && !active) engine.start(recording).catch(error => engine.emit('failure', recording.id, error.message));
      if (!wanted && active) engine.stop(recording.id);
    } catch (error) { engine.emit('failure', recording.id, error.message); }
  }
  broadcast();
}
engine.on('status', () => { const statuses = engine.statuses(); broadcast(); alerts.evaluate(getDb().recordings, statuses); health.evaluate(getDb().recordings, statuses); });
engine.on('segment', audioPath => peakQueue.add(audioPath));
engine.on('failure', (recordingId, message) => {
  const recording = getDb().recordings.find(item => item.id === recordingId);
  if (recording) { recording.lastError = message; save(); }
});

app.get('/api/health', (_req, res) => res.json({ ok: true, ffmpegProcesses: Object.keys(engine.statuses()).length }));
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  clients.add(res);
  res.write(`data: ${JSON.stringify(getDb().recordings.map(publicRecording))}\n\n`);
  req.on('close', () => clients.delete(res));
});
app.get('/api/ingest/tokens', (_req, res) => res.json(listIngestTokens()));
app.post('/api/ingest/tokens', (req, res) => { try { res.status(201).json(createIngestToken(req.body.name, req.body.feedIds)); } catch (error) { res.status(400).json({ error: error.message }); } });
app.delete('/api/ingest/tokens/:id', (req, res) => revokeIngestToken(req.params.id) ? res.status(204).end() : res.status(404).json({ error: 'Token not found' }));
app.get('/api/ingest/feeds', (req, res) => {
  const token = authenticateIngest(req.headers.authorization); if (!token) return res.status(401).json({ error: 'Invalid ingest token' });
  res.json(getDb().recordings.filter(recording => recording.sourceType === 'ingest' && (!token.feedIds.length || token.feedIds.includes(recording.id))).map(recording => ({ id: recording.id, title: recording.title, enabled: recording.enabled, format: recording.ingestFormat || { sampleRate: 48000, channels: 2, sampleFormat: 'f32le' }, endpoint: `/api/ingest/feeds/${recording.id}/audio`, status: engine.status(recording.id) })));
});
app.put('/api/ingest/feeds/:id/audio', (req, res) => {
  const token = authenticateIngest(req.headers.authorization, req.params.id); if (!token) return res.status(401).json({ error: 'Invalid ingest token' });
  const recording = getDb().recordings.find(item => item.id === req.params.id && item.sourceType === 'ingest'); if (!recording) return res.status(404).json({ error: 'Ingest feed not found' });
  if (!recording.enabled) return res.status(409).json({ error: 'Ingest feed is disabled' });
  const format = recording.ingestFormat || { sampleRate: 48000, channels: 2 };
  let transport; try { transport = normalizeIngestTransport(req.headers, format); } catch (error) { return res.status(415).json({ error: error.message }); }
  if (!engine.attachIngest(recording.id, req, { tokenId: token.id, name: token.name, address: req.ip }, transport)) return res.status(409).json({ error: 'Feed is busy or not ready' });
  req.on('end', () => { if (!res.headersSent) res.json({ ok: true }); }); req.on('error', () => { if (!res.headersSent) res.status(500).end(); });
});
app.get('/api/recordings', (_req, res) => res.json(getDb().recordings.map(publicRecording)));
app.post('/api/recordings', (req, res) => {
  try {
    const recording = { id: id(), createdAt: new Date().toISOString(), ...normalizeRecording(req.body) };
    getDb().recordings.push(recording); save(); reconcile(); broadcast(); res.status(201).json(publicRecording(recording));
  } catch (error) { res.status(400).json({ error: error.message }); }
});
app.put('/api/recordings/:id', (req, res) => {
  const index = getDb().recordings.findIndex(item => item.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'Recording not found' });
  try {
    engine.stop(req.params.id);
    getDb().recordings[index] = { ...normalizeRecording(req.body, getDb().recordings[index]), id: req.params.id, updatedAt: new Date().toISOString() };
    save(); setTimeout(reconcile, 500); broadcast(); res.json(publicRecording(getDb().recordings[index]));
  } catch (error) { res.status(400).json({ error: error.message }); }
});
app.delete('/api/recordings/:id', (req, res) => {
  const index = getDb().recordings.findIndex(item => item.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'Recording not found' });
  engine.stop(req.params.id); getDb().recordings.splice(index, 1); save(); broadcast(); res.status(204).end();
});
app.post('/api/recordings/:id/trigger/:action', (req, res) => {
  try { triggerRecording(req.params.id, req.params.action); res.json(publicRecording(getDb().recordings.find(item => item.id === req.params.id))); }
  catch (error) { res.status(error.message === 'Recording not found' ? 404 : 409).json({ error: error.message }); }
});
app.get('/api/recordings/:id/files', (req, res) => {
  const recording = getDb().recordings.find(item => item.id === req.params.id);
  if (!recording) return res.status(404).json({ error: 'Recording not found' });
  const files = listFiles(recording);
  const currentFile = engine.status(recording.id).currentFile;
  for (const file of files) if (!file.peaksUrl && file.name !== currentFile) peakQueue.add(path.resolve(MEDIA_DIR, recording.folder || '', file.name));
  res.json(files);
});
app.get('/api/recordings/:id/export', (req, res) => {
  const recording = getDb().recordings.find(item => item.id === req.params.id);
  if (!recording) return res.status(404).json({ error: 'Recording not found' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '')) return res.status(400).json({ error: 'A valid date is required' });
  const currentFile = engine.status(recording.id).currentFile;
  const files = listFiles(recording).filter(file => file.date === req.query.date && file.name !== currentFile).sort((a, b) => a.modifiedAt.localeCompare(b.modifiedAt));
  try { exportFiles(recording, files, res); } catch (error) { res.status(400).json({ error: error.message }); }
});
app.get('/api/health/history', (req, res) => res.json(health.history(req.query.recordingId, Number(req.query.limit) || 200)));
app.get('/api/health/summary', (_req, res) => res.json(health.summary(getDb().recordings, engine.statuses())));
app.get('/api/alerts', (_req, res) => res.json(alerts.list()));
app.post('/api/alerts/acknowledge-all', (_req, res) => { alerts.acknowledgeAll(); res.status(204).end(); });
app.post('/api/alerts/:id/acknowledge', (req, res) => { const alert = alerts.acknowledge(req.params.id); alert ? res.json(alert) : res.status(404).json({ error: 'Alert not found' }); });
app.get('/api/storage', (_req, res) => res.json(storageUsage(getDb().recordings)));
app.get('/api/presets', (_req, res) => res.json(getDb().presets));
app.post('/api/presets', (req, res) => {
  if (!req.body.name || !req.body.extension || !Array.isArray(req.body.args)) return res.status(400).json({ error: 'Name, extension and FFmpeg argument array are required' });
  const preset = { id: id(), name: req.body.name, extension: req.body.extension.replace(/[^a-z0-9]/gi, '').toLowerCase(), args: req.body.args.map(String) };
  getDb().presets.push(preset); save(); res.status(201).json(preset);
});
app.put('/api/presets/:id', (req, res) => {
  const preset = getDb().presets.find(item => item.id === req.params.id);
  if (!preset) return res.status(404).json({ error: 'Preset not found' });
  Object.assign(preset, { name: req.body.name || preset.name, extension: req.body.extension || preset.extension, args: Array.isArray(req.body.args) ? req.body.args.map(String) : preset.args }); save(); res.json(preset);
});
app.delete('/api/presets/:id', (req, res) => {
  if (getDb().recordings.some(item => item.presetId === req.params.id)) return res.status(409).json({ error: 'Preset is in use' });
  getDb().presets = getDb().presets.filter(item => item.id !== req.params.id); save(); res.status(204).end();
});

const ui = path.join(root, 'ui', 'dist');
if (fs.existsSync(ui)) {
  app.use(express.static(ui));
  app.get('*', (_req, res) => res.sendFile(path.join(ui, 'index.html')));
}

const server = app.listen(port, () => { console.log(`Loggerr listening on http://localhost:${port}`); reconcile(); });
const tcpServer = createTcpTriggerServer({ port: Number(process.env.TCP_TRIGGER_PORT) || 9090, handle: command => triggerRecording(command.recordingId, command.action) });
setInterval(reconcile, 15_000).unref();
setInterval(() => { const statuses = engine.statuses(); alerts.evaluate(getDb().recordings, statuses); health.evaluate(getDb().recordings, statuses); }, 1000).unref();
setInterval(() => getDb().recordings.forEach(recording => applyRetention(recording)), 60 * 60 * 1000).unref();
function shutdown() { engine.stopAll(); tcpServer.close(); server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 5000).unref(); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
