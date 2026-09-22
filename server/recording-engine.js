import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { MEDIA_DIR, getDb } from './store.js';
import { outputPattern } from './naming.js';
import { resolveStreamUrl } from './stream-url.js';
import { audioStatus, consumeMeterOutput, createAudioMonitor } from './audio-monitor.js';

const audioExtensions = new Set(['.aac', '.mp3', '.m4a', '.ogg', '.wav', '.flac', '.opus']);

export class RecordingEngine extends EventEmitter {
  constructor() { super(); this.processes = new Map(); }
  statuses() { return Object.fromEntries([...this.processes].map(([key, item]) => { const latest = this.latestFile(item.directory); if (item.currentFile && latest && latest !== item.currentFile) this.emit('segment', path.join(item.directory, item.currentFile)); item.currentFile = latest; return [key, { state: item.state, pid: item.child?.pid, startedAt: item.startedAt, currentFile: item.currentFile, error: item.error, audio: item.monitor ? audioStatus(item.monitor) : null, ingest: item.ingestConnected ? { connected: true, client: item.ingestClient, connectedAt: item.ingestConnectedAt } : { connected: false } }]; })); }
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
    const state = { state: 'starting', startedAt: new Date().toISOString(), currentFile: null, directory: path.dirname(absolutePattern), error: null, stderr: '', child: null, stopped: false, ingestConnected: false, ingestClient: null, monitor: recording.monitoring?.enabled === false ? null : createAudioMonitor(recording.monitoring) };
    this.processes.set(recording.id, state);
    this.emit('status');
    try {
      const sourceUrl = recording.sourceType === 'stream' ? await resolveStreamUrl(recording.sourceUrl) : null;
      if (state.stopped) return;
      const segmentSeconds = Math.max(60, Number(recording.chunkMinutes || 60) * 60);
      const inputArgs = recording.sourceType === 'ingest'
        ? ['-f', recording.ingestFormat?.sampleFormat || 'f32le', '-ar', String(recording.ingestFormat?.sampleRate || 48000), '-ac', String(recording.ingestFormat?.channels || 2), '-i', 'pipe:0']
        : ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-i', sourceUrl];
      const codecArgs = recording.mode === 'copy' ? ['-c:a', 'copy'] : preset.args;
      const segmentArgs = ['-map', '0:a:0', ...codecArgs, '-f', 'segment', '-segment_time', String(segmentSeconds), '-segment_atclocktime', '1', '-reset_timestamps', '1', '-strftime', '1', absolutePattern];
      const meterArgs = state.monitor ? ['-map', '0:a:0', '-af', 'astats=metadata=1:reset=1:measure_overall=none:measure_perchannel=Peak_level+RMS_level,ametadata=mode=print:file=-:direct=1', '-f', 'null', '-'] : [];
      const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-loglevel', 'warning', ...inputArgs, ...segmentArgs, ...meterArgs], { windowsHide: true });
      state.child = child;
      state.state = 'recording';
      child.stdin.on('error', error => { if (error.code !== 'EPIPE') { state.error = error.message; this.emit('status'); } });
      if (state.monitor) child.stdout.on('data', chunk => { if (consumeMeterOutput(state.monitor, chunk.toString())) this.emit('status'); });
      child.stderr.on('data', chunk => { state.stderr = `${state.stderr}${chunk}`.slice(-4000); state.currentFile = this.latestFile(state.directory); this.emit('status'); });
      child.on('error', error => { state.state = 'error'; state.error = error.message; this.emit('status'); });
      child.on('exit', (code, signal) => {
        state.child = null;
        if (state.currentFile) { this.emit('segment', path.join(state.directory, state.currentFile)); state.currentFile = null; }
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

  attachIngest(id, stream, client = {}, transport = {}) {
    const state = this.processes.get(id);
    if (!state?.child?.stdin?.writable || state.ingestConnected) return false;
    const codec = ['f32le', 's16le', 'mp3', 'aac'].includes(transport.codec) ? transport.codec : 'f32le';
    state.ingestConnected = true; state.ingestClient = { ...client, codec, bitrate: transport.bitrate || null }; state.ingestConnectedAt = new Date().toISOString(); this.emit('status');
    let decoder = null; let detached = false;
    const detach = () => {
      if (detached) return;
      detached = true;
      state.child?.stdin?.removeListener('error', detach);
      if (decoder) { stream.unpipe(decoder.stdin); decoder.stdout.unpipe(state.child?.stdin); if (!decoder.killed) decoder.kill('SIGTERM'); }
      else stream.unpipe(state.child?.stdin);
      state.ingestConnected = false; state.ingestClient = null; this.emit('status');
    };
    state.child.stdin.once('error', detach);
    if (codec !== 'f32le') {
      const format = codec === 'aac' ? 'aac' : codec === 'mp3' ? 'mp3' : 's16le';
      const inputArgs = codec === 's16le' ? ['-f', 's16le', '-ar', String(transport.sampleRate || 48000), '-ac', String(transport.channels || 2)] : ['-f', format];
      decoder = spawn(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', ...inputArgs, '-i', 'pipe:0', '-f', 'f32le', '-ar', String(transport.sampleRate || 48000), '-ac', String(transport.channels || 2), 'pipe:1'], { windowsHide: true });
      decoder.stdin.on('error', detach); decoder.stdout.on('error', detach); decoder.on('error', detach); decoder.on('exit', detach);
      decoder.stderr.on('data', chunk => { state.stderr = `${state.stderr}${chunk}`.slice(-4000); });
      stream.pipe(decoder.stdin); decoder.stdout.pipe(state.child.stdin, { end: false });
    } else stream.pipe(state.child.stdin, { end: false });
    stream.on('end', detach); stream.on('close', detach); stream.on('error', detach);
    return true;
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
      return fs.readdirSync(directory).filter(name => audioExtensions.has(path.extname(name).toLowerCase())).map(name => ({ name, time: fs.statSync(path.join(directory, name)).mtimeMs })).sort((a, b) => b.time - a.time)[0]?.name || null;
    } catch { return null; }
  }

  stopAll() { for (const id of this.processes.keys()) this.stop(id); }
}
