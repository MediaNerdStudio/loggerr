# Loggerr

Loggerr is a self-hosted radio and audio logging application. It records online radio streams into predictable, time-based files, provides live recording status in a web interface, and lets operators browse, play, inspect, and download the resulting archive.

The application is designed for long-running broadcast capture and Docker deployment. Its recording engine keeps one FFmpeg process connected to each active source and rotates output files with FFmpeg's segment muxer, avoiding a source reconnect at every file boundary.

## Features

- Record HTTP and HTTPS radio streams
- Keep a single source connection alive while rotating output files
- Run continuously, on a schedule, once, or under external REST control
- Split recordings into 5, 15, 30, 60, or 120-minute chunks
- Preserve the source codec where supported
- Transcode with built-in or user-defined FFmpeg presets
- Generate normalized, timestamped filenames
- Store every recording in its own media folder
- Automatically remove files according to per-recording retention rules
- View live recording state and the current output filename
- Browse archived files by recording and date
- Play files with a WaveSurfer waveform
- Download original recording files
- Prepare ingest listeners for a future Windows audio capture client
- Persist configuration and media independently through Docker volumes

## Screens and workflow

### Recordings

The recording overview shows all configured sources, whether they are enabled, their current engine state, encoding mode, chunk duration, and current output filename.

Creating or editing a recording allows you to configure:

- Recording title
- Online stream or ingest source
- Automatic scheduling or external triggering
- Chunk duration
- Source-copy or transcoded output
- Filename prefix, stream name, and date format
- Destination folder
- Retention period

An enabled continuous recording begins as soon as it is saved. Editing an active recording restarts its FFmpeg process so the new settings take effect.

### Playback

The playback screen lets you:

1. Select a configured recording.
2. Select a date. Today is used initially; when no files exist for today, the latest recording date is selected.
3. Select a recording file.
4. Play, pause, seek on the waveform, or download the file.

### Options

The options screen manages transcode presets. Each preset has a display name, output extension, and FFmpeg audio arguments.

## Seamless chunking

Loggerr does **not** start a new source connection for every chunk. Each active recording has one long-running FFmpeg process:

```text
Radio stream -> one FFmpeg input -> segment muxer -> file 1, file 2, file 3, ...
```

FFmpeg's segment muxer rotates output files inside that process. Segment boundaries are aligned to wall-clock intervals where possible with `-segment_atclocktime 1`.

For example, an hourly recording saved at 13:36 starts immediately. Its first file runs until the next aligned boundary around 14:00, after which normal hourly chunks follow.

### Important codec note

A continuous capture process prevents reconnect gaps, but compressed codecs have their own frame and encoder-delay characteristics:

- **PCM WAV** is recommended for sample-accurate DAW workflows.
- **Source-copy AAC/MP3/Ogg/Opus** retains source packets without re-encoding, but standalone files can expose codec frame or container boundary behavior.
- **Transcoded MP3/AAC/Ogg** can include encoder priming or padding inherent to the codec.

When files must be joined sample-accurately in a DAW, use the built-in `PCM WAV 48 kHz / 24-bit` preset.

## Requirements

### Local development

- Node.js 20 or newer
- npm
- FFmpeg available on `PATH`
- A modern browser

Check FFmpeg with:

```bash
ffmpeg -version
ffprobe -version
```

### Docker

- Docker Engine or Docker Desktop
- Docker Compose v2

The Docker image includes FFmpeg, `tini`, and the built web interface.

## Quick start with Docker

Clone the repository:

```bash
git clone https://github.com/MediaNerdStudio/loggerr.git
cd loggerr
```

Start Loggerr:

```bash
docker compose up -d --build
```

Open:

```text
http://localhost:3000
```

View logs:

```bash
docker compose logs -f loggerr
```

Stop the application gracefully:

```bash
docker compose down
```

The default Compose file persists:

- `./data` -> `/app/data`
- `./media` -> `/app/media`

Stopping or replacing the container does not remove these files.

## Local installation

Install backend and frontend dependencies:

```bash
npm install
npm --prefix ui install
```

Copy the environment template if you want custom settings:

```bash
cp .env.example .env
```

On PowerShell:

```powershell
Copy-Item .env.example .env
```

### Development mode

```bash
npm run dev
```

Development services:

