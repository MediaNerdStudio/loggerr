import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { MEDIA_DIR } from './store.js';

const formats = { '.aac': ['adts'], '.mp3': ['mp3'], '.m4a': ['mp4', '-movflags', 'frag_keyframe+empty_moov'], '.ogg': ['ogg'], '.opus': ['opus'], '.wav': ['wav'], '.flac': ['flac'] };
function concatPath(file) { return `file '${file.replaceAll("'", "'\\''")}'`; }

export function exportFiles(recording, files, response) {
  if (!files.length) throw new Error('No completed files are available for export');
  const directory = path.resolve(MEDIA_DIR, recording.folder || '');
  const paths = files.map(file => path.resolve(directory, file.name));
  if (paths.some(file => !file.startsWith(`${directory}${path.sep}`) || !fs.existsSync(file))) throw new Error('Invalid export file');
  const extension = path.extname(paths[0]).toLowerCase();
  if (paths.some(file => path.extname(file).toLowerCase() !== extension) || !formats[extension]) throw new Error('Adjacent files must use the same supported format');
  const [format, ...formatArgs] = formats[extension];
  const filename = `${recording.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}-export${extension}`;
  response.setHeader('Content-Type', 'application/octet-stream'); response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-protocol_whitelist', 'file,pipe', '-i', 'pipe:0', '-c', 'copy', ...formatArgs, '-f', format, 'pipe:1'], { windowsHide: true });
  let closed = false;
  const close = () => { if (closed) return; closed = true; child.stdout.unpipe(response); if (!child.killed) child.kill('SIGTERM'); };
  child.stdin.on('error', error => { if (error.code !== 'EPIPE') console.warn('Export input error', error.message); });
  child.stdout.on('error', close); response.on('error', close); response.on('close', close);
  child.stderr.on('data', chunk => console.warn('Export warning', chunk.toString().trim()));
  child.stdin.end(`${paths.map(concatPath).join('\n')}\n`); child.stdout.pipe(response);
  return child;
}
