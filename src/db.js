import Dexie from 'dexie';

export const db = new Dexie('biblioteca-ao3');

db.version(1).stores({
  works: '++id, ao3Id, title, addedAt, lastReadAt',
  chapters: '[workId+index], workId',
  settings: 'key',
});

export const DEFAULT_SETTINGS = {
  theme: 'light',
  font: 'literata',
  size: 19,
  lineHeight: 1.65,
  margin: 20,
  align: 'left',
  mode: 'scroll',
  sort: 'recent',
};

export async function loadSettings() {
  const row = await db.settings.get('app');
  return { ...DEFAULT_SETTINGS, ...(row?.value || {}) };
}

export async function saveSettings(value) {
  await db.settings.put({ key: 'app', value });
}
