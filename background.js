// Toggle sidebar when toolbar button is clicked
browser.browserAction.onClicked.addListener(() => {
  browser.sidebarAction.toggle();
});

// Track recently visited tabs
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url &&
      !tab.url.startsWith('about:') &&
      !tab.url.startsWith('moz-extension://') &&
      !tab.url.startsWith('chrome://')) {
    browser.storage.local.get(['recentLinks']).then(result => {
      let recent = result.recentLinks || [];
      const entry = { url: tab.url, title: tab.title || tab.url, visitedAt: Date.now() };
      recent = recent.filter(r => r.url !== tab.url);
      recent.unshift(entry);
      if (recent.length > 30) recent = recent.slice(0, 30);
      browser.storage.local.set({ recentLinks: recent });
    });
  }
});
