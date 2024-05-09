/* global browser */

let byCreated = false;
let ignorehighlighted = false;

let manually_ignored_tabIds = new Set();

async function getFromStorage(type, id, fallback) {
  let tmp = await browser.storage.local.get(id);
  return typeof tmp[id] === type ? tmp[id] : fallback;
}

async function setToStorage(id, value) {
  let obj = {};
  obj[id] = value;
  return browser.storage.local.set(obj);
}

const tabdata = new Map();
let delayed_updateBA_timerId = null;
let dupTabIds = [];

async function delayed_updateBA(delay = 700) {
  if (delayed_updateBA_timerId !== null) {
    clearTimeout(delayed_updateBA_timerId);
  }

  // disable button while processing
  browser.browserAction.disable();

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
    if (done.includes(tabId) || manually_ignored_tabIds.has(tabId)) {
      continue;
    } else {
      done.push(tabId);
    }

    if (!dups.has(t0.cs + t0.url)) {
      dups.set(t0.cs + t0.url, []);
    }
    let t0_dups = dups.get(t0.cs + t0.url);

    for (const [vtabId, v] of tabdata) {
      if (
        vtabId !== tabId &&
        t0.url === v.url &&
        t0.cs === v.cs &&
        t0.status !== "loading" &&
        !manually_ignored_tabIds.has(vtabId)
      ) {
        t0_dups.push(v);
      }
    }

    if (t0_dups.length > 0) {
      t0_dups = t0_dups
        .sort((av, bv) => {
          if (byCreated) {
            return av.ts - bv.ts;
          }
          return bv.ts - av.ts;
        })
        .map((e) => e.id);

      done = done.concat(t0_dups);
    }
    dups.set(t0.cs + t0.url, t0_dups);
  }

  let toClose = [];
  for (const [, v] of dups) {
    toClose = toClose.concat(v);
  }
  toClose = new Set(toClose);

  // remove active Tab

  return [...toClose];
}

// delete duplicates
async function delDups() {
  if (dupTabIds.length > 0) {
    let activeTabId = (
      await browser.tabs.query({
        active: true,
        currentWindow: true,
      })
    )[0].id;
    dupTabIds = dupTabIds.filter((el) => {
      return el !== activeTabId;
    });
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

async function syncMemory() {
  byCreated = await getFromStorage("boolean", "keepoldest", false);

  browser.menus.create({
    title: "Keep older tabs",
    contexts: ["browser_action"],
    type: "checkbox",
    checked: byCreated,
    onclick: (info) => {
      setToStorage("keepoldest", info.checked);
      byCreated = info.checked;
    },
  });
}

// init browserAction, load/sync local vars + populate tabdata cache
(async () => {
  browser.browserAction.disable();
  browser.browserAction.setBadgeText({ text: "" });
  browser.browserAction.setBadgeBackgroundColor({ color: "orange" }); // default color
  await syncMemory();
  (
    await browser.tabs.query({
      hidden: false,
      pinned: false,
    })
  ).forEach((t) => {
    tabdata.set(t.id, {
      id: t.id,
      status: t.status,
      url: t.url.endsWith("#") ? t.url.slice(0, -1) : t.url,
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
        tmp.cs = t.cookieStoreId;
        tmp.id = t.id;
      }
      if (typeof changeInfo.url === "string") {
        (tmp.url = changeInfo.url.endsWith("#")
          ? changeInfo.url.slice(0, -1)
          : changeInfo.url),
          (tmp.cs = t.cookieStoreId);
        tmp.id = t.id;
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
    id: t.id,
    url: t.url.endsWith("#") ? t.url.slice(0, -1) : t.url,
    cs: t.cookieStoreId,
    ts: Date.now(),
    status: "created",
  });
  delayed_updateBA();
});

// remove tab from cache
browser.tabs.onRemoved.addListener((tabId) => {
  if (manually_ignored_tabIds.has(tabId)) {
    manually_ignored_tabIds.delete(tabId);
  }
  if (tabdata.has(tabId)) {
    tabdata.delete(tabId);
  }
  delayed_updateBA();
});

// trigger deletion
browser.browserAction.onClicked.addListener(async (/*tab, info*/) => {
  // clear action is only available when last update is done
  // not strictly necessary, since we disable the button ... but it doesnt hurt
  if (delayed_updateBA_timerId === null) {
    await delDups();
    delayed_updateBA();
  }
});

browser.tabs.onActivated.addListener((activeInfo) => {
  if (!byCreated && tabdata.has(activeInfo.tabId)) {
    let tmp = tabdata.get(activeInfo.tabId);
    tmp.ts = Date.now();
    tabdata.set(activeInfo.tabId, tmp);
  }
});

browser.storage.onChanged.addListener(syncMemory);

browser.commands.onCommand.addListener(async (command) => {
  if (command == "ignore-set") {
    const htabIds = (
      await browser.tabs.query({ currentWindow: true, highlighted: true })
    ).map((t) => t.id);
    for (const htid of htabIds) {
      if (!manually_ignored_tabIds.has(htid)) {
        manually_ignored_tabIds.add(htid);
      }
    }
    delayed_updateBA();
  } else if (command == "ignore-clear") {
    manually_ignored_tabIds.clear();
    delayed_updateBA();
  }
});
