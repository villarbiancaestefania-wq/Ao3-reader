import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { loadSettings, saveSettings } from './db';
import Library from './Library';
import Reader from './Reader';
import { AddSheet, WorkSheet, SettingsSheet } from './Sheets';

export default function App() {
  const [settings, setSettingsState] = useState(null);
  const [readerId, setReaderId] = useState(null);
  const [sheet, setSheet] = useState(null); // { type: 'add' | 'work' | 'settings', id? }
  const [toast, setToast] = useState('');
  const readerBack = useRef(null);
  const toastTimer = useRef(null);

  useEffect(() => { loadSettings().then(setSettingsState); }, []);

  useEffect(() => {
    if (settings) document.documentElement.dataset.theme = settings.theme;
  }, [settings?.theme]);

  const setSettings = useCallback((patch) => {
    setSettingsState((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const showToast = useCallback((t) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const openReader = (id) => { setSheet(null); setReaderId(id); };

  /* botón "atrás" de Android */
  const backRef = useRef(null);
  backRef.current = () => {
    if (sheet) setSheet(null);
    else if (readerId !== null) (readerBack.current ? readerBack.current() : setReaderId(null));
    else CapApp.exitApp();
  };
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handle;
    CapApp.addListener('backButton', () => backRef.current()).then((h) => { handle = h; });
    return () => handle?.remove();
  }, []);

  if (!settings) return null;

  return (
    <>
      <div className="lib-layer" hidden={readerId !== null}>
        <Library
          settings={settings}
          setSettings={setSettings}
          onOpen={openReader}
          onDetails={(id) => setSheet({ type: 'work', id })}
          onAdd={() => setSheet({ type: 'add' })}
          onSettings={() => setSheet({ type: 'settings' })}
        />
      </div>

      {readerId !== null && (
        <Reader key={readerId} workId={readerId} settings={settings} setSettings={setSettings}
          onClose={() => setReaderId(null)} backRef={readerBack} />
      )}

      {sheet?.type === 'add' && (
        <AddSheet
          onClose={() => setSheet(null)}
          onDone={(work, existed) => {
            setSheet(existed ? { type: 'work', id: work.id } : null);
            showToast(existed ? 'Ese fic ya estaba en tu biblioteca' : `Guardado: ${work.title}`);
          }}
        />
      )}
      {sheet?.type === 'work' && (
        <WorkSheet workId={sheet.id} onClose={() => setSheet(null)} onRead={openReader} toast={showToast} />
      )}
      {sheet?.type === 'settings' && (
        <SettingsSheet settings={settings} setSettings={setSettings} onClose={() => setSheet(null)} />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
