export type Anime = { id: number; title: string; titleEn: string; desc: string; episodes: number; score: string; poster: string };
export type Ep = { n: number; name: string; q: Record<string, string> };
export type Voice = { id: string; name: string; eps: Ep[] };
export type Resolved = { mode: 'hls'; voices: Voice[] } | { mode: 'kinobox' };
export type Status = 'watching' | 'planned' | 'done' | 'loved';
export type QItem = { key: string; anime: Anime; ep: Ep; voice: string; quality: string; progress: number; status: 'queued' | 'active' | 'paused' | 'error' };
export type Saved = { key: string; anime: Anime; ep: Ep; voice: string; quality: string; size: number };
export type Hist = { key: string; anime: Anime; ep: number; time: number; at: number };
export type DB = { fav: { anime: Anime; status: Status }[]; queue: QItem[]; saved: Saved[]; hist: Hist[] };

const SH = 'https://shikimori.one';
const JK = 'https://api.jikan.moe/v4';
const AL = 'https://anilibria.top/api/v1';
const AV = (import.meta.env.VITE_ANIMEVOST_API as string | undefined) || 'https://api.animevost.org/v1';
const NF = 'NOT_FOUND';
const MSG_NF = 'Такое аниме не найдено. Проверьте название или вставьте ссылку на Shikimori / MyAnimeList.';
const MSG_NET = 'Каталоги не отвечают (сеть или блокировка браузера). Выберите тайтл кнопкой ниже или повторите позже.';

/* ---------- сеть: любой запрос с жёстким таймаутом, включая чтение тела ---------- */
async function tget<T>(url: string, read: (r: Response) => Promise<T>, ms = 7000, outer?: AbortSignal, init?: RequestInit): Promise<T> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  const onAbort = () => ac.abort();
  outer?.addEventListener('abort', onAbort);
  try {
    const r = await fetch(url, { ...init, signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await read(r);
  } finally { clearTimeout(t); outer?.removeEventListener('abort', onAbort); }
}
const jget = (url: string, ms = 7000) => tget<any>(url, (r) => r.json(), ms);
const firstOk = <T>(ps: Promise<T>[]): Promise<T> => new Promise((res, rej) => {
  const errs: Error[] = [];
  ps.forEach((p) => p.then(res, (e) => { errs.push(e as Error); if (errs.length === ps.length) rej(errs); }));
});
const fail = (errs: Error[]) => new Error(errs.every((e) => e.message === NF) ? MSG_NF : MSG_NET);

/* ---------- локальный словарь популярных тайтлов (без сети) ---------- */
type Local = Anime & { alt: string[] };
const P = (p: string) => `https://cdn.myanimelist.net/images/anime/${p}.jpg`;
const L = (id: number, title: string, titleEn: string, poster: string, episodes: number, desc: string, alt: string[] = []): Local =>
  ({ id, title, titleEn, poster: P(poster), episodes, desc, score: '', alt });
export const LOCAL: Local[] = [
  L(44511, 'Человек-бензопила', 'Chainsaw Man', '1806/126216', 12, 'Дэнджи — нищий парень, который вместе с демоном-псом Почтой становится охотником на демонов и получает силу бензопилы.', ['Chainsaw Man', 'Chensou Man']),
  L(37430, 'О моём перерождении в слизь', 'Tensei shitara Slime Datta Ken', '1694/93337', 24, 'Обычный клерк погибает и возрождается в магическом мире слизью с уникальными способностями, постепенно собирая вокруг себя целое государство.', ['That Time I Got Reincarnated as a Slime', 'Tensura']),
  L(40748, 'Магическая битва', 'Jujutsu Kaisen', '1171/109222', 24, 'Старшеклассник Юдзи Итадори проглатывает проклятый палец и вступает в школу магов, чтобы сражаться с проклятиями.', ['Jujutsu Kaisen']),
  L(34572, 'Чёрный клевер', 'Black Clover', '2/88336', 170, 'Аста, рождённый без магии в мире магов, мечтает стать Королём магов и осваивает антимагию.', ['Black Clover']),
  L(38000, 'Клинок, рассекающий демонов', 'Kimetsu no Yaiba', '1286/99889', 26, 'Тандзиро становится истребителем демонов, чтобы вернуть человеческий облик сестре Нэдзуко.', ['Demon Slayer', 'Kimetsu no Yaiba', 'Клинок']),
  L(52991, 'Провожающая в последний путь Фрирен', 'Sousou no Frieren', '1015/138006', 28, 'Эльфийка-волшебница Фрирен после смерти товарищей по отряду героя отправляется в путешествие, чтобы лучше понять людей.', ["Frieren: Beyond Journey's End", 'Frieren', 'Фрирен']),
  L(52299, 'Поднятие уровня в одиночку', 'Ore dake Level Up na Ken', '1801/142390', 12, 'Самый слабый охотник Сон Джин-У получает уникальную систему прокачки и начинает стремительно расти в силе.', ['Solo Leveling', 'Соло левелинг']),
  L(54492, 'Монолог фармацевта', 'Kusuriya no Hitorigoto', '1708/138033', 24, 'Мао-Мао, дочь аптекаря, попадает во дворец и применяет знания о ядах и лекарствах, раскрывая дворцовые загадки.', ['The Apothecary Diaries', 'Apothecary Diaries']),
  L(16498, 'Атака титанов', 'Shingeki no Kyojin', '10/47347', 25, 'Человечество прячется за стенами от гигантских титанов, а Эрен Йегер клянётся уничтожить их всех.', ['Attack on Titan', 'Shingeki no Kyojin']),
  L(6702, 'Хвост Феи', 'Fairy Tail', '5/18179', 175, 'Люси вступает в самую шумную гильдию магов Фиоре и отправляется в приключения вместе с Нацу и Хэппи.', ['Fairy Tail']),
  L(21, 'Ван-Пис', 'One Piece', '6/73245', 0, 'Монки Д. Луффи собирает команду пиратов Соломенной Шляпы и отправляется на поиски легендарного сокровища One Piece.', ['One Piece', 'Ван Пис']),
];
const norm = (s?: string) => (s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-z0-9а-я]/g, '');
const strip = ({ alt, ...a }: Local): Anime => { void alt; return a; };
const localById = (id: number) => LOCAL.find((x) => x.id === id);
function localSearch(q: string): Anime | undefined {
  const nq = norm(q);
  if (nq.length < 3) return undefined;
  const hit = LOCAL.find((x) => [x.title, x.titleEn, ...x.alt].some((n) => { const k = norm(n); return k === nq || k.includes(nq); }));
  return hit && strip(hit);
}

