const THEME_KEY = 'lifelensiq.theme';

function syncMetaThemeColor(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#000000');
}

export function getSavedTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  syncMetaThemeColor(theme);
}

export function initTheme() {
  applyTheme(getSavedTheme());
}

export function setTheme(theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private mode etc. */
  }
}

export function toggleTheme() {
  const next = getSavedTheme() === 'light' ? 'dark' : 'light';
  setTheme(next);
  return next;
}

export function isLight() {
  return getSavedTheme() === 'light';
}