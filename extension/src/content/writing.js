(() => {
  const BURST = 12;
  const BURST_COOLDOWN = 30000; // 30 seconds
  let keyCount = 0;
  let windowStart = Date.now();
  let lastBurstTime = 0;

  document.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const now = Date.now();
    if (now - windowStart > 15000) {
      keyCount = 0;
      windowStart = now;
    }
    keyCount += 1;
    if (keyCount >= BURST && now - lastBurstTime >= 30000) {
      keyCount = 0;
      windowStart = now;
      lastBurstTime = now;
      chrome.runtime.sendMessage({ type: 'typing_burst', count: BURST }).catch(() => {});
    }
  });
})();
