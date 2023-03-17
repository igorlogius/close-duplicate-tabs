/* global browser */

const tabdata = new Map();

let dupTabIds = 0;

async function onBAClicked() {
  delDups();
  browser.browserAction.disable();
  browser.browserAction.setBadgeText({ text: "0" });
  browser.browserAction.setBadgeBackgroundColor({ color: "green" });
}

function getDups() {
  const dups = new Map();
  let done = [];

  for (const [tabId, t0] of tabdata) {
    if (!done.includes(tabId)) {
      done.push(tabId);

      if (dups.has(t0.url)) {
        dups.set(t0.url, []);
      }
      let t0_dups = dups.get(t0.url);

      t0_dups = [...tabdata]
        .filter(
          ([, v]) => t0.url === v.url && t0.cookieStoreId === v.cookieStoreId
        )
        .sort(([, av], [, bv]) => {
          return av.lastAccessed - bv.lastAccessed;
        })
        .map(([k]) => k);

      if (t0_dups.length > 0) {
        done = done.concat(t0_dups);
      }
      dups.set(t0.url, t0_dups);
    }
  }

  let toClose = [];
  for (const [, v] of dups) {
    if (v.length > 1) {
      toClose = toClose.concat(v.slice(1));
    }
  }
  toClose = [...new Set(toClose)];
  return toClose;
}

// delete duplicates 
function delDups() {
  if (dupTabIds.length > 0) {
    browser.tabs.remove(dupTabIds);
  }
}

// 
function updateBA() {
  dupTabIds = getDups();
  if (dupTabIds.length > 0) {
    browser.browserAction.enable();
    browser.browserAction.setBadgeText({
      text: "" + dupTabIds.length,
    });
    browser.browserAction.setTitle({
      title: "Close All " + dupTabIds.length + " Duplicates",
    });
    browser.browserAction.setBadgeBackgroundColor({ color: "orange" });
  } else {
    browser.browserAction.disable();
    browser.browserAction.setTitle({ title: "No Duplicates to Close" });
    browser.browserAction.setBadgeText({ text: "0" });
    browser.browserAction.setBadgeBackgroundColor({ color: "green" });
  }
}

// init button + popuplate tabdata cache
(async () => {
  browser.browserAction.disable();
  browser.browserAction.setBadgeText({ text: "0" });
  browser.browserAction.setBadgeBackgroundColor({ color: "green" });
  browser.browserAction.setTitle({ title: "No Duplicates to Close" });

  (await browser.tabs.query({
      currentWindow: true, 
      hidden: false,
      pinned: false,
    })
  ).forEach((t) => {
    tabdata.set(t.id, {
      url: t.url,
      cs: t.cookieStoreId,
      lastAccessed: t.lastAccessed,
    });
  });
  updateBA();
})();

// register listeners

// update cache 
browser.tabs.onUpdated.addListener(
  (tabId, changeInfo, t) => {
    if (typeof changeInfo.url === "string") {
      tabdata.set(t.id, {
        url: t.url,
        cs: t.cookieStoreId,
        lastAccessed: t.lastAccessed,
      });
    }
    updateBA();
  },
  { properties: ["url"] }
);

// update cache 
browser.tabs.onCreated.addListener((t) => {
  tabdata.set(t.id, {
    url: t.url,
    cs: t.cookieStoreId,
    lastAccessed: t.lastAccessed,
  });
  updateBA();
});

// update the lastAccessed timestamp 
browser.tabs.onActivated.addListener((info) => {
  let tmp = tabdata.get(info.tabId);
  tmp.lastAccessed = Date.now();
  tabdata.set(info.tabId, tmp);
});

// remove tab from cache
browser.tabs.onRemoved.addListener((tabId) => {
  if (tabdata.has(tabId)) {
    tabdata.delete(tabId);
  }
  updateBA();
});

// tigger deletion
browser.browserAction.onClicked.addListener(() => {
  delDups();
  browser.browserAction.disable();
  browser.browserAction.setBadgeText({ text: "0" });
  browser.browserAction.setBadgeBackgroundColor({ color: "green" });
});
