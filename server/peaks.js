import { spawn } from 'node:child_process';
import fs from 'node:fs';

function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true }); let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-2000); });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`${executable} exited ${code}: ${stderr}`)));
  });
}

export async function generatePeaks(audioPath, outputPath, points = 1200) {
  const duration = Number.parseFloat((await run(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', audioPath])).trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Could not determine audio duration');
  const sampleRate = Math.max(100, Math.ceil(points / duration) * 100);
  const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', audioPath, '-ac', '1', '-ar', String(sampleRate), '-f', 's16le', '-acodec', 'pcm_s16le', '-'], { windowsHide: true });
  const chunks = []; let stderr = '';
  child.stdout.on('data', chunk => chunks.push(chunk)); child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-2000); });
  await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr}`))); });
  const samples = Buffer.concat(chunks); const samplesPerPoint = Math.max(1, Math.floor(samples.length / 2 / points)); const peaks = [];
  for (let offset = 0; offset < samples.length; offset += samplesPerPoint * 2) { let peak = 0; const end = Math.min(samples.length, offset + samplesPerPoint * 2); for (let index = offset; index + 1 < end; index += 2) peak = Math.max(peak, Math.abs(samples.readInt16LE(index) / 32768)); peaks.push(peak); }
  const temporary = `${outputPath}.tmp`; fs.writeFileSync(temporary, JSON.stringify({ duration, peaks: [peaks] })); fs.renameSync(temporary, outputPath);
  return outputPath;
}

export class PeakQueue {
  constructor() { this.queue = []; this.active = false; }
  add(audioPath) { const outputPath = `${audioPath}.peaks.json`; if (fs.existsSync(outputPath) || this.queue.some(item => item.audioPath === audioPath)) return; this.queue.push({ audioPath, outputPath }); this.next(); }
  async next() { if (this.active || !this.queue.length) return; this.active = true; const job = this.queue.shift(); try { if (fs.existsSync(job.audioPath)) await generatePeaks(job.audioPath, job.outputPath); } catch (error) { console.warn('Could not generate waveform peaks', job.audioPath, error.message); } finally { this.active = false; this.next(); } }
}
