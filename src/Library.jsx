import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Search, Settings, Ellipsis } from 'lucide-react';
import { db } from './db';
import Cover from './Cover';

const pct = (w) => {
  const p = w.progress || { chapter: 0, frac: 0 };
  if (!w.lastReadAt) return 0;
  return Math.min(100, Math.round(((p.chapter + p.frac) / Math.max(1, w.chapterCount)) * 100));
};

export default function Library({ settings, setSettings, onOpen, onDetails, onAdd, onSettings }) {
  const works = useLiveQuery(() => db.works.toArray(), []);
  const [q, setQ] = useState('');

  const shown = useMemo(() => {
    if (!works) return [];
    const needle = q.trim().toLowerCase();
    const list = needle
      ? works.filter((w) => `${w.title} ${w.author} ${(w.fandoms || []).join(' ')}`.toLowerCase().includes(needle))
      : [...works];
    const sorts = {
      recent: (a, b) => (b.lastReadAt || b.addedAt) - (a.lastReadAt || a.addedAt),
      added: (a, b) => b.addedAt - a.addedAt,
      title: (a, b) => a.title.localeCompare(b.title),
      author: (a, b) => a.author.localeCompare(b.author),
    };
    return list.sort(sorts[settings.sort] || sorts.recent);
  }, [works, q, settings.sort]);

  return (
    <div className="lib">
      <header className="lib-head">
        <div className="lib-title">
          <div>
            <h1>Mi biblioteca</h1>
            <p className="muted">{works ? `${works.length} ${works.length === 1 ? 'fic guardado' : 'fics guardados'}` : ' '}</p>
          </div>
          <button className="icon" onClick={onSettings} aria-label="Ajustes">
            <Settings size={22} />
          </button>
        </div>

        {works?.length > 0 && (
          <div className="lib-tools">
            <label className="search">
              <Search size={18} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título, autor o fandom" />
            </label>
            <select value={settings.sort} onChange={(e) => setSettings({ sort: e.target.value })} aria-label="Ordenar">
              <option value="recent">Leídos hace poco</option>
              <option value="added">Agregados</option>
              <option value="title">Título</option>
              <option value="author">Autor</option>
            </select>
          </div>
        )}
      </header>

      <main className="lib-scroll">
        {works && works.length === 0 && (
          <div className="empty">
            <h2>Todavía no hay fics</h2>
            <p>Copiá el link de un fic de AO3 y pegalo acá. Se guarda en tu celular y lo podés leer sin conexión.</p>
            <button className="btn primary" onClick={onAdd}>
              Agregar el primer fic
            </button>
          </div>
        )}

        {works && works.length > 0 && shown.length === 0 && <p className="muted center">No hay resultados para “{q}”.</p>}

        <div className="grid">
          {shown.map((w) => {
            const p = pct(w);
            return (
              <article key={w.id} className="card">
                <button className="cover-btn" onClick={() => onOpen(w.id)} aria-label={`Leer ${w.title}`}>
                  <Cover work={w} />
                  {p > 0 && <span className="bar" style={{ width: `${p}%` }} />}
                </button>
                <div className="card-meta">
                  <div className="card-text">
                    <h3>{w.title}</h3>
                    <p className="muted">{w.author}</p>
                    <p className="muted small">{p > 0 ? `${p}% leído` : 'Sin empezar'}</p>
                  </div>
                  <button className="icon sm" onClick={() => onDetails(w.id)} aria-label="Detalles">
                    <Ellipsis size={20} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </main>

      <button className="fab" onClick={onAdd}>
        <Plus size={22} />
        Agregar fic
      </button>
    </div>
  );
}
