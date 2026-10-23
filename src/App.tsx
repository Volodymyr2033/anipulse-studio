import { useEffect, useRef, useState } from 'react';
import { Search, Play, Heart, Download, Pause, Trash2, Upload, Save, X } from 'lucide-react';
import Player from './Player';
import { Anime, DB, Ep, Hist, Resolved, Status, delBlob, dl, findAnime, getBlob, loadById, putBlob, resolve } from './lib';

const CHIPS: [string, number][] = [['Человек-бензопила', 44511], ['О моем перерождении в слизь', 37430], ['Магическая битва', 40748], ['Черный клевер', 34572],
  ['Клинок, рассекающий демонов', 38000], ['Провожающая в последний путь Фрирен', 52991], ['Соло левелинг', 52299], ['Монолог фармацевта', 54492],
  ['Атака титанов', 16498], ['Хвост Феи', 6702], ['Ван-Пис', 21]];
const TABS = ['Поиск и Главная', 'Плеер', 'Избранное', 'Очередь загрузок', 'Сохраненное', 'История'];
const STAT: Record<Status, string> = { watching: 'Смотрю', planned: 'В планах', done: 'Просмотрено', loved: 'Любимое' };
type Ctx = { a: Anime; eps: Ep[] | null; n: number; start: number };

const empty = (): DB => ({ fav: [], queue: [], saved: [], hist: [] });
const load = (): DB => { try { const d = { ...empty(), ...JSON.parse(localStorage.getItem('ap_db') || '{}') } as DB;
  d.queue = d.queue.map((x) => (x.status === 'active' ? { ...x, status: 'queued' } : x)); return d; } catch { return empty(); } };
