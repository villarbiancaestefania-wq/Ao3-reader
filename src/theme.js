export const THEMES = [
  { id: 'light', name: 'Claro', bg: '#F5F1F8', ink: '#251C33' },
  { id: 'sepia', name: 'Sepia', bg: '#EDE0C8', ink: '#3A2E22' },
  { id: 'dark', name: 'Oscuro', bg: '#181320', ink: '#DDD6E8' },
  { id: 'black', name: 'Negro', bg: '#000000', ink: '#BDB6C8' },
];

export const FONTS = [
  { id: 'literata', name: 'Literata', css: "'Literata Variable', Georgia, serif" },
  { id: 'lora', name: 'Lora', css: "'Lora Variable', Georgia, serif" },
  { id: 'atkinson', name: 'Atkinson', css: "'Atkinson Hyperlegible', system-ui, sans-serif" },
  { id: 'sistema', name: 'Georgia', css: "Georgia, 'Times New Roman', serif" },
];

export const fontCss = (id) => (FONTS.find((f) => f.id === id) || FONTS[0]).css;
