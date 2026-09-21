import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initStore, getDb, save, id, MEDIA_DIR } from './store.js';
import { normalizeRecording } from './validation.js';
import { RecordingEngine } from './recording-engine.js';
import { shouldRun } from './schedule.js';
import { applyRetention } from './retention.js';
import { listFiles } from './media.js';

const app = express();
const port = Number(process.env.PORT) || 3000;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
initStore();
const engine = new RecordingEngine();
const clients = new Set();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/media', express.static(MEDIA_DIR, { acceptRanges: true, fallthrough: false }));

function publicRecording(recording) { return { ...recording, status: engine.status(recording.id) }; }
function broadcast() {
  const payload = `data: ${JSON.stringify(getDb().recordings.map(publicRecording))}\n\n`;
  for (const response of clients) response.write(payload);
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
engine.on('status', broadcast);
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
  const recording = getDb().recordings.find(item => item.id === req.params.id);
  if (!recording) return res.status(404).json({ error: 'Recording not found' });
  if (recording.triggerMode !== 'trigger') return res.status(409).json({ error: 'Recording is not trigger-controlled' });
  if (!['start', 'stop'].includes(req.params.action)) return res.status(400).json({ error: 'Action must be start or stop' });
  recording.triggered = req.params.action === 'start'; save(); reconcile(); res.json(publicRecording(recording));
});
app.get('/api/recordings/:id/files', (req, res) => {
  const recording = getDb().recordings.find(item => item.id === req.params.id);
  if (!recording) return res.status(404).json({ error: 'Recording not found' });
  res.json(listFiles(recording));
});
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
setInterval(reconcile, 15_000).unref();
setInterval(() => getDb().recordings.forEach(recording => applyRetention(recording)), 60 * 60 * 1000).unref();
function shutdown() { engine.stopAll(); server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 5000).unref(); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
