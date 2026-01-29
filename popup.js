const statusEl = document.getElementById("status");
const processedEl = document.getElementById("processed");
const listEl = document.getElementById("list");
const pagesInput = document.getElementById("pages");
const rescanBtn = document.getElementById("rescan");
const purgePromosBtn = document.getElementById("purge-promos");
const LAST_STATS_KEY = "lastStats";
const IGNORE_LIST_KEY = "ignoredDomains";

const port = chrome.runtime.connect({ name: "popup" });
let currentTop = [];
let lastPagesUsed = Number(pagesInput.value) || 5;
let ignoreList = new Set();

function setStatus(text) {
  statusEl.textContent = text;
}

function renderList(items) {
  listEl.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.textContent = "No domains yet.";
    empty.className = "card";
    listEl.appendChild(empty);
    return;
  }
  for (const { domain, count } of items) {
    const card = document.createElement("div");
    card.className = "card";

    const info = document.createElement("div");
    const d = document.createElement("div");
    d.className = "domain";
    d.textContent = domain;
    const c = document.createElement("div");
    c.className = "count";
    c.textContent = `${count} messages`;
    info.appendChild(d);
    info.appendChild(c);

    const actions = document.createElement("div");
    actions.className = "actions";

    const searchBtn = document.createElement("button");
    searchBtn.className = "search-btn";
    searchBtn.textContent = "Search";
    searchBtn.addEventListener("click", () => {
      const query = encodeURIComponent(`from:${domain}`);
      chrome.tabs.create({
        url: `https://mail.google.com/mail/u/0/#search/${query}`,
      });
    });

    const trashBtn = document.createElement("button");
    trashBtn.textContent = "Trash domain";
    trashBtn.addEventListener("click", () => {
      trashBtn.disabled = true;
      setStatus(`Trashing ${domain}…`);
      port.postMessage({ type: "TRASH_DOMAIN", domain });
    });

    const ignoreBtn = document.createElement("button");
    ignoreBtn.className = "ignore-btn";
    const isIgnored = ignoreList.has(domain);
    ignoreBtn.textContent = isIgnored ? "Ignored" : "Ignore";
    ignoreBtn.disabled = isIgnored;
    ignoreBtn.addEventListener("click", () => {
      if (ignoreList.has(domain)) return;
      ignoreList.add(domain);
      chrome.storage.local.set(
        { [IGNORE_LIST_KEY]: Array.from(ignoreList) },
        () => {
          currentTop = filterTop(currentTop);
          renderList(currentTop);
          setStatus(`Ignoring ${domain}. Click Rescan to refresh results.`);
        },
      );
    });

    actions.appendChild(searchBtn);
    actions.appendChild(trashBtn);
    actions.appendChild(ignoreBtn);

    card.appendChild(info);
    card.appendChild(actions);
    listEl.appendChild(card);
  }
}

function startScan() {
  const pages = Math.max(1, Math.min(50, parseInt(pagesInput.value, 10) || 5));
  pagesInput.value = pages;
  lastPagesUsed = pages;
  currentTop = [];
  renderList(currentTop);
  setStatus(`Scanning ${pages * 500} messages (up to ${pages} pages)…`);
  processedEl.textContent = "0";
  port.postMessage({ type: "START_SCAN", pages });
}

function applySavedStats(stats) {
  if (!stats) {
    currentTop = [];
    renderList(currentTop);
    processedEl.textContent = "0";
    setStatus("Click Rescan to scan your inbox.");
    return;
  }

  currentTop = filterTop(stats.top || []);
  renderList(currentTop);
  processedEl.textContent = String(stats.processed || 0);
  if (stats.pages) {
    pagesInput.value = stats.pages;
    lastPagesUsed = stats.pages;
  }

  const when = stats.completedAt
    ? new Date(stats.completedAt).toLocaleString()
    : "a previous scan";
  setStatus(`Showing results from ${when}. Click Rescan to refresh.`);
}