/* ---------- каталоги: Shikimori + Jikan (MyAnimeList) ---------- */
const mapSh = (a: any): Anime => ({ id: a.id, title: a.russian || a.name, titleEn: a.name, desc: (a.description || '').replace(/\[[^\]]*\]/g, ''),
  episodes: a.episodes || a.episodes_aired || 0, score: a.score || '', poster: SH + a.image.original });
const mapJ = (a: any): Anime => ({ id: a.mal_id, title: a.title_english || a.title, titleEn: a.title, desc: a.synopsis || '',
  episodes: a.episodes || 0, score: String(a.score ?? ''), poster: a.images?.jpg?.large_image_url || '' });

const shiDetail = async (id: number) => mapSh(await jget(`${SH}/api/animes/${id}`));
const jikDetail = async (id: number) => mapJ((await jget(`${JK}/anime/${id}`)).data);
const shiSearch = async (q: string) => {
  const l = await jget(`${SH}/api/animes?search=${encodeURIComponent(q)}&limit=1`);
  if (!l?.[0]) throw new Error(NF);
  try { return await shiDetail(l[0].id); } catch { return mapSh(l[0]); }
};
const jikSearch = async (q: string) => {
  const j = await jget(`${JK}/anime?q=${encodeURIComponent(q)}&limit=1`);
  if (!j?.data?.[0]) throw new Error(NF);
  return mapJ(j.data[0]);
};

export async function loadById(id: number): Promise<Anime> {
  const l = localById(id);
  if (l) return strip(l); // мгновенно, без сети
  try { return await firstOk([shiDetail(id), jikDetail(id)]); } catch (e) { throw fail(e as Error[]); }
}

