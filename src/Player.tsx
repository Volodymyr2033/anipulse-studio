import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Play, Pause, SkipBack, SkipForward, FastForward, Volume2, VolumeX, Captions, Maximize, Download } from 'lucide-react';
import type { Ep } from './lib';

type P = { ep: Ep; start: number; onTime: (t: number) => void; onNav: (d: number) => void; onDl: () => void };
const fmt = (s: number) => { s = Math.floor(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };

export default function Player({ ep, start, onTime, onNav, onDl }: P) {
  const wrap = useRef<HTMLDivElement>(null), v = useRef<HTMLVideoElement>(null), tm = useRef<number>(), resume = useRef(start), last = useRef(0);
  const [playing, setPlaying] = useState(false), [cur, setCur] = useState(0), [dur, setDur] = useState(0), [vol, setVol] = useState(1);
  const [muted, setMuted] = useState(false), [q, setQ] = useState('1080'), [rate, setRate] = useState(1), [subs, setSubs] = useState(false), [show, setShow] = useState(true);
  const src = ep.q[q] || ep.q['720'] || ep.q['480'];

  useEffect(() => { resume.current = start; }, [ep.n, start]);
  useEffect(() => {
    const el = v.current!; let h: Hls | undefined;
    const go = () => { if (resume.current > 1) el.currentTime = resume.current; resume.current = 0; el.play().catch(() => {}); };
    if (Hls.isSupported()) { h = new Hls(); h.loadSource(src); h.attachMedia(el); h.on(Hls.Events.MANIFEST_PARSED, go); }
    else { el.src = src; el.onloadedmetadata = go; }
    return () => h?.destroy();
  }, [src]);
  useEffect(() => { const tt = v.current?.textTracks; if (tt) for (let i = 0; i < tt.length; i++) tt[i].mode = subs ? 'showing' : 'disabled'; }, [subs, src, dur]);
  useEffect(() => { if (v.current) v.current.playbackRate = rate; }, [rate, src]);

  const toggle = () => { const el = v.current!; if (el.paused) el.play().catch(() => {}); else el.pause(); };
  const seek = (d: number) => { const el = v.current!; el.currentTime = Math.max(0, Math.min(el.duration || 1e9, el.currentTime + d)); };
  const fs = () => { const w = wrap.current as any; if (document.fullscreenElement) document.exitFullscreen(); else (w.requestFullscreen || w.webkitRequestFullscreen).call(w); };
  const mute = () => { const el = v.current!; el.muted = !el.muted; setMuted(el.muted); };
  const poke = () => { setShow(true); clearTimeout(tm.current); tm.current = window.setTimeout(() => setShow(false), 1500); };
  const pickQ = (x: string) => { resume.current = v.current?.currentTime || 0; setQ(x); };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
      const key = e.key.toLowerCase();
      if (e.code === 'Space') { e.preventDefault(); toggle(); } else if (key === 'arrowleft') seek(-10); else if (key === 'arrowright') seek(10);
      else if (key === 'm') mute(); else if (key === 'f') fs(); else if (key === 's') seek(80); else return;
      poke();
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  const visible = show || !playing;
  const B = 'p-2 rounded-lg hover:bg-white/15 transition';
  return (
    <div ref={wrap} onMouseMove={poke} onMouseLeave={() => { clearTimeout(tm.current); if (playing) setShow(false); }}
      className={`relative aspect-video w-full max-w-5xl mx-auto rounded-2xl overflow-hidden bg-black shadow-2xl ${visible ? '' : 'cursor-none'}`}>
      <video ref={v} playsInline onClick={toggle} className="absolute inset-0 w-full h-full object-contain"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onVolumeChange={(e) => { setVol(e.currentTarget.volume); setMuted(e.currentTarget.muted); }}
        onTimeUpdate={(e) => { const x = e.currentTarget.currentTime; setCur(x); if (Math.abs(x - last.current) > 5) { last.current = x; onTime(x); } }} />
      <div className={`absolute inset-x-0 bottom-0 px-4 pb-3 pt-10 bg-gradient-to-t from-black/90 to-transparent transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <input type="range" min={0} max={dur || 0} step={1} value={cur} onChange={(e) => (v.current!.currentTime = +e.target.value)} className="w-full" aria-label="Таймлайн" />
        <div className="flex items-center gap-1 text-sm flex-wrap">
          <button className={B} onClick={() => onNav(-1)} title="Предыдущая серия"><SkipBack size={18} /></button>
          <button className={B} onClick={toggle} title="Пауза / Смотреть">{playing ? <Pause size={22} /> : <Play size={22} />}</button>
          <button className={B} onClick={() => onNav(1)} title="Следующая серия"><SkipForward size={18} /></button>
          <button className={B} onClick={mute} title="Звук (M)">{muted || vol === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
          <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : vol} className="w-20" aria-label="Громкость"
            onChange={(e) => { v.current!.volume = +e.target.value; v.current!.muted = false; }} />
          <span className="tabular-nums mx-2 text-slate-300">{fmt(cur)} / {fmt(dur)}</span>
          <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-fuchsia-500/20 text-fuchsia-300 hover:bg-fuchsia-500/30" onClick={() => seek(80)}>
            <FastForward size={16} /> Пропустить опенинг (+80с)</button>
          <span className="flex-1" />
          <button className={`${B} flex items-center gap-1 ${subs ? 'text-cyan2' : ''}`} onClick={() => setSubs(!subs)}><Captions size={18} />{subs ? 'Вкл' : 'Выкл'}</button>
          <select value={q} onChange={(e) => pickQ(e.target.value)} className="bg-transparent border border-white/20 rounded-lg px-1 py-1">
            <option className="bg-ink" value="1080">1080p Full HD</option><option className="bg-ink" value="720">720p</option><option className="bg-ink" value="480">480p</option></select>
          <select value={rate} onChange={(e) => setRate(+e.target.value)} className="bg-transparent border border-white/20 rounded-lg px-1 py-1">
            {[0.75, 1, 1.25, 1.5, 2].map((r) => <option className="bg-ink" key={r} value={r}>{r.toFixed(2).replace(/0$/, '')}x</option>)}</select>
          <button className={B} onClick={onDl} title="Скачать"><Download size={18} /></button>
          <button className={B} onClick={fs} title="Во весь экран (F)"><Maximize size={18} /></button>
        </div>
      </div>
    </div>
  );
}