function loadSavedStats() {
  chrome.storage.local.get(LAST_STATS_KEY, ({ lastStats }) =>
    applySavedStats(lastStats || null),
  );
  port.postMessage({ type: "GET_LAST_STATS" });
}

function loadIgnoreList() {
  return new Promise((resolve) => {
    chrome.storage.local.get(IGNORE_LIST_KEY, ({ ignoredDomains }) => {
      const list = Array.isArray(ignoredDomains) ? ignoredDomains : [];
      ignoreList = new Set(list);
      resolve();
    });
  });
}

function filterTop(top) {
  return (top || []).filter(({ domain }) => !ignoreList.has(domain));
}

rescanBtn.addEventListener("click", () => startScan());
purgePromosBtn.addEventListener("click", () => {
  purgePromosBtn.disabled = true;
  setStatus("Purging old promotions…");
  port.postMessage({ type: "PURGE_PROMOS" });
});

port.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return;

  if (msg.type === "SCAN_PROGRESS") {
    processedEl.textContent = String(msg.processed ?? 0);
    return;
  }

  if (msg.type === "SCAN_DONE") {
    currentTop = filterTop(msg.top || []);
    renderList(currentTop);
    processedEl.textContent = String(msg.processed || 0);
    const completedAt = msg.completedAt
      ? new Date(msg.completedAt).toLocaleString()
      : "just now";
    setStatus(`Scan complete (${completedAt}).`);
    chrome.storage.local.set({
      [LAST_STATS_KEY]: {
        top: currentTop,
        processed: msg.processed || 0,
        pages: msg.pages || lastPagesUsed,
        completedAt: msg.completedAt || Date.now(),
      },
    });
    return;
  }

  if (msg.type === "SCAN_ERROR") {
    const hadPartial = Array.isArray(msg.top);
    if (hadPartial) {
      currentTop = filterTop(msg.top || []);
      renderList(currentTop);
      processedEl.textContent = String(msg.processed || 0);
      chrome.storage.local.set({
        [LAST_STATS_KEY]: {
          top: currentTop,
          processed: msg.processed || 0,
          pages: msg.pages || lastPagesUsed,
          completedAt: msg.completedAt || Date.now(),
        },
      });
      setStatus(
        `Scan hit an error after ${msg.processed || 0} messages: ${
          msg.error || "Scan failed"
        }. Showing partial results.`,
      );
    } else {
      setStatus(msg.error || "Scan failed");
    }
    return;
  }

  if (msg.type === "TRASH_PROGRESS") {
    const { domain, processed = 0, total = 0 } = msg;
    setStatus(`Trashing ${processed} of ${total} for ${domain}…`);
    return;
  }

  if (msg.type === "PURGE_PROMOS_PROGRESS") {
    const { processed = 0, total = 0 } = msg;
    setStatus(`Purging promotions: ${processed}/${total}…`);
    return;
  }

  if (msg.type === "TRASH_DONE") {
    if (msg.error) {
      setStatus(msg.error);
      return;
    }
    currentTop = currentTop.filter(({ domain }) => domain !== msg.domain);
    renderList(currentTop);
    setStatus(`Moved ${msg.trashed} messages to Trash for ${msg.domain}.`);
    chrome.storage.local.get(LAST_STATS_KEY, ({ lastStats }) => {
      if (!lastStats) return;
      chrome.storage.local.set({
        [LAST_STATS_KEY]: {
          ...lastStats,
          top: currentTop,
        },
      });
    });
    return;
  }

  if (msg.type === "PURGE_PROMOS_DONE") {
    purgePromosBtn.disabled = false;
    if (msg.error) {
      setStatus(msg.error);
      return;
    }
    setStatus(`Purged ${msg.trashed} old promotions.`);
    return;
  }

  if (msg.type === "LAST_STATS") {
    applySavedStats(msg.stats || null);
    return;
  }
});

// Show saved results until the user chooses to rescan
setStatus("Loading saved stats…");
loadIgnoreList().then(() => loadSavedStats());
