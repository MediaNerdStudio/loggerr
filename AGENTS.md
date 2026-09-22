# Loggerr

Docker-first radio audio logger using Node.js, Express, React, WaveSurfer and FFmpeg.

## Development

```bash
npm install
npm --prefix ui install
npm run dev
```

The UI runs at `http://localhost:3000` and proxies API/media requests to the backend on port 3001. FFmpeg and ffprobe must be available on PATH. TCP JSON Lines triggers listen on port 9090 by default.

## Production

```bash
npm run build
npm start
```

Or run `docker compose up -d --build`. Persistent configuration is in `data/`; recordings are in `media/`. Windows ingest clients discover and stream feeds through authenticated endpoints on the main HTTP(S) port.

## Verification

```bash
npm test
npm run lint
npm run build
npm run build:windows
```

## Recording behavior

Each active source has one long-lived FFmpeg process. FFmpeg's segment muxer rotates chunks without reconnecting the source. The same process has a decoded analysis branch for live meters; do not open a second source connection for monitoring. Closed segments receive adjacent `.peaks.json` waveform files through the peak queue. Date exports stream completed same-format chunks through FFmpeg's concat demuxer and must not create permanent combined files. Use a PCM preset when sample-accurate DAW joins are required; compressed formats may include codec frame or priming behavior. Scheduled times and filenames follow the container's `TZ` setting.
