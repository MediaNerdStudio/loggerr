# Loggerr Ingest for Windows

WPF companion client that discovers authenticated Loggerr ingest feeds and captures multiple Windows audio inputs through PortAudio.

## Capture APIs

A correctly built `portaudio_x64.dll` exposes MME, WASAPI, WDM-KS, and optionally ASIO as separate host APIs. Device names in the application are prefixed with their host API. WDM-KS and ASIO commonly require exclusive device access. PortAudio generally permits multiple simultaneous streams, but many ASIO drivers permit only one open driver instance.

## Build the managed application

The project targets .NET 8 WPF. Build or publish from the repository root:

```powershell
npm run build:windows
npm run publish:windows
```

The default publish is framework-dependent and requires the .NET 8 Windows Desktop Runtime. On a machine with online NuGet access, add `--self-contained true` to produce a standalone distribution.

## Build PortAudio

Without ASIO:

```powershell
cmake -S native -B native/build -A x64
cmake --build native/build --config Release
```

With ASIO, obtain and accept the Steinberg ASIO SDK license locally. Do not commit the SDK:

```powershell
cmake -S native -B native/build-asio -A x64 -DLOGGERR_ENABLE_ASIO=ON -DASIO_SDK_PATH="C:/SDKs/asiosdk"
cmake --build native/build-asio --config Release
```

Copy the resulting `portaudio_x64.dll` beside `Loggerr.Ingest.exe`. The project automatically includes `native/build-asio` when present, otherwise `native/build`. ASIO availability depends on this build and installed device drivers.

## Connect

1. In Loggerr, create one or more recordings with source type **Audio ingest**.
2. Under **Options**, create an ingest client token and copy it immediately.
3. Start Loggerr Ingest, enter the HTTPS server URL and token, then choose **Save & discover**.
4. Select a PortAudio input endpoint for each feed and start it.

Each feed can send PCM16, MP3, or AAC. MP3 and AAC use the Windows Media Foundation encoders through a local FFmpeg bridge (`mp3_mf` and `aac_mf`). Place a shared FFmpeg build (`ffmpeg.exe` and its DLLs) beside the application or make `ffmpeg` available on `PATH`. PCM16 needs no encoder executable and is shown as **WAV / PCM 16-bit**.

The token is stored in Windows Credential Manager. Other preferences are stored under `%LOCALAPPDATA%/Loggerr/Ingest/settings.json` without the token.
