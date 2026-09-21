import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { MEDIA_DIR, getDb } from './store.js';
import { outputPattern } from './naming.js';
import { resolveStreamUrl } from './stream-url.js';

export class RecordingEngine extends EventEmitter {
  constructor() { super(); this.processes = new Map(); }
  statuses() { return Object.fromEntries([...this.processes].map(([key, item]) => { item.currentFile = this.latestFile(item.directory); return [key, { state: item.state, pid: item.child?.pid, startedAt: item.startedAt, currentFile: item.currentFile, error: item.error }]; })); }
  status(id) { return this.statuses()[id] || { state: 'stopped', currentFile: null }; }

  async start(recording) {
    if (this.processes.has(recording.id)) return;
    const preset = recording.mode === 'copy' ? null : getDb().presets.find(item => item.id === recording.presetId);
    if (recording.mode !== 'copy' && !preset) throw new Error('Transcode preset not found');
    const extension = recording.mode === 'copy' ? (recording.sourceExtension || 'aac') : preset.extension;
    const relativePattern = outputPattern(recording, extension);
    const absolutePattern = path.resolve(MEDIA_DIR, relativePattern);
    if (!absolutePattern.startsWith(MEDIA_DIR)) throw new Error('Recording folder must be inside the media directory');
    fs.mkdirSync(path.dirname(absolutePattern), { recursive: true });
    const state = { state: 'starting', startedAt: new Date().toISOString(), currentFile: null, directory: path.dirname(absolutePattern), error: null, stderr: '', child: null, stopped: false };
    this.processes.set(recording.id, state);
    this.emit('status');
    try {
      const sourceUrl = recording.sourceType === 'stream' ? await resolveStreamUrl(recording.sourceUrl) : null;
      if (state.stopped) return;
      const segmentSeconds = Math.max(60, Number(recording.chunkMinutes || 60) * 60);
      const inputArgs = recording.sourceType === 'ingest'
        ? ['-listen', '1', '-i', `http://0.0.0.0:${recording.ingestPort}`]
        : ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-i', sourceUrl];
      const codecArgs = recording.mode === 'copy' ? ['-c:a', 'copy'] : preset.args;
      const args = ['-hide_banner', '-loglevel', 'warning', ...inputArgs, '-map', '0:a:0', ...codecArgs, '-f', 'segment', '-segment_time', String(segmentSeconds), '-segment_atclocktime', '1', '-reset_timestamps', '1', '-strftime', '1', absolutePattern];
      const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { windowsHide: true });
      state.child = child;
      state.state = 'recording';
      child.stderr.on('data', chunk => { state.stderr = `${state.stderr}${chunk}`.slice(-4000); state.currentFile = this.latestFile(state.directory); this.emit('status'); });
      child.on('error', error => { state.state = 'error'; state.error = error.message; this.emit('status'); });
      child.on('exit', (code, signal) => {
        state.child = null;
        if (state.stopped || signal === 'SIGTERM' || code === 0) this.processes.delete(recording.id);
        else { state.state = 'error'; state.error = state.stderr || `FFmpeg exited with code ${code}`; this.emit('failure', recording.id, state.error); }
        this.emit('status');
      });
      this.emit('status');
    } catch (error) {
      state.state = 'error';
      state.error = error.message;
      this.emit('failure', recording.id, error.message);
      this.emit('status');
    }
  }

  stop(id) {
    const state = this.processes.get(id);
    if (!state) return;
    state.stopped = true;
    if (!state.child) { this.processes.delete(id); this.emit('status'); return; }
    state.state = 'stopping';
    state.child.kill('SIGTERM');
    this.emit('status');
  }

  latestFile(directory) {
    try {
      return fs.readdirSync(directory).map(name => ({ name, time: fs.statSync(path.join(directory, name)).mtimeMs })).sort((a, b) => b.time - a.time)[0]?.name || null;
    } catch { return null; }
  }

  stopAll() { for (const id of this.processes.keys()) this.stop(id); }
}
