chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FETCH") {
    fetch(message.url)
      .then(res => res.json())
      .then(data => sendResponse({ data }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "CHECK_LINK") {
    chrome.storage.local.get(["usedLinks"], (result) => {
      const usedLinks = result.usedLinks || [];
      if (usedLinks.includes(message.link)) {
        sendResponse({ used: true });
      } else {
        usedLinks.push(message.link);
        chrome.storage.local.set({ usedLinks }, () => sendResponse({ used: false }));
      }
    });
    return true;
  }

  if (message.type === "CHECK_KEY") {
    chrome.storage.local.get(["usedKeys"], (result) => {
      const usedKeys = result.usedKeys || [];
      if (usedKeys.includes(message.key)) {
        sendResponse({ used: true });
      } else {
        usedKeys.push(message.key);
        chrome.storage.local.set({ usedKeys }, () => sendResponse({ used: false }));
      }
    });
    return true;
  }
});