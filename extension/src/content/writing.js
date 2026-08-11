(() => {
  const BURST = 12;
  let keyCount = 0;
  let windowStart = Date.now();

  document.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const now = Date.now();
    if (now - windowStart > 15000) {
      keyCount = 0;
      windowStart = now;
    }
    keyCount += 1;
    if (keyCount >= BURST) {
      keyCount = 0;
      windowStart = now;
      chrome.runtime.sendMessage({ type: 'typing_burst', count: BURST }).catch(() => {});
    }
  });
})();
