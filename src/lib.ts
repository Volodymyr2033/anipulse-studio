export type Anime = { id: number; title: string; titleEn: string; desc: string; episodes: number; score: string; poster: string };
export type Ep = { n: number; name: string; q: Record<string, string> };
export type Resolved = { mode: 'hls'; eps: Ep[] } | { mode: 'kinobox' };
export type Status = 'watching' | 'planned' | 'done' | 'loved';
export type QItem = { key: string; anime: Anime; ep: Ep; quality: string; progress: number; status: 'queued' | 'active' | 'paused' | 'error' };
export type Saved = { key: string; anime: Anime; ep: Ep; quality: string; size: number };
export type Hist = { key: string; anime: Anime; ep: number; time: number; at: number };
export type DB = { fav: { anime: Anime; status: Status }[]; queue: QItem[]; saved: Saved[]; hist: Hist[] };

const SH = 'https://shikimori.one';
const AL = 'https://anilibria.top/api/v1';
const mapSh = (a: any): Anime => ({ id: a.id, title: a.russian || a.name, titleEn: a.name, desc: (a.description || '').replace(/\[[^\]]*\]/g, ''),
  episodes: a.episodes || a.episodes_aired || 0, score: a.score, poster: SH + a.image.original });
const mapJ = (a: any): Anime => ({ id: a.mal_id, title: a.title_english || a.title, titleEn: a.title, desc: a.synopsis || '',
  episodes: a.episodes || 0, score: String(a.score ?? ''), poster: a.images?.jpg?.large_image_url || '' });

export async function loadById(id: number): Promise<Anime> {
  try { const r = await fetch(`${SH}/api/animes/${id}`); if (!r.ok) throw 0; return mapSh(await r.json()); }
  catch { return mapJ((await (await fetch(`https://api.jikan.moe/v4/anime/${id}`)).json()).data); }
}
export async function findAnime(q: string): Promise<Anime> {
  const m = q.match(/shikimori\.one\/animes\/[a-z]?(\d+)/) || q.match(/myanimelist\.net\/anime\/(\d+)/);
  if (m) return loadById(+m[1]);
  try { const l = await (await fetch(`${SH}/api/animes?search=${encodeURIComponent(q)}&limit=1`)).json(); if (l[0]) return loadById(l[0].id); } catch { /* fallback */ }
  const j = await (await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=1`)).json();
  if (!j.data?.[0]) throw new Error('not found');
  return mapJ(j.data[0]);
}

const norm = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9а-яё]/g, '');
/** Level 1: AniLibria HLS only if the title matches exactly. Level 2: Kinobox by shikimoriId. Never another anime's stream. */
export async function resolve(a: Anime): Promise<Resolved> {
  try {
    const l = await (await fetch(`${AL}/app/search/releases?query=${encodeURIComponent(a.titleEn || a.title)}`)).json();
    const names = new Set([a.title, a.titleEn].map(norm));
    const hit = (Array.isArray(l) ? l : l.data || []).find((r: any) => names.has(norm(r.name?.main)) || names.has(norm(r.name?.english)));
    if (hit) {
      let eps = hit.episodes;
      if (!eps?.length) eps = (await (await fetch(`${AL}/anime/releases/${hit.id}`)).json()).episodes;
      const out: Ep[] = (eps || []).filter((e: any) => e.hls_1080 || e.hls_720 || e.hls_480).map((e: any) => ({
        n: e.ordinal, name: e.name || `Серия ${e.ordinal}`, q: { '1080': e.hls_1080, '720': e.hls_720, '480': e.hls_480 } }));
      if (out.length) return { mode: 'hls', eps: out };
    }
  } catch { /* fallback */ }
  return { mode: 'kinobox' };
}

const idb = () => new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('anipulse', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export const putBlob = async (k: string, b: Blob) => { const d = await idb(); return new Promise<void>((res, rej) => {
  const t = d.transaction('f', 'readwrite'); t.objectStore('f').put(b, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); };
export const getBlob = async (k: string) => { const d = await idb(); return new Promise<Blob | undefined>((res, rej) => {
  const r = d.transaction('f').objectStore('f').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); };
export const delBlob = async (k: string) => { const d = await idb(); return new Promise<void>((res) => {
  const t = d.transaction('f', 'readwrite'); t.objectStore('f').delete(k); t.oncomplete = () => res(); }); };

export async function dl(url: string, onP: (p: number) => void, sig: AbortSignal): Promise<Blob> {
  let base = url, txt = await (await fetch(url, { signal: sig })).text();
  if (txt.includes('#EXT-X-STREAM-INF')) {
    const v = txt.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'))!;
    base = new URL(v, url).href; txt = await (await fetch(base, { signal: sig })).text();
  }
  const segs = txt.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => new URL(l, base).href);
  const parts: Blob[] = [];
  for (let i = 0; i < segs.length; i++) { parts.push(await (await fetch(segs[i], { signal: sig })).blob()); onP((i + 1) / segs.length); }
  return new Blob(parts, { type: 'video/mp2t' });
}
