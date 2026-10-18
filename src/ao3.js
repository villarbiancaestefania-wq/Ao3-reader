import { Capacitor, CapacitorHttp } from '@capacitor/core';

const UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

/** Saca el ID numérico del fic a partir de un link (o de un número suelto). */
export function parseWorkId(input) {
  const s = String(input || '').trim();
  if (/^\d{3,}$/.test(s)) return s;
  const m = s.match(/works\/(\d+)/i);
  return m ? m[1] : null;
}

async function getHtml(url) {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({
      url,
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.8' },
      responseType: 'text',
      connectTimeout: 30000,
      readTimeout: 60000,
    });
    const h = res.headers || {};
    return {
      status: res.status,
      text: typeof res.data === 'string' ? res.data : String(res.data ?? ''),
      retryAfter: h['Retry-After'] || h['retry-after'] || null,
    };
  }
  try {
    const res = await fetch(url);
    return { status: res.status, text: await res.text(), retryAfter: res.headers.get('retry-after') };
  } catch {
    throw new Error(
      'El navegador bloquea AO3 (CORS). Esto solo funciona dentro de la app instalada en el celular.'
    );
  }
}

/* ---------- limpieza del HTML de los capítulos ---------- */

const ALLOWED = new Set([
  'P', 'EM', 'I', 'STRONG', 'B', 'U', 'S', 'STRIKE', 'DEL', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'UL', 'OL', 'LI', 'SPAN', 'DIV', 'SUB', 'SUP', 'PRE', 'CODE', 'SMALL', 'CENTER',
  'TABLE', 'TBODY', 'THEAD', 'TR', 'TD', 'TH', 'DL', 'DT', 'DD',
]);
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'IMG', 'VIDEO', 'AUDIO', 'SVG', 'NOSCRIPT']);

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function alignClass(n) {
  const a = (n.getAttribute('align') || '').toLowerCase();
  const style = (n.getAttribute('style') || '').toLowerCase();
  if (a === 'center' || /text-align:\s*center/.test(style)) return ' class="ta-c"';
  if (a === 'right' || /text-align:\s*right/.test(style)) return ' class="ta-r"';
  return '';
}

export function sanitize(el) {
  let out = '';
  for (const n of el.childNodes) {
    if (n.nodeType === 3) {
      out += esc(n.nodeValue || '');
    } else if (n.nodeType === 1) {
      const tag = n.tagName.toUpperCase();
      if (tag === 'BR') out += '<br>';
      else if (tag === 'HR') out += '<hr>';
      else if (DROP.has(tag)) continue;
      else if (tag === 'CENTER') out += `<div class="ta-c">${sanitize(n)}</div>`;
      else if (ALLOWED.has(tag)) {
        const t = tag.toLowerCase();
        out += `<${t}${alignClass(n)}>${sanitize(n)}</${t}>`;
      } else out += sanitize(n); // etiqueta desconocida (ej. <a>): se queda solo el texto
    }
  }
  return out;
}

/* ---------- lectura de la página de la obra ---------- */

const clean = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

export function parseWork(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const q = (s, root = doc) => root.querySelector(s);
  const list = (s) => [...doc.querySelectorAll(s)].map(clean).filter(Boolean);

  const wrap = q('#chapters');
  if (!wrap) {
    if (/new_session|registered users|Sign in/i.test(html) && /works/i.test(html)) {
      throw new Error('Este fic es solo para usuarios registrados de AO3, así que no se puede bajar sin iniciar sesión.');
    }
    if (/Just a moment|cf-challenge|Checking your browser/i.test(html)) {
      throw new Error('AO3 está pidiendo una verificación anti-bots. Probá de nuevo en unos minutos.');
    }
    throw new Error('No pude leer la página de ese fic. Revisá el link o probá más tarde.');
  }

  const title = clean(q('h2.title.heading')) || 'Sin título';
  const byline = q('h3.byline.heading');
  const authors = [...(byline?.querySelectorAll('a[rel="author"]') || [])].map(clean);
  const author = authors.length ? authors.join(', ') : clean(byline) || 'Anónimo';

  const chaptersLabel = clean(q('dl.stats dd.chapters')) || '1/1';
  const [pub, tot] = chaptersLabel.split('/');
  const complete = !!tot && tot.trim() !== '?' && pub.trim() === tot.trim();

  const summaryEl = q('.preface.group .summary blockquote.userstuff') || q('.summary blockquote.userstuff');

  const meta = {
    title,
    author,
    fandoms: list('dd.fandom.tags a.tag'),
    rating: clean(q('dd.rating.tags a.tag')),
    warnings: list('dd.warning.tags a.tag'),
    relationships: list('dd.relationship.tags a.tag'),
    characters: list('dd.character.tags a.tag'),
    tags: list('dd.freeform.tags a.tag'),
    language: clean(q('dd.language')),
    words: clean(q('dl.stats dd.words')),
    chaptersLabel,
    complete,
    summaryHtml: summaryEl ? sanitize(summaryEl) : '',
  };

  const stripLandmarks = (node) => {
    const c = node.cloneNode(true);
    c.querySelectorAll('h3.landmark, .landmark').forEach((x) => x.remove());
    return c;
  };

  const chapters = [];
  const chEls = [...wrap.querySelectorAll(':scope > div.chapter')];

  if (chEls.length) {
    chEls.forEach((el, i) => {
      const titleEl = el.querySelector('.chapter.preface .title') || el.querySelector('h3.title');
      const bodyEl = el.querySelector(':scope > div.userstuff') || el.querySelector('div.userstuff');
      const startNotes = el.querySelector('.chapter.preface .notes blockquote.userstuff');
      const endNotes = el.querySelector('.end.notes blockquote.userstuff');
      let body = bodyEl ? sanitize(stripLandmarks(bodyEl)) : '';
      if (startNotes) body = `<div class="note">${sanitize(startNotes)}</div>` + body;
      if (endNotes) body += `<div class="note">${sanitize(endNotes)}</div>`;
      chapters.push({ title: clean(titleEl) || `Capítulo ${i + 1}`, html: body });
    });
  } else {
    const bodyEl = wrap.querySelector(':scope > div.userstuff') || wrap.querySelector('div.userstuff') || wrap;
    const endNotes = doc.querySelector('.end.notes blockquote.userstuff');
    let body = sanitize(stripLandmarks(bodyEl));
    if (endNotes) body += `<div class="note">${sanitize(endNotes)}</div>`;
    chapters.push({ title, html: body });
  }

  return { meta, chapters };
}

/** Descarga el fic completo (todos los capítulos publicados) y lo parsea. */
export async function fetchWork(ao3Id) {
  const url = `https://archiveofourown.org/works/${ao3Id}?view_adult=true&view_full_work=true`;
  const res = await getHtml(url);

  if (res.status === 429 || /Retry later/i.test(res.text.slice(0, 600))) {
    const secs = parseInt(res.retryAfter, 10);
    const when = secs ? ` Probá de nuevo en ${Math.max(1, Math.ceil(secs / 60))} min.` : ' Probá de nuevo en unos minutos.';
    throw new Error('AO3 pidió esperar (límite de pedidos).' + when);
  }
  if (res.status === 404) throw new Error('No encontré ese fic. Puede estar borrado o ser privado.');
  if (res.status >= 400) throw new Error(`AO3 respondió con el error ${res.status}.`);

  return parseWork(res.text);
}
