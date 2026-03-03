
let lastUrl = location.href;

const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    chrome.runtime.sendMessage({
      type: "URL_CHANGED",
      url: location.href
    }).catch(() => {});
  }
});

observer.observe(document.body, { childList: true, subtree: true });