/** Разбор ссылок: Shikimori / MyAnimeList → id; YummyAnime, AnimeGO, AnimeVost и др. → название из slug. */
function fromUrl(s: string): { id?: number; title?: string } | null {
  if (!/^https?:\/\//i.test(s)) return null;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  const h = u.hostname.replace(/^www\./, ''), p = decodeURIComponent(u.pathname);
  if (/shikimori\.(one|me|io)$/.test(h)) { const m = p.match(/\/animes\/[a-z]?(\d+)/); if (m) return { id: +m[1] }; }
  if (h.endsWith('myanimelist.net')) { const m = p.match(/\/anime\/(\d+)/); if (m) return { id: +m[1] }; }
  const slug = p.split('/').filter(Boolean).pop() || '';
  const title = slug.replace(/\.html?$/i, '').replace(/^\d+-/, '').replace(/-\d+$/, '').replace(/[-_]+/g, ' ').trim();
  return title ? { title } : null;
}

export async function findAnime(input: string): Promise<Anime> {
  const q0 = input.trim();
  const u = fromUrl(q0);
  if (u?.id) return loadById(u.id);
  const q = u?.title || q0;
  const l = localSearch(q);
  if (l) return l;
  const srcs = [() => shiSearch(q), () => jikSearch(q)];
  if (/[а-яё]/i.test(q)) { // Jikan не понимает кириллицу — по очереди, Shikimori первым
    const errs: Error[] = [];
    for (const s of srcs) { try { return await s(); } catch (e) { errs.push(e as Error); } }
    throw fail(errs);
  }
  try { return await firstOk(srcs.map((s) => s())); } catch (e) { throw fail(e as Error[]); }
}

/* ---------- каскадный резолвер: AniLibria + AnimeVost (озвучки) → Kinobox только как крайний резерв ---------- */
const https = (u: string) => u.replace(/^http:/, 'https:');
type Ok = (s?: string) => boolean;

async function aniLibria(a: Anime, ok: Ok): Promise<Voice | null> {
  for (const q of new Set([a.titleEn, a.title].filter(Boolean))) {
    const l = await jget(`${AL}/app/search/releases?query=${encodeURIComponent(q)}`);
    const hit = (Array.isArray(l) ? l : l?.data || []).find((r: any) => ok(r.name?.main) || ok(r.name?.english));
    if (!hit) continue;
    let eps = hit.episodes;
    if (!eps?.length) eps = (await jget(`${AL}/anime/releases/${hit.id}`)).episodes;
    const out: Ep[] = (eps || []).filter((e: any) => e.hls_1080 || e.hls_720 || e.hls_480).map((e: any) => ({
      n: e.ordinal, name: e.name || `Серия ${e.ordinal}`, q: { '1080': e.hls_1080, '720': e.hls_720, '480': e.hls_480 } }));
    if (out.length) return { id: 'anilibria', name: 'AniLibria', eps: out };
  }
  return null;
}

// AnimeVost: POST /search (name) и POST /playlist (id) → прямые mp4: std = 480p, hd = 720p.
async function aniVost(a: Anime, ok: Ok): Promise<Voice | null> {
  const post = (path: string, body: Record<string, string>) =>
    tget<any>(`${AV}${path}`, (r) => r.json(), 7000, undefined, { method: 'POST', body: new URLSearchParams(body) });
  for (const q of new Set([a.title, a.titleEn].filter(Boolean))) {
    const j = await post('/search', { name: q });
    const hit = (j?.data || []).find((r: any) => String(r.title || '').replace(/\[.*?\]/g, '').split('/').some(ok));
    if (!hit) continue;
    const pl = await post('/playlist', { id: String(hit.id) });
    const out: Ep[] = (Array.isArray(pl) ? pl : []).filter((e: any) => e.hd || e.std).map((e: any, i: number) => ({
      n: +(String(e.name).match(/\d+/)?.[0] || i + 1), name: String(e.name),
      q: { ...(e.hd && { '720': https(e.hd) }), ...(e.std && { '480': https(e.std) }) } }));
    if (out.length) return { id: 'animevost', name: 'AnimeVost', eps: out };
  }
  return null;
}

export async function resolve(a: Anime): Promise<Resolved> {
  const names = new Set([a.title, a.titleEn, ...(localById(a.id)?.alt || [])].map(norm).filter(Boolean));
  const ok: Ok = (s) => { const n = norm(s); return !!n && names.has(n); };
  // источники опрашиваются параллельно и независимо: сбой одного (CORS/таймаут) не мешает другому
  const r = await Promise.allSettled([aniLibria(a, ok), aniVost(a, ok)]);
  const voices = r.flatMap((x) => (x.status === 'fulfilled' && x.value ? [x.value] : []));
  return voices.length ? { mode: 'hls', voices } : { mode: 'kinobox' };
}

/* ---------- IndexedDB ---------- */
const idb = () => new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('anipulse', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export const putBlob = async (k: string, b: Blob) => { const d = await idb(); return new Promise<void>((res, rej) => {
  const t = d.transaction('f', 'readwrite'); t.objectStore('f').put(b, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); };
export const getBlob = async (k: string) => { const d = await idb(); return new Promise<Blob | undefined>((res, rej) => {
  const r = d.transaction('f').objectStore('f').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); };
export const delBlob = async (k: string) => { const d = await idb(); return new Promise<void>((res) => {
  const t = d.transaction('f', 'readwrite'); t.objectStore('f').delete(k); t.oncomplete = () => res(); }); };

/* ---------- загрузка HLS (таймаут 30 с на плейлист и каждый сегмент) ---------- */
export async function dl(url: string, onP: (p: number) => void, sig: AbortSignal): Promise<Blob> {
  const T = 30000;
  if (!/\.m3u8/i.test(url)) { // прямой mp4 (AnimeVost): потоковое чтение с прогрессом
    return tget(url, async (r) => {
      const total = +(r.headers.get('content-length') || 0), rd = r.body?.getReader();
      if (!rd) return new Blob([await r.blob()], { type: 'video/mp4' });
      const parts: BlobPart[] = []; let got = 0;
      for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; if (total) onP(got / total); }
      return new Blob(parts, { type: 'video/mp4' });
    }, 900000, sig);
  }
  let base = url, txt = await tget(url, (r) => r.text(), T, sig);
  if (txt.includes('#EXT-X-STREAM-INF')) {
    const v = txt.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'))!;
    base = new URL(v, url).href; txt = await tget(base, (r) => r.text(), T, sig);
  }
  const segs = txt.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => new URL(l, base).href);
  const parts: Blob[] = [];
  for (let i = 0; i < segs.length; i++) { parts.push(await tget(segs[i], (r) => r.blob(), T, sig)); onP((i + 1) / segs.length); }
  return new Blob(parts, { type: 'video/mp2t' });
}