- Web interface: `http://localhost:3000`
- API server: `http://localhost:3001`
- Vite proxies `/api` and `/media` to the API server

### Production mode

Build the frontend and start the single-port production server:

```bash
npm run build
npm start
```

The production interface and API are both served from `http://localhost:3000` by default.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port used by the production server. Development overrides the API server to `3001`. |
| `DATA_DIR` | `./data` | Directory containing persistent application configuration. |
| `MEDIA_DIR` | `./media` | Root directory for recorded audio. |
| `TZ` | System timezone | Timezone used for scheduling and timestamped filenames. Docker Compose defaults to `Europe/Amsterdam`. |
| `FFMPEG_PATH` | `ffmpeg` | FFmpeg executable name or absolute path. |

Example:

```env
PORT=3000
DATA_DIR=./data
MEDIA_DIR=./media
TZ=Europe/Amsterdam
FFMPEG_PATH=ffmpeg
```

Timezone configuration is important because schedules and filenames follow the server or container timezone.

## Recording configuration

### Source types

#### Online stream

Online sources must use an HTTP or HTTPS URL, for example:

```text
https://audio-streaming.qmusic.nl/Qmusic_nl_live_high.aac
```

For stream sources, FFmpeg is started with reconnect support. If a remote server temporarily disconnects, FFmpeg attempts to reconnect without requiring Loggerr to create a new recording instance.

Direct audio URLs and `.m3u` or `.pls` playlist URLs are supported. Loggerr resolves M3U/PLS playlists to their first audio URL before starting FFmpeg. HLS `.m3u8` manifests are passed directly to FFmpeg.

#### Audio ingest

Ingest sources reserve an HTTP listener port between `1024` and `65535`; the UI defaults to `9100`. Docker Compose publishes ports `9100-9199` for future capture clients.

Ingest is currently an experimental foundation for the planned Windows capture application. It is intended to receive encoded or raw audio pushed to FFmpeg's HTTP listener. Ingest recordings always use a transcode preset.

The future Windows client is expected to add:

- WDM/WASAPI capture
- Kernel Streaming capture
- MME capture
- ASIO capture
- Multiple simultaneous inputs
- Stereo level meters
- Connection and received-audio feedback
- Main-server feed discovery and authentication

### Trigger modes

#### Follow schedule

The recording engine evaluates the configured schedule every 15 seconds and starts or stops FFmpeg as needed.

#### REST trigger

A trigger-controlled recording only runs after receiving a start request. Use the REST endpoints documented below to start and stop it.

### Schedule types

#### 24/7

Runs whenever the recording is enabled. It starts immediately after saving or after the Loggerr service starts.

#### Weekly schedule

Select one or more weekdays and a start/end time. Overnight ranges are supported. For example, Monday `22:00` to `02:00` continues into Tuesday morning.

#### Once

Runs between one explicit start date/time and end date/time.

### Chunk durations

Supported durations are:

- 5 minutes
- 15 minutes
- 30 minutes
- 60 minutes
- 120 minutes

Chunks use wall-clock alignment. A partial first chunk is expected when a recording starts between normal boundaries.

## Output formats

### Same as source

For online streams, Loggerr can pass audio packets through FFmpeg with `-c:a copy`. Select the expected source extension:

- AAC
- MP3
- Ogg
- Opus

The extension must match the actual source format. Source-copy is unavailable for ingest sources.

### Transcode presets

Built-in presets:

| Preset | FFmpeg settings |
| --- | --- |
| PCM WAV 48 kHz / 24-bit | `-c:a pcm_s24le -ar 48000` |
| MP3 128 kbps / 44.1 kHz | `-c:a libmp3lame -b:a 128k -ar 44100` |
| MP3 320 kbps / 48 kHz | `-c:a libmp3lame -b:a 320k -ar 48000` |
| AAC 128 kbps / 44.1 kHz | `-c:a aac -b:a 128k -ar 44100` |
| AAC 320 kbps / 48 kHz | `-c:a aac -b:a 320k -ar 48000` |
| Ogg Vorbis 192 kbps / 48 kHz | `-c:a libvorbis -b:a 192k -ar 48000` |

Custom presets can be added from Options. Arguments are passed directly to FFmpeg, so only administrators who understand FFmpeg syntax should modify them.

A preset cannot be deleted while a recording uses it.

