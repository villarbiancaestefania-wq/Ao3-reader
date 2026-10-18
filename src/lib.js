import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { db } from './db';
import { fetchWork, parseWorkId } from './ao3';

const metaFrom = (parsed) => ({
  ...parsed.meta,
  chapterCount: parsed.chapters.length,
  chapterTitles: parsed.chapters.map((c) => c.title),
});

export async function addWorkFromUrl(input, onStatus) {
  const ao3Id = parseWorkId(input);
  if (!ao3Id) throw new Error('Ese link no parece ser de un fic de AO3. Tiene que incluir /works/ y un número.');

  const existing = await db.works.where('ao3Id').equals(ao3Id).first();
  if (existing) return { work: existing, existed: true };

  onStatus?.('Descargando el fic…');
  const parsed = await fetchWork(ao3Id);

  onStatus?.('Guardando en tu biblioteca…');
  let id;
  await db.transaction('rw', db.works, db.chapters, async () => {
    id = await db.works.add({
      ao3Id,
      ...metaFrom(parsed),
      cover: null,
      addedAt: Date.now(),
      lastReadAt: 0,
      progress: { chapter: 0, frac: 0 },
    });
    await db.chapters.bulkAdd(parsed.chapters.map((c, i) => ({ workId: id, index: i, title: c.title, html: c.html })));
  });
  return { work: await db.works.get(id), existed: false };
}

/** Busca capítulos nuevos. Devuelve cuántos se agregaron. */
export async function checkForUpdates(workId) {
  const work = await db.works.get(workId);
  if (!work) throw new Error('El fic ya no está en la biblioteca.');
  const parsed = await fetchWork(work.ao3Id);
  const added = parsed.chapters.length - work.chapterCount;

  await db.transaction('rw', db.works, db.chapters, async () => {
    if (added > 0) {
      const fresh = parsed.chapters.slice(work.chapterCount);
      await db.chapters.bulkPut(
        fresh.map((c, i) => ({ workId, index: work.chapterCount + i, title: c.title, html: c.html }))
      );
    }
    const { title, author, fandoms, rating, warnings, relationships, characters, tags, language, words, chaptersLabel, complete, summaryHtml } = parsed.meta;
    await db.works.update(workId, {
      title, author, fandoms, rating, warnings, relationships, characters, tags, language, words, chaptersLabel, complete, summaryHtml,
      chapterCount: Math.max(parsed.chapters.length, work.chapterCount),
      chapterTitles: parsed.chapters.length >= work.chapterCount ? parsed.chapters.map((c) => c.title) : work.chapterTitles,
    });
  });
  return Math.max(0, added);
}

export async function deleteWork(workId) {
  await db.transaction('rw', db.works, db.chapters, async () => {
    await db.chapters.where('workId').equals(workId).delete();
    await db.works.delete(workId);
  });
}

export async function resetProgress(workId) {
  await db.works.update(workId, { progress: { chapter: 0, frac: 0 }, lastReadAt: 0 });
}

/* ---------- portadas ---------- */

async function loadBitmap(file) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* cae al método con <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

export async function setCoverFromFile(workId, file) {
  const bmp = await loadBitmap(file);
  const w = bmp.width || bmp.naturalWidth;
  const h = bmp.height || bmp.naturalHeight;
  const scale = Math.min(1, 480 / w);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
  await db.works.update(workId, { cover: blob });
}

export const removeCover = (workId) => db.works.update(workId, { cover: null });

/* ---------- copia de seguridad ---------- */

const blobToDataUrl = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

export async function exportBackup() {
  const [works, chapters] = await Promise.all([db.works.toArray(), db.chapters.toArray()]);
  const data = {
    app: 'biblioteca-ao3',
    version: 1,
    exportedAt: new Date().toISOString(),
    works: await Promise.all(works.map(async (w) => ({ ...w, cover: w.cover ? await blobToDataUrl(w.cover) : null }))),
    chapters,
  };
  const json = JSON.stringify(data);
  const name = `biblioteca-ao3-${new Date().toISOString().slice(0, 10)}.json`;

  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
    const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
    await Share.share({ title: 'Copia de seguridad', url: uri, dialogTitle: 'Guardar copia de seguridad' });
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = name;
    a.click();
  }
}

export async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'biblioteca-ao3' || !Array.isArray(data.works)) throw new Error('no es una copia de esta app');

  let added = 0;
  let skipped = 0;
  for (const w of data.works) {
    if (await db.works.where('ao3Id').equals(w.ao3Id).first()) {
      skipped++;
      continue;
    }
    const oldId = w.id;
    const { id, ...rest } = w;
    const cover = rest.cover ? await (await fetch(rest.cover)).blob() : null;
    const newId = await db.works.add({ ...rest, cover });
    const chs = data.chapters.filter((c) => c.workId === oldId).map((c) => ({ ...c, workId: newId }));
    await db.chapters.bulkPut(chs);
    added++;
  }
  return { added, skipped };
}
