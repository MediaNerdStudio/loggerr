import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Download, Pause, Play } from 'lucide-react';

export default function AudioPlayer({ file }) {
  const container = useRef(null);
  const wave = useRef(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!file || !container.current) return;
    const instance = WaveSurfer.create({ container: container.current, url: file.url, waveColor: '#314354', progressColor: '#f0a33b', cursorColor: '#fff', height: 72, barWidth: 2, barGap: 2, normalize: true });
    wave.current = instance;
    instance.on('play', () => setPlaying(true));
    instance.on('pause', () => setPlaying(false));
    instance.on('finish', () => setPlaying(false));
    return () => instance.destroy();
  }, [file]);
  if (!file) return <div className="empty">Select a recording file to play it.</div>;
  return <div className="player"><div className="player-head"><div><strong>{file.name}</strong><small>{new Date(file.modifiedAt).toLocaleString()} · {(file.size / 1048576).toFixed(1)} MB</small></div><div className="actions"><button className="icon primary" onClick={() => wave.current?.playPause()}>{playing ? <Pause/> : <Play/>}</button><a className="icon" href={file.url} download><Download/></a></div></div><div ref={container}/></div>;
}
