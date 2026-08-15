const KEY = 'lifelensiq_youtube_focus';

const STYLE_ID = 'lliq-yt-style';
const CSS = `
html.lliq-yt-focus ytd-watch-flexy #secondary,
html.lliq-yt-focus #related,
html.lliq-yt-focus ytd-browse[page-subtype="home"] #contents,
html.lliq-yt-focus ytd-rich-section-renderer {
  display: none !important;
}
html.lliq-yt-focus ytd-watch-flexy #primary {
  max-width: 1280px !important;
}
`;

function apply(on) {
  document.documentElement.classList.toggle('lliq-yt-focus', Boolean(on));
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

let obs = null;

function renderButton(on) {
  const host = document.querySelector('#masthead-container #buttons');
  if (!host) return;
  if (document.getElementById('lliq-yt-btn')) {
    if (obs) obs.disconnect();
    return;
  }
  const btn = document.createElement('button');
  btn.id = 'lliq-yt-btn';
  btn.type = 'button';
  btn.textContent = on ? 'Distraction-free: ON' : 'Distraction-free';
  btn.title = 'Toggle YouTube recommendations, home feed and related videos';
  btn.style.cssText =
    'background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:18px;padding:6px 12px;' +
    'font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;margin-right:8px;';
  btn.addEventListener('click', async () => {
    const next = !document.documentElement.classList.contains('lliq-yt-focus');
    apply(next);
    btn.textContent = next ? 'Distraction-free: ON' : 'Distraction-free';
    const { [KEY]: state } = await chrome.storage.local.get(KEY);
    await chrome.storage.local.set({ [KEY]: { ...(state || {}), on: next } });
  });
  host.prepend(btn);
  if (obs) obs.disconnect();
}

(async () => {
  ensureStyle();
  const { [KEY]: state } = await chrome.storage.local.get(KEY);
  apply(state && state.on);
  renderButton(state && state.on);
  obs = new MutationObserver(() => renderButton(Boolean(state && state.on)));
  obs.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => obs && obs.disconnect(), 30000);
})();