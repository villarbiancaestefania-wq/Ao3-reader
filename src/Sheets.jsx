import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, ImagePlus, ImageOff, RefreshCw, Trash2, RotateCcw, Download, Upload } from 'lucide-react';
import Sheet from './Sheet';
import Cover from './Cover';
import { db } from './db';
import { THEMES } from './theme';
import {
  addWorkFromUrl, checkForUpdates, deleteWork, resetProgress, setCoverFromFile, removeCover, exportBackup, importBackup,
} from './lib';

/* ---------- agregar por link ---------- */
export function AddSheet({ onClose, onDone }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');

  const paste = async () => {
    setErr('');
    try {
      let text = '';
      if (Capacitor.isNativePlatform()) text = (await Clipboard.read()).value;
      else text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
      else setErr('El portapapeles está vacío.');
    } catch {
      setErr('No pude leer el portapapeles. Pegá el link a mano en el campo.');
    }
  };

  const submit = async () => {
    setErr('');
    setBusy(true);
    try {
      const { work, existed } = await addWorkFromUrl(url, setStatus);
      onDone(work, existed);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
      setStatus('');
    }
  };

  return (
    <Sheet title="Agregar un fic" onClose={busy ? () => {} : onClose}>
      <p className="muted">Pegá el link del fic, por ejemplo https://archiveofourown.org/works/123456</p>
      <input
        className="field"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Link de AO3"
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        disabled={busy}
      />
      {err && <p className="error">{err}</p>}
      {busy && <p className="muted">{status || 'Trabajando…'} Los fics largos pueden tardar un rato.</p>}
      <div className="row">
        <button className="btn" onClick={paste} disabled={busy}>
          Pegar link
        </button>
        <button className="btn primary grow" onClick={submit} disabled={busy || !url.trim()}>
          {busy ? 'Descargando…' : 'Guardar en la biblioteca'}
        </button>
      </div>
    </Sheet>
  );
}

/* ---------- detalles de un fic ---------- */
export function WorkSheet({ workId, onClose, onRead, toast }) {
  const work = useLiveQuery(() => db.works.get(workId), [workId]);
  const [busy, setBusy] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  if (!work) return null;
  const started = work.lastReadAt > 0;

  const run = async (label, fn) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast(e.message || String(e));
    } finally {
      setBusy('');
    }
  };

  const onPickCover = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) run('Guardando portada…', async () => { await setCoverFromFile(workId, f); toast('Portada actualizada'); });
  };

  const update = () =>
    run('Buscando capítulos nuevos…', async () => {
      const n = await checkForUpdates(workId);
      toast(n > 0 ? `Se agregaron ${n} capítulo${n > 1 ? 's' : ''} nuevo${n > 1 ? 's' : ''}` : 'No hay capítulos nuevos');
    });

  return (
    <Sheet title="Detalles" onClose={onClose}>
      <div className="detail-top">
        <div className="detail-cover"><Cover work={work} size="lg" /></div>
        <div>
          <h3 className="detail-title">{work.title}</h3>
          <p className="muted">{work.author}</p>
          <p className="muted small">
            {[work.words && `${work.words} palabras`, `${work.chapterCount} cap. guardados`, work.chaptersLabel && `(${work.chaptersLabel})`, work.complete ? 'Completo' : 'En curso']
              .filter(Boolean).join(', ')}
          </p>
        </div>
      </div>

      <button className="btn primary wide" onClick={() => onRead(workId)}>
        <BookOpen size={18} /> {started ? 'Continuar leyendo' : 'Empezar a leer'}
      </button>

      {work.fandoms?.length > 0 && <p className="small"><b>Fandom:</b> {work.fandoms.join(', ')}</p>}
      {work.rating && <p className="small"><b>Clasificación:</b> {work.rating}</p>}
      {work.relationships?.length > 0 && <p className="small"><b>Parejas:</b> {work.relationships.slice(0, 6).join(', ')}</p>}
      {work.summaryHtml && <div className="summary" dangerouslySetInnerHTML={{ __html: work.summaryHtml }} />}

      <div className="actions">
        <label className="btn wide">
          <ImagePlus size={18} /> Elegir portada de la galería
          <input type="file" accept="image/*" hidden onChange={onPickCover} />
        </label>
        {work.cover && (
          <button className="btn wide" onClick={() => removeCover(workId)}>
            <ImageOff size={18} /> Quitar portada
          </button>
        )}
        <button className="btn wide" onClick={update} disabled={!!busy}>
          <RefreshCw size={18} /> {busy || 'Buscar capítulos nuevos'}
        </button>
        {started && (
          <button className="btn wide" onClick={() => { resetProgress(workId); toast('Marcado como sin empezar'); }}>
            <RotateCcw size={18} /> Marcar como sin empezar
          </button>
        )}
        {!confirmDel ? (
          <button className="btn wide danger" onClick={() => setConfirmDel(true)}>
            <Trash2 size={18} /> Eliminar de la biblioteca
          </button>
        ) : (
          <button className="btn wide danger solid" onClick={async () => { await deleteWork(workId); onClose(); toast('Fic eliminado'); }}>
            <Trash2 size={18} /> Tocá de nuevo para eliminar
          </button>
        )}
      </div>
    </Sheet>
  );
}

/* ---------- ajustes de la biblioteca ---------- */
export function SettingsSheet({ settings, setSettings, onClose }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setBusy(true);
    setMsg('');
    try { await exportBackup(); setMsg('Copia lista.'); }
    catch (e) { setMsg('No se pudo exportar: ' + (e.message || e)); }
    setBusy(false);
  };

  const doImport = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    try {
      const r = await importBackup(f);
      setMsg(`Se importaron ${r.added} fics${r.skipped ? ` (${r.skipped} ya estaban)` : ''}.`);
    } catch (err) {
      setMsg('Ese archivo no sirve: ' + (err.message || err));
    }
    setBusy(false);
  };

  return (
    <Sheet title="Ajustes" onClose={onClose}>
      <h3 className="sub">Tema</h3>
      <div className="themes">
        {THEMES.map((t) => (
          <button
            key={t.id}
            className={`theme-chip ${settings.theme === t.id ? 'on' : ''}`}
            style={{ background: t.bg, color: t.ink }}
            onClick={() => setSettings({ theme: t.id })}
          >
            {t.name}
          </button>
        ))}
      </div>

      <h3 className="sub">Copia de seguridad</h3>
      <p className="muted small">
        Tus fics viven solo en este celular. Si borrás los datos de la app o cambiás de teléfono, se pierden. Guardá una copia de vez en cuando.
      </p>
      <div className="actions">
        <button className="btn wide" onClick={doExport} disabled={busy}><Download size={18} /> Exportar copia</button>
        <label className={`btn wide ${busy ? 'disabled' : ''}`}>
          <Upload size={18} /> Importar copia
          <input type="file" accept="application/json,.json,text/plain" hidden onChange={doImport} disabled={busy} />
        </label>
      </div>
      {msg && <p className="small">{msg}</p>}
    </Sheet>
  );
}
