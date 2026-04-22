import {
  archiveNeedsMigration,
  dedupeArticles,
  mergeArticle,
  normalizeArticle,
} from "./shared.js";

const DB_NAME = "localarchive";
const DB_VERSION = 2;
const STORE_NAME = "articles";

let dbPromise;

export function openArchiveDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        let store;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        } else {
          store = request.transaction.objectStore(STORE_NAME);
        }
        if (!store.indexNames.contains("capturedAt")) {
          store.createIndex("capturedAt", "capturedAt", { unique: false });
        }
        if (!store.indexNames.contains("url")) {
          store.createIndex("url", "url", { unique: false });
        }
        if (!store.indexNames.contains("canonicalUrl")) {
          store.createIndex("canonicalUrl", "canonicalUrl", { unique: false });
        }
        if (!store.indexNames.contains("domain")) {
          store.createIndex("domain", "domain", { unique: false });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        migrateArchive(db).then(() => resolve(db)).catch(reject);
      };
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

export async function saveArticle(article) {
  const db = await openArchiveDb();
  const normalized = normalizeArticle(article);
  const existing = normalized.canonicalUrl
    ? await getArticleByCanonicalUrl(db, normalized.canonicalUrl)
    : null;
  const articleToSave = existing ? mergeArticle(existing, normalized) : normalized;
  await txDone(db, STORE_NAME, "readwrite", (store) => store.put(articleToSave));
  return articleToSave;
}

export async function saveArticles(articles) {
  const saved = [];
  for (const article of articles) {
    saved.push(await saveArticle(article));
  }
  return saved;
}

export async function listArticles() {
  const db = await openArchiveDb();
  const items = await getAllArticles(db);
  items.sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)));
  return items;
}

export async function deleteArticle(id) {
  const db = await openArchiveDb();
  await txDone(db, STORE_NAME, "readwrite", (store) => store.delete(id));
}

export async function replaceAllArticles(articles) {
  const db = await openArchiveDb();
  const deduped = dedupeArticles(articles);
  await txDone(db, STORE_NAME, "readwrite", (store) => {
    store.clear();
    for (const article of deduped) {
      store.put(article);
    }
  });
}

async function migrateArchive(db) {
  const articles = await getAllArticles(db);
  if (!archiveNeedsMigration(articles)) {
    return;
  }
  const deduped = dedupeArticles(articles);
  await txDone(db, STORE_NAME, "readwrite", (store) => {
    store.clear();
    for (const article of deduped) {
      store.put(article);
    }
  });
}

function getAllArticles(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function getArticleByCanonicalUrl(db, canonicalUrl) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    if (!store.indexNames.contains("canonicalUrl")) {
      resolve(null);
      return;
    }
    const request = store.index("canonicalUrl").get(canonicalUrl);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function txDone(db, storeName, mode, work) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    work(store);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