## Filename and folder naming

The default filename structure is:

```text
<prefix>_<stream-name>_<date>_<start-time>.<extension>
```

Example:

```text
Qmusic_5500_2026-09-21_120000.mp3
```

Fields:

- **Prefix:** Uses the recording title when empty.
- **Stream name:** Optional identifier such as `5500`, `DAB`, or `DHD`.
- **Date:** One of `YYYY-MM-DD`, `YYYYMMDD`, or `DDMMYY`.
- **Start time:** Always `HHMMSS`.
- **Folder:** Defaults to a filename-safe version of the recording title.

Names and folders are normalized to lowercase-safe path components. All recording folders remain inside `MEDIA_DIR`.

Example layout:

```text
media/
└── qmusic/
    ├── qmusic_5500_2026-09-21_120000.aac
    ├── qmusic_5500_2026-09-21_130000.aac
    └── qmusic_5500_2026-09-21_140000.aac
```

## Retention

Each recording has an independent retention policy:

- Days
- Months
- Years
- Keep forever

The default is one month. Loggerr runs retention processing once per hour and removes files whose modification time is older than the calculated cutoff.

Deleting a recording configuration does **not** delete its existing media files.

Back up important archives before enabling automatic retention.

## Recording states

The web interface can display:

| State | Meaning |
| --- | --- |
| `stopped` | No FFmpeg process exists for the recording. |
| `recording` | FFmpeg is active or waiting for ingest audio. |
| `stopping` | A graceful FFmpeg shutdown has been requested. |
| `error` | FFmpeg could not be started. |

Status and the current filename are sent to browsers with Server-Sent Events. Loggerr also refreshes and broadcasts engine state every 15 seconds.

## REST API

The current API has no authentication. Keep Loggerr on a trusted network or place it behind an authenticated reverse proxy.

### Health

```http
GET /api/health
```

Example response:

```json
{
  "ok": true,
  "ffmpegProcesses": 2
}
```

### Live events

```http
GET /api/events
```

Returns a Server-Sent Events stream containing the complete recording list and live status information.

### Recordings

```http
GET    /api/recordings
POST   /api/recordings
PUT    /api/recordings/:id
DELETE /api/recordings/:id
GET    /api/recordings/:id/files
```

Deleting a recording stops its process and removes its configuration, but keeps its media files.

### External triggers

The recording must have `triggerMode` set to `trigger`.

Start:

```bash
curl -X POST http://localhost:3000/api/recordings/RECORDING_ID/trigger/start
```

Stop:

```bash
curl -X POST http://localhost:3000/api/recordings/RECORDING_ID/trigger/stop
```

Calling these endpoints for a schedule-controlled recording returns HTTP `409`.

### Presets

```http
GET    /api/presets
POST   /api/presets
PUT    /api/presets/:id
DELETE /api/presets/:id
```

Create a preset example:

```bash
curl -X POST http://localhost:3000/api/presets \
  -H "Content-Type: application/json" \
  -d '{
    "name": "FLAC 48 kHz",
    "extension": "flac",
    "args": ["-c:a", "flac", "-ar", "48000"]
  }'
```

### Media

Recorded files are served with byte-range support under:

```text
/media/<recording-folder>/<filename>
```

Byte-range support allows browser playback and seeking without downloading the complete file first.

## Persistent data

Configuration is stored in:

```text
data/db.json
```

The JSON store contains recording definitions and transcode presets. Writes use a temporary file followed by a rename to reduce the risk of partially written configuration.

Recorded media is stored below:

```text
media/
```

Both directories are ignored by Git.

### Backup

Back up both directories:

```text
data/
media/
```

The application should be stopped or configuration changes avoided while copying `data/db.json`. Audio files that are currently being recorded can still be growing during a live backup.

## Docker details

The image uses a multi-stage build:

1. Node builds the React frontend.
2. A slim Node runtime installs production dependencies and FFmpeg.
3. The application runs as the unprivileged `node` user.
4. `tini` forwards termination signals for graceful FFmpeg shutdown.

Exposed ports:

- `3000`: web interface and REST API
- `9100-9199`: planned audio ingest listeners

If host-mounted directories are not writable by the container's `node` user, adjust ownership or permissions on the host rather than running the application as root.

## Reverse proxy

