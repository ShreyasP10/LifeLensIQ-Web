(() => {
  const SHORT_RE = /\/shorts\/|\/reel\/|\/reels\//i;
  let lastSent = '';

  function check() {
    const href = location.href;
    if (SHORT_RE.test(href) && href !== lastSent) {
      lastSent = href;
      chrome.runtime.sendMessage({ type: 'short_view', url: href }).catch(() => {});
    }
  }

  check();
  setInterval(check, 1500);
})();
