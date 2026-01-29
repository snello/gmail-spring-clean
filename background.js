const GMAIL_API_BASE = "https://www.googleapis.com/gmail/v1/users/me";
const LIST_PAGE_SIZE = 500; // max Gmail allows
const FETCH_CONCURRENCY = 10; // message metadata fetch concurrency
const LAST_STATS_KEY = "lastStats";
const IGNORE_LIST_KEY = "ignoredDomains";

function getLastStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get(LAST_STATS_KEY, (data) =>
      resolve(data[LAST_STATS_KEY] || null),
    );
  });
}

function setLastStats(stats) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LAST_STATS_KEY]: stats }, resolve);
  });
}

function getIgnoreList() {
  return new Promise((resolve) => {
    chrome.storage.local.get(IGNORE_LIST_KEY, (data) => {
      const list = data[IGNORE_LIST_KEY];
      resolve(Array.isArray(list) ? list : []);
    });
  });
}

function buildIgnoreQuery(ignoreSet) {
  if (!ignoreSet || ignoreSet.size === 0) return "";
  // Gmail search: combine as -from:domain1 -from:domain2 ...
  return Array.from(ignoreSet)
    .map((domain) => `-from:${domain}`)
    .join(" ");
}

async function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(
          chrome.runtime.lastError || new Error("Failed to get auth token"),
        );
        return;
      }
      resolve(token);
    });
  });
}

