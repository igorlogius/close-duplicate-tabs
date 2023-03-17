/* global browser */

const tabdata = new Map();

const delayed_updateBA_timeout = 500;
let delayed_updateBA_timerId;

let dupTabIds = 0;

async function delayed_updateBA() {
  clearTimeout(delayed_updateBA_timerId);
  delayed_updateBA_timerId = setTimeout(async () => {
    updateBA();
  }, delayed_updateBA_timeout);
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
          //return av.lastAccessed - bv.lastAccessed;
          return av.created - bv.created;
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
    browser.browserAction.setBadgeText({text: "" + dupTabIds.length});
    browser.browserAction.setTitle({ title: "Close All " + dupTabIds.length + " Duplicates"});
  } else {
    browser.browserAction.disable();
    browser.browserAction.setTitle({ title: "No Duplicates to Close" });
    browser.browserAction.setBadgeText({ text: "" });
  }
}

// init button + popuplate tabdata cache
(async () => {
  browser.browserAction.disable();
  browser.browserAction.setBadgeText({ text: "" });
  browser.browserAction.setBadgeBackgroundColor({ color: "orange" });
  //browser.browserAction.setBadgeBackgroundColor({ color: "green" });
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
      created: Date.now(),
    });
  });
  delayed_updateBA();
})();

// register listeners

// update cache 
browser.tabs.onUpdated.addListener(
  (tabId, changeInfo, t) => {
    if (typeof changeInfo.url === "string") {
      if(tabdata.has(t.id)){
	      let tmp = tabdata.get(t.id);
	      tmp.url = changeInfo.url;
	      tabdata.set(t.id, tmp);
      }
      delayed_updateBA();
    }
  },
  { properties: ["url"] }
);

// update cache 
browser.tabs.onCreated.addListener((t) => {
  tabdata.set(t.id, {
    url: t.url,
    cs: t.cookieStoreId,
    lastAccessed: t.lastAccessed,
    created: Date.now(),
  });
  delayed_updateBA();
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
  browser.browserAction.setBadgeText({ text: "" });
});
