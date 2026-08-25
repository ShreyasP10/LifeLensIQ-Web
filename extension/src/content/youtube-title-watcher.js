(() => {
  const SHORT_RE = /\/shorts\/|\/reel\/|\/reels\//i;
  let lastTitle = document.title;

  function checkTitleChange() {
    const currentTitle = document.title;
    if (currentTitle !== lastTitle) {
      lastTitle = currentTitle;
      // Send the new title to background
      if (!SHORT_RE.test(location.href)) {
        chrome.runtime.sendMessage({
          type: 'YOUTUBE_TITLE_CHANGED',
          title: currentTitle,
          url: location.href
        }).catch(() => {});
      }
    }
  }

  // Observe changes to <title> tag
  const titleObserver = new MutationObserver(checkTitleChange);
  const titleElement = document.querySelector('title');
  if (titleElement) {
    titleObserver.observe(titleElement, {
      subtree: true,
      childList: true,
      characterData: true
    });
  }

  // Also check periodically as a fallback
  setInterval(checkTitleChange, 2000);
})();