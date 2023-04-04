/* global browser */

/*
const manifest = browser.runtime.getManifest();
const extname = manifest.name;
*/

const tabdata = new Map();
let delayed_updateBA_timerId = null;
let dupTabIds = [];

async function delayed_updateBA(delay = 700) {
  if (delayed_updateBA_timerId !== null) {
    clearTimeout(delayed_updateBA_timerId);
  }

  /* 
    this might be more correct ... but the flashing is annoying 
    browser.browserAction.disable();
    browser.browserAction.setTitle({ title: "working" });
    browser.browserAction.setBadgeText({ text: "" });
    */

  delayed_updateBA_timerId = setTimeout(async () => {
    updateBA();
    delayed_updateBA_timerId = null;
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
          //return av.created - bv.created;
          return bv.created - av.created;
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
  } else {
    browser.browserAction.disable();
    browser.browserAction.setBadgeText({ text: "" });
  }
}

// init browserAction + popuplate tabdata cache
(async () => {
  browser.browserAction.disable();
  browser.browserAction.setBadgeText({ text: "" });
  browser.browserAction.setBadgeBackgroundColor({ color: "orange" });

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
      created: Date.now(),
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
    created: Date.now(),
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
browser.browserAction.onClicked.addListener((tab, info) => {
  // clear action is only available when last update is done
  if (delayed_updateBA_timerId === null) {
    delDups();
    browser.browserAction.disable();
    browser.browserAction.setBadgeText({ text: "" });
  }
});

browser.tabs.onActivated.addListener((activeInfo) => {
  if (tabdata.has(tabId)) {
    const tmp = tabdata.get(activeInfo.id);
    tmp.created = Date.now();
    tabdata.set(t.id, tmp);
  }
});