const group = <T extends { anime: Anime }>(l: T[]) => { const m = new Map<number, T[]>(); l.forEach((x) => m.set(x.anime.id, [...(m.get(x.anime.id) || []), x])); return [...m.values()]; };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const Img = ({ src, c }: { src: string; c: string }) => <img src={src} referrerPolicy="no-referrer" className={c} alt="" />;
const Btn = ({ c = '', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { c?: string }) =>
  <button {...p} className={`px-4 py-2 rounded-xl text-sm font-medium transition disabled:opacity-40 ${c || 'bg-white/10 hover:bg-white/20'}`} />;
const PRIMARY = 'bg-fuchsia-500 hover:bg-fuchsia-400 text-white';

function Kino({ a }: { a: Anime }) {
  useEffect(() => {
    const w = window as any;
    const init = () => new w.Kinobox('.kinobox_player', { search: { title: a.title } }).init();
    if (w.Kinobox) init(); else { const s = document.createElement('script'); s.src = 'https://kinobox.tv/kinobox.min.js'; s.onload = init; document.body.appendChild(s); }
    return () => { const el = document.querySelector('.kinobox_player'); if (el) el.innerHTML = ''; };
  }, [a.id, a.title]);
  return <div className="kinobox_player aspect-video w-full max-w-5xl mx-auto rounded-2xl overflow-hidden bg-black shadow-2xl" />;
}

export default function App() {
  const [tab, setTab] = useState(0), [db, setDb] = useState<DB>(load), [anime, setAnime] = useState<Anime | null>(null), [res, setRes] = useState<Resolved | null>(null);
  const [q, setQ] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [play, setPlay] = useState<Ctx | null>(null);
  const [folder, setFolder] = useState<number | null>(null), [quality, setQuality] = useState('1080'), [epN, setEpN] = useState(1);
  const [favSt, setFavSt] = useState<Status>('planned'), [filt, setFilt] = useState<Status | 'all'>('all');
  const running = useRef<string | null>(null), ctrls = useRef(new Map<string, AbortController>());

  useEffect(() => { localStorage.setItem('ap_db', JSON.stringify(db)); }, [db]);
  const upd = (key: string, patch: object) => setDb((d) => ({ ...d, queue: d.queue.map((x) => (x.key === key ? { ...x, ...patch } : x)) }));

  // Download worker: one task at a time; tasks of the same anime are adjacent, so titles never interleave.
  useEffect(() => {
    const t = db.queue.find((x) => x.status === 'active') || db.queue.find((x) => x.status === 'queued');
    if (!t || running.current === t.key) return;
    running.current = t.key; const ac = new AbortController(); ctrls.current.set(t.key, ac); upd(t.key, { status: 'active' });
    const url = t.ep.q[t.quality] || t.ep.q['720'] || t.ep.q['480'];
    dl(url, (p) => upd(t.key, { progress: p }), ac.signal)
      .then(async (b) => { await putBlob(t.key, b); setDb((d) => ({ ...d, queue: d.queue.filter((x) => x.key !== t.key),
        saved: [...d.saved, { key: t.key, anime: t.anime, ep: t.ep, quality: t.quality, size: b.size }] })); })
      .catch(() => { if (!ac.signal.aborted) upd(t.key, { status: 'error' }); })
      .finally(() => { if (running.current === t.key) running.current = null; ctrls.current.delete(t.key); });
  }, [db.queue]);

  const open = async (p: Promise<Anime>) => {
    setBusy(true); setErr('');
    let a: Anime;
    try { a = await p; } catch (e) { setErr(e instanceof Error ? e.message : 'Не удалось загрузить данные.'); setBusy(false); return; }
    setAnime(a); setRes(null); setEpN(1); setBusy(false); // карточка показывается сразу, поток подбирается в фоне
    setRes(await resolve(a));
  };
  const go = (a: Anime, eps: Ep[] | null, n: number, start = 0) => { setPlay({ a, eps, n, start }); setTab(1); };
  const enqueue = (a: Anime, eps: Ep[]) => setDb((d) => { const queue = [...d.queue];
    for (const ep of eps) { const key = `${a.id}:${ep.n}`; if (queue.some((x) => x.key === key) || d.saved.some((x) => x.key === key)) continue;
      const item = { key, anime: a, ep, quality, progress: 0, status: 'queued' as const }; const i = queue.map((x) => x.anime.id).lastIndexOf(a.id);
      if (i < 0) queue.push(item); else queue.splice(i + 1, 0, item); }
    return { ...d, queue }; });
  const pauseQ = (k: string) => { upd(k, { status: 'paused' }); ctrls.current.get(k)?.abort(); };
  const dropQ = (k: string) => { ctrls.current.get(k)?.abort(); setDb((d) => ({ ...d, queue: d.queue.filter((x) => x.key !== k) })); };
  const fromHist = async (h: Hist) => { const r = await resolve(h.anime); go(h.anime, r.mode === 'hls' ? r.eps : null, h.ep, h.time); };
  const addFav = (a: Anime) => setDb((d) => ({ ...d, fav: [...d.fav.filter((f) => f.anime.id !== a.id), { anime: a, status: favSt }] }));
  const saveFile = async (s: DB['saved'][number]) => { const b = await getBlob(s.key); if (!b) return alert('Файл не найден в хранилище');
    const u = URL.createObjectURL(b), l = document.createElement('a'); l.href = u; l.download = `${s.anime.titleEn} - ${s.ep.n}.ts`; l.click(); URL.revokeObjectURL(u); };
  const delSaved = async (k: string) => { await delBlob(k); setDb((d) => ({ ...d, saved: d.saved.filter((x) => x.key !== k) })); };
  const backup = () => { const u = URL.createObjectURL(new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' }));
    const l = document.createElement('a'); l.href = u; l.download = 'anipulse-backup.json'; l.click(); URL.revokeObjectURL(u); };
  const restore = async (f?: File) => { if (!f) return; try { setDb({ ...empty(), ...JSON.parse(await f.text()) }); } catch { alert('Некорректный файл бэкапа'); } };

  const eps = res?.mode === 'hls' ? res.eps : [], cur = eps.find((e) => e.n === epN) || eps[0];
  const counts = [null, null, db.fav.length, db.queue.length, db.saved.length, db.hist.length];
  const ep = play?.eps?.find((e) => e.n === play.n) || play?.eps?.[0];

  return (
    <div className="min-h-screen pb-16">
      <header className="sticky top-0 z-20 bg-ink/90 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 font-bold text-lg">
            <svg width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="#e879f9" strokeWidth="2.4" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 6px #e879f9)' }}>
              <path d="M5 24V6l7 6h8l7-6v18c0 3-5 5-11 5S5 27 5 24z" /></svg>AniPulse Studio</div>
          <nav className="flex gap-1 overflow-x-auto">{TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)} className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${tab === i ? 'bg-fuchsia-500/25 text-fuchsia-200' : 'text-slate-400 hover:bg-white/10'}`}>
              {t}{counts[i] !== null && ` (${counts[i]})`}</button>))}</nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
        {tab === 0 && <>
          <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) open(findAnime(q.trim())); }} className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название аниме или ссылка (Shikimori / MyAnimeList)"
              className="flex-1 bg-white/5 border border-white/15 rounded-xl px-4 py-3 outline-none focus:border-fuchsia-400" />
            <Btn c={PRIMARY} type="submit"><Search size={18} className="inline mr-1" />Найти</Btn></form>
          <div className="flex flex-wrap gap-2">{CHIPS.map(([l, id]) => <button key={id} onClick={() => open(loadById(id))} className="px-3 py-1.5 rounded-full text-sm bg-white/5 border border-white/10 hover:border-cyan2 hover:text-cyan2">{l}</button>)}</div>
          {busy && <p className="text-slate-400">Ищу аниме…</p>}{err && <p className="text-rose-400">{err}</p>}
          {anime && !busy && (
            <section className="grid md:grid-cols-[220px_1fr] gap-6 bg-white/5 border border-white/10 rounded-2xl p-5">
              <Img src={anime.poster} c="w-full rounded-xl aspect-[2/3] object-cover bg-black/40" />
              <div className="space-y-4">
                <div><h2 className="text-2xl font-bold">{anime.title}</h2><p className="text-slate-400">{anime.titleEn} · {anime.episodes || '?'} эп.{anime.score && ` · ★ ${anime.score}`}</p></div>
                <p className="text-slate-300 text-sm max-h-32 overflow-y-auto">{anime.desc}</p>
                {!res && <p className="text-cyan2 text-sm">Подбираю поток…</p>}
                {res?.mode === 'hls' && <>
                  <div className="flex gap-2 flex-wrap">
                    <select value={cur?.n} onChange={(e) => setEpN(+e.target.value)} className="bg-ink border border-white/20 rounded-lg px-2 py-1.5 max-w-xs">{eps.map((e) => <option key={e.n} value={e.n}>{e.n}. {e.name}</option>)}</select>
                    <select value={quality} onChange={(e) => setQuality(e.target.value)} className="bg-ink border border-white/20 rounded-lg px-2 py-1.5">
                      <option value="1080">1080p Full HD</option><option value="720">720p</option><option value="480">480p</option></select></div>
                  <div className="flex flex-wrap gap-1.5">{eps.slice(0, 24).map((e) => <button key={e.n} onClick={() => setEpN(e.n)}
                    className={`w-9 h-9 rounded-lg text-sm ${cur?.n === e.n ? 'bg-fuchsia-500' : 'bg-white/10 hover:bg-white/20'}`}>{e.n}</button>)}</div></>}
                {res?.mode === 'kinobox' && <p className="text-sm text-slate-400">Серии и озвучки (AniLibria, StudioBand, SHIZA, Дубляж) выбираются внутри плеера. Скачивание для этого тайтла недоступно.</p>}
                <div className="flex flex-wrap gap-2 items-center">
                  {res?.mode === 'hls' && cur && <><Btn c={PRIMARY} onClick={() => go(anime, eps, cur.n)}><Play size={16} className="inline mr-1" />Смотреть серию {cur.n}</Btn>
                    <Btn onClick={() => enqueue(anime, [cur])}><Download size={16} className="inline mr-1" />Скачать серию {cur.n}</Btn>
                    <Btn onClick={() => enqueue(anime, eps)}>Скачать весь сезон</Btn></>}
                  {res?.mode === 'kinobox' && <Btn c={PRIMARY} onClick={() => go(anime, null, 1)}><Play size={16} className="inline mr-1" />Смотреть</Btn>}
                  <select value={favSt} onChange={(e) => setFavSt(e.target.value as Status)} className="bg-ink border border-white/20 rounded-lg px-2 py-2 text-sm">
                    {(Object.keys(STAT) as Status[]).map((s) => <option key={s} value={s}>{STAT[s]}</option>)}</select>
                  <Btn onClick={() => addFav(anime)}><Heart size={16} className="inline mr-1" />В избранное</Btn></div>
              </div>
            </section>)}
        </>}

        {tab === 1 && (!play ? <p className="text-slate-400">Выберите аниме на главной и нажмите «Смотреть».</p> : <>
          <h2 className="text-center font-semibold">{play.a.title}{play.eps && ` — серия ${play.n}`}</h2>
          {play.eps && ep ? <Player key={`${play.a.id}:${ep.n}`} ep={ep} start={play.start}
            onTime={(t) => setDb((d) => ({ ...d, hist: [{ key: `${play.a.id}:${ep.n}`, anime: play.a, ep: ep.n, time: t, at: Date.now() }, ...d.hist.filter((h) => h.key !== `${play.a.id}:${ep.n}`)] }))}
            onNav={(dir) => { const l = play.eps!, n = l[l.findIndex((e) => e.n === ep.n) + dir]; if (n) go(play.a, l, n.n); }}
            onDl={() => enqueue(play.a, [ep])} /> : <Kino a={play.a} />}</>)}

        {tab === 2 && <>
          <div className="flex gap-2 flex-wrap">{(['all', 'watching', 'planned', 'done', 'loved'] as const).map((s) => <Btn key={s} c={filt === s ? PRIMARY : ''} onClick={() => setFilt(s)}>{s === 'all' ? 'Все' : STAT[s]}</Btn>)}</div>
          {db.fav.length === 0 && <p className="text-slate-400">Пока пусто. Добавьте аниме из карточки на главной.</p>}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4">{db.fav.filter((f) => filt === 'all' || f.status === filt).map((f) => (
            <div key={f.anime.id} className="space-y-1">
              <button onClick={() => { setTab(0); open(loadById(f.anime.id)); }} className="block w-full"><Img src={f.anime.poster} c="w-full aspect-[2/3] object-cover rounded-xl" /></button>
              <p className="text-sm line-clamp-2">{f.anime.title}</p>
              <div className="flex gap-1"><select value={f.status} onChange={(e) => setDb((d) => ({ ...d, fav: d.fav.map((x) => (x.anime.id === f.anime.id ? { ...x, status: e.target.value as Status } : x)) }))}
                className="flex-1 bg-ink border border-white/20 rounded-lg text-xs px-1">{(Object.keys(STAT) as Status[]).map((s) => <option key={s} value={s}>{STAT[s]}</option>)}</select>
                <button onClick={() => setDb((d) => ({ ...d, fav: d.fav.filter((x) => x.anime.id !== f.anime.id) }))} className="p-1.5 rounded-lg bg-white/10"><X size={14} /></button></div></div>))}</div></>}

        {tab === 3 && (db.queue.length === 0 ? <p className="text-slate-400">Активных загрузок нет.</p> : group(db.queue).map((g) => (
          <div key={g[0].anime.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-3"><Img src={g[0].anime.poster} c="w-10 h-14 object-cover rounded" /><b>{g[0].anime.title}</b></div>
            {g.map((t) => <div key={t.key} className="flex items-center gap-3 text-sm"><span className="w-20">Серия {t.ep.n}</span>
              <div className="flex-1 h-2 bg-white/10 rounded"><div className="h-2 rounded bg-fuchsia-500" style={{ width: `${t.progress * 100}%` }} /></div>
              <span className="w-24 text-slate-400">{t.status === 'error' ? 'ошибка' : t.status === 'paused' ? 'пауза' : t.status === 'queued' ? 'в очереди' : `${Math.round(t.progress * 100)}%`}</span>
              {t.status === 'active' ? <button onClick={() => pauseQ(t.key)}><Pause size={16} /></button> : <button onClick={() => upd(t.key, { status: 'queued' })}><Play size={16} /></button>}
              <button onClick={() => dropQ(t.key)}><X size={16} /></button></div>)}</div>)))}

        {tab === 4 && <>
          <div className="flex gap-2"><Btn onClick={backup}><Save size={16} className="inline mr-1" />Локальный бэкап (.json)</Btn>
            <label className="px-4 py-2 rounded-xl text-sm font-medium bg-white/10 hover:bg-white/20 cursor-pointer"><Upload size={16} className="inline mr-1" />Восстановить
              <input type="file" accept=".json" hidden onChange={(e) => restore(e.target.files?.[0])} /></label></div>
          {folder === null ? (db.saved.length === 0 ? <p className="text-slate-400">Скачанных серий пока нет.</p> :
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4">{group(db.saved).map((g) => (
              <button key={g[0].anime.id} onClick={() => setFolder(g[0].anime.id)} className="text-left space-y-1">
                <Img src={g[0].anime.poster} c="w-full aspect-[2/3] object-cover rounded-xl border-2 border-fuchsia-500/40" />
                <p className="text-sm line-clamp-2">{g[0].anime.title}</p><p className="text-xs text-slate-400">Серий сохранено: {g.length}</p></button>))}</div>)
            : (() => { const l = db.saved.filter((s) => s.anime.id === folder).sort((a, b) => a.ep.n - b.ep.n); if (!l.length) { setFolder(null); return null; }
              const eplist = l.map((s) => s.ep);
              return <div className="space-y-3"><div className="flex items-center gap-3"><Btn onClick={() => setFolder(null)}>← Папки</Btn><b>{l[0].anime.title}</b>
                <Btn c={PRIMARY} onClick={() => go(l[0].anime, eplist, eplist[0].n)}>Смотреть плейлист подряд</Btn></div>
                {l.map((s) => <div key={s.key} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-2 text-sm"><span className="flex-1">Серия {s.ep.n} · {s.quality}p · {(s.size / 1048576).toFixed(0)} МБ</span>
                  <Btn onClick={() => go(s.anime, eplist, s.ep.n)}>Смотреть</Btn><Btn onClick={() => saveFile(s)}>Скачать файл на диск (.ts)</Btn>
                  <button onClick={() => delSaved(s.key)}><Trash2 size={16} /></button></div>)}</div>; })()}</>}

        {tab === 5 && (db.hist.length === 0 ? <p className="text-slate-400">История просмотров пуста.</p> : db.hist.map((h) => (
          <div key={h.key} className="flex items-center gap-3 bg-white/5 rounded-xl p-3"><Img src={h.anime.poster} c="w-12 h-16 object-cover rounded" />
            <div className="flex-1"><p className="font-medium">{h.anime.title}</p><p className="text-sm text-slate-400">Серия {h.ep} · остановились на {mmss(h.time)}</p></div>
            <Btn c={PRIMARY} onClick={() => fromHist(h)}>Продолжить с {mmss(h.time)}</Btn></div>)))}
      </main>
    </div>
  );
}
