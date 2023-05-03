/* global browser */

let byCreated = false;

async function getFromStorage(type, id, fallback) {
  let tmp = await browser.storage.local.get(id);
  return typeof tmp[id] === type ? tmp[id] : fallback;
}

const tabdata = new Map();
let delayed_updateBA_timerId = null;
let dupTabIds = [];

async function delayed_updateBA(delay = 700) {
  if (delayed_updateBA_timerId !== null) {
    clearTimeout(delayed_updateBA_timerId);
  }

  /**/
  // disable button while processing
  browser.browserAction.disable();
  browser.browserAction.setBadgeBackgroundColor({ color: "black" });
  browser.browserAction.setBadgeText({ text: "⌛" });
  //browser.browserAction.setBadgeText({ text: "☕" });
  /**/

  delayed_updateBA_timerId = setTimeout(async () => {
    const loading_tabs = await browser.tabs.query({
      hidden: false,
      pinned: false,
      status: "loading",
    });
    if (loading_tabs.length === 0) {
      updateBA();
      delayed_updateBA_timerId = null;
    } else {
      delayed_updateBA();
    }
  }, delay);
}

//
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
          ([, v]) =>
            t0.url === v.url &&
            t0.cookieStoreId === v.cookieStoreId &&
            v.status !== "loading" // exclude loading tabs
        )
        .sort(([, av], [, bv]) => {
          if (byCreated) {
            return av.ts - bv.ts;
          }
          return bv.ts - av.ts;
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

// update browserAction
function updateBA() {
  dupTabIds = getDups();
  if (dupTabIds.length > 0) {
    browser.browserAction.enable();
    browser.browserAction.setBadgeText({ text: "" + dupTabIds.length });
    browser.browserAction.setBadgeBackgroundColor({ color: "orange" });
  } else {
    browser.browserAction.disable();
    browser.browserAction.setBadgeText({ text: "0" });
    browser.browserAction.setBadgeBackgroundColor({ color: "limegreen" });
  }
}

// init browserAction + popuplate tabdata cache
(async () => {
  browser.browserAction.disable();
  browser.browserAction.setBadgeText({ text: "0" });
  browser.browserAction.setBadgeBackgroundColor({ color: "limegreen" });
  (
    await browser.tabs.query({
      hidden: false,
      pinned: false,
    })
  ).forEach((t) => {
    tabdata.set(t.id, {
      status: t.status,
      url: t.url,
      cs: t.cookieStoreId,
      ts: byCreated ? Date.now() : t.lastAccessed,
    });
  });
  delayed_updateBA();
})();

// register listeners

// update cache
browser.tabs.onUpdated.addListener(
  (tabId, changeInfo, t) => {
    if (tabdata.has(t.id)) {
      let tmp = tabdata.get(t.id);
      if (typeof changeInfo.status === "string") {
        tmp.status = changeInfo.status;
      }
      if (typeof changeInfo.url === "string") {
        tmp.url = changeInfo.url;
      }
      tabdata.set(t.id, tmp);
      delayed_updateBA();
    }
  },
  { properties: ["status", "url"] }
);

// update cache
browser.tabs.onCreated.addListener((t) => {
  tabdata.set(t.id, {
    url: t.url,
    cs: t.cookieStoreId,
    ts: Date.now(),
    status: "created",
  });
  delayed_updateBA();
});

// remove tab from cache
browser.tabs.onRemoved.addListener((tabId) => {
  if (tabdata.has(tabId)) {
    tabdata.delete(tabId);
  }
  updateBA();
});

// tigger deletion
browser.browserAction.onClicked.addListener((/*tab, info*/) => {
  // clear action is only available when last update is done
  // not strictly necessary, since we disable the button ... but it doesnt hurt
  if (delayed_updateBA_timerId === null) {
    delDups();
    browser.browserAction.setBadgeText({ text: "0" });
  }
});

browser.tabs.onActivated.addListener((activeInfo) => {
  if (!byCreated && tabdata.has(activeInfo.tabId)) {
    const tmp = tabdata.get(activeInfo.tabId);
    tmp.ts = Date.now();
    tabdata.set(activeInfo.tabId, tmp);
  }
});

browser.storage.onChanged.addListener(async () => {
  byCreated = await getFromStorage("boolean", "keepoldest", false);
});
