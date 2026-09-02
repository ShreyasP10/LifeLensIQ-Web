const el = (id) => document.getElementById(id);

function fmtElapsed(startTs) {
  if (!startTs) return '—';
  const sec = Math.max(0, Math.round((Date.now() - startTs) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

const params = new URLSearchParams(location.search);
const domain = (params.get('domain') || '').replace(/^www\./, '');
el('blocked-domain').textContent = domain || 'this site';

async function refreshFocus() {
  const res = await chrome.runtime.sendMessage({ type: 'getFocusState' }).catch(() => null);
  const heading = document.querySelector('h1');
  if (!res || !res.active) {
    el('stop-btn').textContent = 'Focus is off — back to browsing';
    if (heading) heading.textContent = 'Focus mode is off';
  } else {
    el('stop-btn').textContent = 'Stop focus mode';
    if (heading) heading.textContent = 'Focus mode is on';
  }
  el('focus-start').textContent = res && res.startTs ? new Date(res.startTs).toLocaleTimeString() : '—';
  el('focus-elapsed').textContent = fmtElapsed(res ? res.startTs : 0);
}

async function allowDomain() {
  const input = el('allow-input').value.trim().toLowerCase().replace(/^www\./, '');
  const target = input || domain;
  if (!target) return;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'getFocusState' }).catch(() => null);
    const list = (res && res.allowlist) || [];
    if (!list.includes(target)) list.push(target);
    await chrome.runtime.sendMessage({ type: 'startFocus', allowlist: list });
    el('msg').classList.remove('hidden');
    el('msg').textContent = `${target} added to allowlist. Redirecting...`;
    // Navigate to the allowed domain (original blocked or input)
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const tab = tabs[0];
      if (tab && tab.url) chrome.tabs.update(tab.id, { url: `https://${target}` }).catch(() => {
        el('msg').textContent = 'Could not navigate to the domain. Check your connection.';
      });
    });
  } catch (err) {
    el('msg').classList.remove('hidden');
    el('msg').textContent = 'Failed to update allowlist: ' + err.message;
  }
}

el('allow-btn').addEventListener('click', allowDomain);
el('allow-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') allowDomain();
});
el('stop-btn').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'stopFocus' }).catch(() => {});
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && tab.url.startsWith(chrome.runtime.getURL('')) && domain) {
    chrome.tabs.update(tab.id, { url: `https://${domain}` }).catch(() => {});
  }
  el('msg').classList.remove('hidden');
  el('msg').textContent = 'Focus mode stopped. This tab will return you to the site.';
});

refreshFocus();
setInterval(refreshFocus, 1000);