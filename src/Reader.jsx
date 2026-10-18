import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, List, Type, Minus, Plus } from 'lucide-react';
import { db } from './db';
import Sheet from './Sheet';
import { FONTS, THEMES, fontCss } from './theme';

export default function Reader({ workId, settings, setSettings, onClose, backRef }) {
  const [work, setWork] = useState(null);
  const [cur, setCur] = useState(0);
  const [html, setHtml] = useState(null);
  const [ui, setUi] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [frac, setFrac] = useState(0);
  const [pageInfo, setPageInfo] = useState({ page: 0, pages: 1 });
  const [hint, setHint] = useState('');

  const scroller = useRef(null);
  const pos = useRef({ ready: false, chapter: 0, frac: 0 });
  const saveTimer = useRef(null);
  const wantEnd = useRef(false);
  const paged = settings.mode === 'paged';
  const m = settings.margin;

  /* ----- guardar posición ----- */
  const flushSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    const p = pos.current;
    if (!p.ready) return;
    db.works.update(workId, { progress: { chapter: p.chapter, frac: p.frac }, lastReadAt: Date.now() });
  }, [workId]);

  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, 600);
  }, [flushSave]);

  useEffect(() => {
    const onHide = () => document.hidden && flushSave();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flushSave();
    };
  }, [flushSave]);

  /* ----- cargar el fic y retomar donde quedó ----- */
  useEffect(() => {
    let alive = true;
    db.works.get(workId).then((w) => {
      if (!alive || !w) return;
      const p = w.progress || { chapter: 0, frac: 0 };
      const ch = Math.max(0, Math.min(p.chapter, w.chapterCount - 1));
      pos.current = { ready: true, chapter: ch, frac: ch === p.chapter ? p.frac : 0 };
      setWork(w);
      setCur(ch);
    });
    return () => { alive = false; };
  }, [workId]);

  useEffect(() => {
    if (!work) return;
    let alive = true;
    db.chapters.get([workId, cur]).then((c) => alive && setHtml(c?.html || '<p>(Este capítulo está vacío)</p>'));
    return () => { alive = false; };
  }, [work, cur, workId]);

  /* ----- medir la pantalla ----- */
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ----- colocar la posición guardada (y re-colocarla si cambia el estilo) ----- */
  useEffect(() => {
    const el = scroller.current;
    if (!el || html === null || !box.w) return;
    let cancelled = false;
    (async () => {
      await document.fonts?.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (cancelled) return;
      const f = wantEnd.current ? 1 : pos.current.frac;
      wantEnd.current = false;
      if (paged) {
        const W = el.clientWidth;
        const pages = Math.max(1, Math.round(el.scrollWidth / W));
        const page = Math.round(f * (pages - 1));
        el.scrollLeft = page * W;
        pos.current.frac = pages > 1 ? page / (pages - 1) : 0;
        setPageInfo({ page, pages });
      } else {
        const max = el.scrollHeight - el.clientHeight;
        el.scrollTop = f * max;
        pos.current.frac = max > 0 ? el.scrollTop / max : 0;
      }
      setFrac(pos.current.frac);
    })();
    return () => { cancelled = true; };
  }, [html, box.w, box.h, paged, settings.font, settings.size, settings.lineHeight, settings.margin, settings.align]);

  /* ----- navegación ----- */
  const goChapter = (i, end = false) => {
    if (!work) return;
    if (i < 0) return flash('Es el principio del fic');
    if (i >= work.chapterCount) return flash('Es el último capítulo guardado');
    flushSave();
    wantEnd.current = end;
    pos.current = { ready: true, chapter: i, frac: end ? 1 : 0 };
    setHtml(null);
    setFrac(end ? 1 : 0);
    setCur(i);
    setSheet(null);
  };

  const flash = (t) => {
    setHint(t);
    setTimeout(() => setHint(''), 1800);
  };

  const pageMetrics = () => {
    const el = scroller.current;
    const W = el.clientWidth;
    return { el, W, pages: Math.max(1, Math.round(el.scrollWidth / W)), page: Math.round(el.scrollLeft / W) };
  };

  const gotoPage = (p) => {
    const { el, W, pages } = pageMetrics();
    const page = Math.max(0, Math.min(pages - 1, p));
    el.scrollTo({ left: page * W });
    const f = pages > 1 ? page / (pages - 1) : 0;
    pos.current.frac = f;
    setFrac(f);
    setPageInfo({ page, pages });
    scheduleSave();
  };

  const next = () => {
    if (!paged) return goChapter(cur + 1);
    const { page, pages } = pageMetrics();
    page < pages - 1 ? gotoPage(page + 1) : goChapter(cur + 1);
  };
  const prev = () => {
    if (!paged) return goChapter(cur - 1, true);
    const { page } = pageMetrics();
    page > 0 ? gotoPage(page - 1) : goChapter(cur - 1, true);
  };

  const onScroll = () => {
    if (paged) return;
    const el = scroller.current;
    const max = el.scrollHeight - el.clientHeight;
    const f = max > 0 ? el.scrollTop / max : 0;
    pos.current.frac = f;
    setFrac(f);
    scheduleSave();
  };

  const onTap = (e) => {
    if (window.getSelection()?.toString()) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (paged && x < 0.28) return prev();
    if (paged && x > 0.72) return next();
    setUi((u) => !u);
  };

  const seek = (v) => {
    const f = v / 1000;
    if (paged) {
      const { pages } = pageMetrics();
      gotoPage(Math.round(f * (pages - 1)));
    } else {
      const el = scroller.current;
      el.scrollTop = f * (el.scrollHeight - el.clientHeight);
    }
  };

  /* ----- botón "atrás" de Android ----- */
  useEffect(() => {
    backRef.current = () => (sheet ? setSheet(null) : onClose());
    return () => { backRef.current = null; };
  });

  const title = work?.chapterTitles?.[cur] || '';
  const overall = work ? Math.min(100, Math.round(((cur + frac) / work.chapterCount) * 100)) : 0;

  const vars = {
    '--r-font': fontCss(settings.font),
    '--r-size': `${settings.size}px`,
    '--r-lh': settings.lineHeight,
    '--r-align': settings.align,
  };

  const content = (
    <>
      <h2 className="chtitle">{title}</h2>
      <div className="body" dangerouslySetInnerHTML={{ __html: html || '' }} />
    </>
  );

  return (
    <div className="reader" style={vars}>
      <div className={`rbar top ${ui ? '' : 'off'}`}>
        <button className="icon" onClick={onClose} aria-label="Volver a la biblioteca"><ArrowLeft size={22} /></button>
        <div className="rtitles">
          <strong>{work?.title}</strong>
          <span>{title}</span>
        </div>
        <button className="icon" onClick={() => setSheet('chapters')} aria-label="Capítulos"><List size={22} /></button>
        <button className="icon" onClick={() => setSheet('style')} aria-label="Estilo de lectura"><Type size={22} /></button>
      </div>

      <div ref={scroller} className={`scroller ${paged ? 'paged-mode' : 'flow-mode'}`} onScroll={onScroll} onClick={onTap}>
        {html !== null && !paged && (
          <div className="flow prose" style={{ padding: `64px ${m}px 140px` }}>
            {content}
            <div className="foot" onClick={(e) => e.stopPropagation()}>
              {work && cur < work.chapterCount - 1 ? (
                <button className="btn primary" onClick={() => goChapter(cur + 1)}>Siguiente capítulo</button>
              ) : (
                <p>Llegaste al último capítulo guardado.</p>
              )}
            </div>
          </div>
        )}
        {html !== null && paged && box.w > 0 && (
          <div
            className="paged prose"
            style={{ height: box.h, columnWidth: `${Math.max(120, box.w - 2 * m)}px`, columnGap: `${2 * m}px`, padding: `34px ${m}px 44px` }}
          >
            {content}
          </div>
        )}
      </div>

      {hint && <div className="hint">{hint}</div>}

      <div className={`rbar bottom ${ui ? '' : 'off'}`}>
        <input
          type="range" min="0" max="1000" value={Math.round(frac * 1000)}
          onChange={(e) => seek(Number(e.target.value))} aria-label="Posición en el capítulo"
        />
        <div className="rinfo">
          <button className="link" onClick={() => goChapter(cur - 1)} disabled={cur === 0}>Anterior</button>
          <span>
            Cap. {cur + 1} de {work?.chapterCount || 1}, {overall}% del fic
            {paged ? `, pág. ${pageInfo.page + 1}/${pageInfo.pages}` : ''}
          </span>
          <button className="link" onClick={() => goChapter(cur + 1)} disabled={!work || cur >= work.chapterCount - 1}>Siguiente</button>
        </div>
      </div>

      {sheet === 'chapters' && work && (
        <Sheet title="Capítulos" onClose={() => setSheet(null)}>
          <ul className="chlist">
            {work.chapterTitles.map((t, i) => (
              <li key={i}>
                <button className={i === cur ? 'on' : ''} onClick={() => goChapter(i)}>{t}</button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      {sheet === 'style' && (
        <Sheet title="Estilo de lectura" onClose={() => setSheet(null)}>
          <h3 className="sub">Tema</h3>
          <div className="themes">
            {THEMES.map((t) => (
              <button key={t.id} className={`theme-chip ${settings.theme === t.id ? 'on' : ''}`}
                style={{ background: t.bg, color: t.ink }} onClick={() => setSettings({ theme: t.id })}>{t.name}</button>
            ))}
          </div>

          <h3 className="sub">Letra</h3>
          <div className="fonts">
            {FONTS.map((f) => (
              <button key={f.id} className={`font-chip ${settings.font === f.id ? 'on' : ''}`}
                style={{ fontFamily: f.css }} onClick={() => setSettings({ font: f.id })}>{f.name}</button>
            ))}
          </div>

          <div className="stepper">
            <span>Tamaño</span>
            <button className="icon sm" onClick={() => setSettings({ size: Math.max(13, settings.size - 1) })} aria-label="Más chico"><Minus size={18} /></button>
            <b>{settings.size}</b>
            <button className="icon sm" onClick={() => setSettings({ size: Math.min(34, settings.size + 1) })} aria-label="Más grande"><Plus size={18} /></button>
          </div>

          <label className="slider">
            <span>Interlineado</span>
            <input type="range" min="1.2" max="2.3" step="0.05" value={settings.lineHeight}
              onChange={(e) => setSettings({ lineHeight: Number(e.target.value) })} />
          </label>
          <label className="slider">
            <span>Márgenes</span>
            <input type="range" min="8" max="48" step="2" value={settings.margin}
              onChange={(e) => setSettings({ margin: Number(e.target.value) })} />
          </label>

          <h3 className="sub">Texto</h3>
          <div className="seg">
            <button className={settings.align === 'left' ? 'on' : ''} onClick={() => setSettings({ align: 'left' })}>Alineado a la izquierda</button>
            <button className={settings.align === 'justify' ? 'on' : ''} onClick={() => setSettings({ align: 'justify' })}>Justificado</button>
          </div>

          <h3 className="sub">Cómo pasar de página</h3>
          <div className="seg">
            <button className={!paged ? 'on' : ''} onClick={() => setSettings({ mode: 'scroll' })}>Deslizar</button>
            <button className={paged ? 'on' : ''} onClick={() => setSettings({ mode: 'paged' })}>Páginas</button>
          </div>
          {paged && <p className="muted small">Tocá el borde izquierdo o derecho de la pantalla para cambiar de página. El centro muestra u oculta los controles.</p>}
        </Sheet>
      )}
    </div>
  );
}