async function fetchWithAuth(url, options = {}) {
  const token = await getAuthToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 401) {
    await new Promise((resolve) =>
      chrome.identity.removeCachedAuthToken({ token }, resolve),
    );
    const retryToken = await getAuthToken();
    return fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${retryToken}`,
      },
    });
  }

  return res;
}

function extractEmail(fromHeader) {
  if (!fromHeader) return null;
  const match = fromHeader.match(/[\w.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return match ? match[0].toLowerCase() : null;
}

function extractDomain(email) {
  if (!email) return null;
  const parts = email.split("@");
  return parts.length === 2 ? parts[1] : null;
}

async function listMessagesPage(pageToken, query) {
  const params = new URLSearchParams({
    maxResults: String(LIST_PAGE_SIZE),
    labelIds: "INBOX",
  });
  if (pageToken) params.set("pageToken", pageToken);
  if (query) params.set("q", query);

  const url = `${GMAIL_API_BASE}/messages?${params.toString()}`;
  const res = await fetchWithAuth(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`List failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function getMessageMetadata(id) {
  const url = `${GMAIL_API_BASE}/messages/${id}?format=metadata&metadataHeaders=From`;
  const res = await fetchWithAuth(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Get message failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function throttledMap(items, limit, fn) {
  const results = [];
  let index = 0;
  let active = 0;

  return new Promise((resolve, reject) => {
    const next = () => {
      if (index >= items.length && active === 0) {
        resolve(results);
        return;
      }
      while (active < limit && index < items.length) {
        const i = index++;
        active++;
        Promise.resolve(fn(items[i], i))
          .then((r) => {
            results[i] = r;
            active--;
            next();
          })
          .catch(reject);
      }
    };
    next();
  });
}

async function tallyDomains(maxPages, port, ignoreSet = new Set(), onPartial) {
  const counts = new Map();
  let totalProcessed = 0;
  let pageToken = undefined;
  const ignoreQuery = buildIgnoreQuery(ignoreSet);
  const queryParts = ["has:nouserlabels"];
  if (ignoreQuery) queryParts.push(ignoreQuery);
  const query = queryParts.join(" ");

  for (let page = 0; page < maxPages; page++) {
    const pageData = await listMessagesPage(pageToken, query);
    const ids = (pageData.messages || []).map((m) => m.id);
    if (ids.length === 0) break;

    const metas = await throttledMap(ids, FETCH_CONCURRENCY, (id) =>
      getMessageMetadata(id),
    );
    for (const meta of metas) {
      const fromHeader = (meta.payload?.headers || []).find(
        (h) => h.name === "From",
      )?.value;
      const email = extractEmail(fromHeader);
      const domain = extractDomain(email);
      if (!domain) continue;
      if (ignoreSet.has(domain)) continue;
      counts.set(domain, (counts.get(domain) || 0) + 1);
      totalProcessed += 1;
    }

    port.postMessage({
      type: "SCAN_PROGRESS",
      processed: totalProcessed,
      page,
    });

    const topSoFar = Array.from(counts.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count);
    onPartial?.({ top: topSoFar, processed: totalProcessed });

    if (!pageData.nextPageToken) break;
    pageToken = pageData.nextPageToken;
  }

  const top = Array.from(counts.entries())
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count);

  return { top, processed: totalProcessed };
}

function buildDomainQuery(domain) {
  return `in:anywhere has:nouserlabels from:${domain}`;
}

async function listMessageIdsByDomain(domain) {
  const ids = [];
  let pageToken = undefined;

  while (true) {
    const params = new URLSearchParams({
      q: buildDomainQuery(domain),
      maxResults: String(LIST_PAGE_SIZE),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const url = `${GMAIL_API_BASE}/messages?${params.toString()}`;
    const res = await fetchWithAuth(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`List failed (${res.status}): ${text}`);
    }
    const data = await res.json();
    if (Array.isArray(data.messages)) {
      for (const msg of data.messages) {
        if (msg && msg.id) ids.push(msg.id);
      }
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return ids;
}

async function batchModify(ids) {
  const url = `${GMAIL_API_BASE}/messages/batchModify`;
  const res = await fetchWithAuth(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ids,
      addLabelIds: ["TRASH"],
      removeLabelIds: ["INBOX"],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Batch modify failed (${res.status}): ${text}`);
  }
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size)
    chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function trashDomain(domain, onProgress) {
  const ids = await listMessageIdsByDomain(domain);
  const total = ids.length;
  let processed = 0;
  const chunks = chunkArray(ids, LIST_PAGE_SIZE);
  for (const chunk of chunks) {
    if (!chunk.length) continue;
    await batchModify(chunk);
    processed += chunk.length;
    onProgress?.({ processed, total });
  }
  return { trashed: total };
}

async function listMessageIdsByQuery(query) {
  const ids = [];
  let pageToken = undefined;

  while (true) {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(LIST_PAGE_SIZE),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const url = `${GMAIL_API_BASE}/messages?${params.toString()}`;
    const res = await fetchWithAuth(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`List failed (${res.status}): ${text}`);
    }
    const data = await res.json();
    if (Array.isArray(data.messages)) {
      for (const msg of data.messages) {
        if (msg && msg.id) ids.push(msg.id);
      }
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return ids;
}

async function trashQuery(query, onProgress) {
  const ids = await listMessageIdsByQuery(query);
  const total = ids.length;
  let processed = 0;
  const chunks = chunkArray(ids, LIST_PAGE_SIZE);
  for (const chunk of chunks) {
    if (!chunk.length) continue;
    await batchModify(chunk);
    processed += chunk.length;
    onProgress?.({ processed, total });
  }
  return { trashed: total };
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "popup") return;

  port.onMessage.addListener((msg) => {
    (async () => {
      if (!msg || !msg.type) return;

      if (msg.type === "START_SCAN") {
        const pages =
          msg.pages && Number.isFinite(msg.pages) ? Math.max(1, msg.pages) : 5;
        let latestSnapshot = null;
        try {
          const ignoreList = new Set(await getIgnoreList());
          const result = await tallyDomains(
            pages,
            port,
            ignoreList,
            (snapshot) => {
              latestSnapshot = snapshot;
            },
          );
          const completedAt = Date.now();
          const filteredTop = result.top.filter(
            ({ domain }) => !ignoreList.has(domain),
          );
          const payload = {
            top: filteredTop,
            processed: result.processed,
            pages,
            completedAt,
          };
          await setLastStats(payload);
          port.postMessage({ type: "SCAN_DONE", ...payload });
        } catch (err) {
          const ignoreList = new Set(await getIgnoreList());
          const completedAt = Date.now();
          const partialTop = (latestSnapshot?.top || []).filter(
            ({ domain }) => !ignoreList.has(domain),
          );
          const partialPayload = latestSnapshot
            ? {
                top: partialTop,
                processed: latestSnapshot.processed,
                pages:
                  msg.pages && Number.isFinite(msg.pages)
                    ? Math.max(1, msg.pages)
                    : 5,
                completedAt,
              }
            : null;
          if (partialPayload) {
            await setLastStats(partialPayload);
          }
          port.postMessage({
            type: "SCAN_ERROR",
            error: err.message || String(err),
            ...(partialPayload ? { partial: true, ...partialPayload } : {}),
          });
        }
        return;
      }

      if (msg.type === "TRASH_DOMAIN" && msg.domain) {
        try {
          const result = await trashDomain(
            msg.domain,
            ({ processed, total }) => {
              port.postMessage({
                type: "TRASH_PROGRESS",
                domain: msg.domain,
                processed,
                total,
              });
            },
          );
          port.postMessage({
            type: "TRASH_DONE",
            domain: msg.domain,
            trashed: result.trashed,
          });
        } catch (err) {
          port.postMessage({
            type: "TRASH_DONE",
            domain: msg.domain,
            error: err.message || String(err),
          });
        }
        return;
      }

      if (msg.type === "PURGE_PROMOS") {
        try {
          const query = "label:promotions has:nouserlabels before:30d";
          const result = await trashQuery(query, ({ processed, total }) => {
            port.postMessage({
              type: "PURGE_PROMOS_PROGRESS",
              processed,
              total,
            });
          });
          port.postMessage({
            type: "PURGE_PROMOS_DONE",
            trashed: result.trashed,
          });
        } catch (err) {
          port.postMessage({
            type: "PURGE_PROMOS_DONE",
            error: err.message || String(err),
          });
        }
        return;
      }

      if (msg.type === "GET_LAST_STATS") {
        const stats = await getLastStats();
        port.postMessage({ type: "LAST_STATS", stats });
      }
    })();
  });
});
