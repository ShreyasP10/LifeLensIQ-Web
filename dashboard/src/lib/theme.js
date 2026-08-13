const THEME_KEY = 'lifelensiq.theme';

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