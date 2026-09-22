import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Download, Pause, Play } from 'lucide-react';

export default function AudioPlayer({ file, autoplay = false, onEnded }) {
  const container = useRef(null);
  const wave = useRef(null);
  const autoplayRef = useRef(autoplay);
  const onEndedRef = useRef(onEnded);
  autoplayRef.current = autoplay; onEndedRef.current = onEnded;
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setPlaying(false); setReady(false); wave.current = null;
    if (!file || !container.current) return;
    let instance; let cancelled = false;
    async function createPlayer() {
      let peaks; let duration;
      if (file.peaksUrl) { try { const response = await fetch(file.peaksUrl); if (response.ok) { const data = await response.json(); peaks = data.peaks; duration = data.duration; } } catch {} }
      if (cancelled) return;
      instance = WaveSurfer.create({ container: container.current, url: file.url, peaks, duration, waveColor: '#314354', progressColor: '#f0a33b', cursorColor: '#fff', height: 72, barWidth: 2, barGap: 2, normalize: true });
      wave.current = instance;
      instance.on('ready', () => { setReady(true); if (autoplayRef.current) instance.play(); });
      instance.on('play', () => setPlaying(true)); instance.on('pause', () => setPlaying(false)); instance.on('finish', () => { if (!cancelled) { setPlaying(false); onEndedRef.current?.(); } });
    }
    createPlayer();
    return () => { cancelled = true; instance?.destroy(); };
  }, [file]);
  if (!file) return <div className="empty">Select a recording file to play it.</div>;
  return <div className="player"><div className="player-head"><div><strong>{file.name}</strong><small>{new Date(file.modifiedAt).toLocaleString()} · {(file.size / 1048576).toFixed(1)} MB</small></div><div className="actions"><button className="icon primary" disabled={!ready} onClick={() => wave.current?.playPause()}>{playing ? <Pause/> : <Play/>}</button><a className="icon" href={file.url} download><Download/></a></div></div><div ref={container}/></div>;
}
