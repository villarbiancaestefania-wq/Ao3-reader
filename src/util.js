import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { db } from './db.js';

/** Reduce la imagen elegida de la galería a ~480px de ancho (JPEG). */
export async function fileToCover(file) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 480 / bmp.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
}

const toDataURL = (b) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(b);
  });

function dataURLtoBlob(d) {
  const [head, b64] = d.split(',');
  const mime = head.match(/:(.*?);/)[1];
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: mime });
}

export async function exportBackup() {
  const works = await db.works.toArray();
  for (const w of works) if (w.cover) w.cover = await toDataURL(w.cover);
  const data = {
    app: 'biblioteca-ao3',
    version: 1,
    works,
    chapters: await db.chapters.toArray(),
    settings: await db.settings.toArray(),
  };
  const json = JSON.stringify(data);
  const name = `biblioteca-ao3-${new Date().toISOString().slice(0, 10)}.json`;
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: name,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: name, files: [uri], dialogTitle: 'Guardar backup' });
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = name;
    a.click();
  }
}

export async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'biblioteca-ao3') throw new Error('Este archivo no es un backup de la app.');
  for (const w of data.works) if (typeof w.cover === 'string') w.cover = dataURLtoBlob(w.cover);
  await db.transaction('rw', db.works, db.chapters, db.settings, async () => {
    await db.works.bulkPut(data.works);
    await db.chapters.bulkPut(data.chapters);
    await db.settings.bulkPut(data.settings || []);
  });
  return data.works.length;
}