Loggerr can run behind a reverse proxy. The proxy must support:

- Long-lived Server-Sent Events connections on `/api/events`
- HTTP byte-range requests on `/media`
- Large or long-running media responses
- Extended timeouts for event streams

TLS and authentication should be terminated at the reverse proxy until native authentication is added.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the backend with Nodemon and the Vite development server. |
| `npm run build` | Build the production React frontend. |
| `npm start` | Run the production Express server. |
| `npm test` | Run Node's test suite. |
| `npm run lint` | Run frontend ESLint checks. |

Before opening a pull request:

```bash
npm test
npm run lint
npm run build
```

## Project structure

```text
loggerr/
├── server/
│   ├── index.js               # Express API, SSE, scheduling loop
│   ├── recording-engine.js    # FFmpeg process and segment management
│   ├── schedule.js            # Continuous, weekly, once, and trigger logic
│   ├── retention.js           # Automatic media cleanup
│   ├── naming.js              # FFmpeg output filename patterns
│   ├── media.js               # Archive file listing
│   ├── store.js               # Persistent JSON configuration
│   └── validation.js          # Recording input normalization
├── ui/
│   └── src/
│       ├── App.jsx            # Recording, playback, and options UI
│       ├── AudioPlayer.jsx    # WaveSurfer player
│       ├── api.js             # Browser API client
│       └── styles.css         # Application styling
├── test/
│   └── schedule.test.js
├── data/                      # Runtime configuration, not committed
├── media/                     # Recorded audio, not committed
├── Dockerfile
└── docker-compose.yml
```

## Troubleshooting

### Recording remains stopped

Check that:

- The recording is enabled.
- Its schedule currently permits recording.
- A trigger-controlled recording has received a start request.
- FFmpeg is installed and available through `FFMPEG_PATH`.
- The server can reach the stream URL.

Inspect application output or Docker logs:

```bash
docker compose logs -f loggerr
```

### Recording says `recording`, but no file appears

- Confirm that the source is sending audio.
- Check the stream URL directly with FFmpeg.
- Verify that `MEDIA_DIR` is writable.
- For ingest sources, verify that the sender connects to the configured port.
- Wait for the status refresh; current filenames are broadcast at least every 15 seconds.

Test an online stream independently:

```bash
ffmpeg -hide_banner -i "STREAM_URL" -t 10 -c:a copy test.aac
```

### Source-copy file does not play

The selected source extension may not match the actual codec. Inspect the source:

```bash
ffprobe "STREAM_URL"
```

Update the recording's source extension or use a transcode preset.

### Waveform cannot load

- Confirm that the file URL is reachable under `/media`.
- Confirm that the browser supports the selected codec/container.
- Try a broadly supported MP3 or M4A transcode preset.
- Check reverse-proxy byte-range handling.

### Docker container cannot write media

Ensure the mounted `data` and `media` directories are writable by the container user. On Linux, check their ownership and permissions.

### Times are incorrect

Set `TZ` explicitly. Docker Compose defaults to:

```yaml
environment:
  TZ: Europe/Amsterdam
```

Restart Loggerr after changing the timezone.

### Port 3000 is already in use

Change the host port in Compose:

```yaml
ports:
  - "8080:3000"
```

Then open `http://localhost:8080`.

## Current limitations

- The REST API and web interface do not yet include authentication or authorization.
- TCP trigger control is not yet implemented; external triggers currently use REST.
- Ingest is prepared at server level, but the Windows WDM/KS/MME/ASIO capture application is not yet included.
- There is no database server; configuration uses a local JSON file.
- Recording files are listed by filesystem modification date rather than embedded broadcast metadata.
- Waveforms are generated in the browser rather than cached as server-side peak files.
- High availability and multi-node recorder coordination are not implemented.

## Roadmap

Potential next steps include:

- Windows multi-device ingest application
- WDM/WASAPI, KS, MME, and ASIO support
- Live stereo level and silence meters
- Ingest feed discovery and authentication
- TCP trigger listener
- User authentication and roles
- Server-side waveform peak generation
- Silence and signal-loss alerts
- Recording health history and notifications
- Storage usage reporting
- Export or virtual playback across adjacent chunks
- Optional database backend for larger installations

## License

No license has been selected yet. Until a license file is added, normal copyright restrictions apply.
