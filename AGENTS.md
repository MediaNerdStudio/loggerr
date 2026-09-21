# Loggerr

Docker-first radio audio logger using Node.js, Express, React, WaveSurfer and FFmpeg.

## Development

```bash
npm install
npm --prefix ui install
npm run dev
```

The UI runs at `http://localhost:3000` and proxies API/media requests to the backend on port 3001. FFmpeg and ffprobe must be available on PATH.

## Production

```bash
npm run build
npm start
```

Or run `docker compose up -d --build`. Persistent configuration is in `data/`; recordings are in `media/`. Ingest listeners use ports 9100-9199 by default.

## Verification

```bash
npm test
npm run lint
npm run build
```

## Recording behavior

Each active source has one long-lived FFmpeg process. FFmpeg's segment muxer rotates chunks without reconnecting the source. Use a PCM preset when sample-accurate DAW joins are required; compressed formats may include codec frame or priming behavior. Scheduled times and filenames follow the container's `TZ` setting.
