/* storage.js — belgelerin kalıcılığı (IndexedDB), localStorage'a düşüşle
 *
 * Neden IndexedDB: localStorage ~5 MB ile sınırlıydı; resimli belgelerde otomatik
 * kayıt sessizce başarısız olup veri kaybına yol açıyordu. IndexedDB yüzlerce MB
 * sunar, eşzamansızdır ve belge başına kayıt tutar (yalnızca değişeni yazarız).
 *
 * Şema:  veritabanı "uniteam"
 *   - object store "docs"   (keyPath: "id")  -> { id, type, name, data }
 *   - object store "meta"   (anahtar "state") -> { order: [id...], activeId }
 *   - object store "outbox" (keyPath: "key")  -> çevrimdışı bulut kayıt kuyruğu (Faz 4)
 *
 * Marka göçü: DB adı eski "weboffice"den "uniteam"e taşındı. İlk açılışta yeni DB
 * boşsa eski DB'den (varsa) belgeler/meta/tercihler otomatik kopyalanır → hiçbir
 * kullanıcı verisi kaybolmaz (eski DB silinmez, güvenlik için yerinde bırakılır).
 */
XL.store = {
  NAME: "uniteam",
  OLD_NAMES: ["weboffice"],
  VER: 2,            // Faz 4: "outbox" store eklendi (1→2)
  _db: null,

  available() {
    try { return typeof indexedDB !== "undefined" && indexedDB !== null; }
    catch (e) { return false; }
  },

  _open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      const req = indexedDB.open(this.NAME, this.VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("docs")) db.createObjectStore("docs", { keyPath: "id" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
        if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "key" });
      };
      req.onsuccess = async () => {
        this._db = req.result;
        try { await this._migrateLegacy(); } catch (e) { console.warn("Eski veri göçü atlandı:", e); }
        res(this._db);
      };
      req.onerror = () => rej(req.error);
      req.onblocked = () => rej(new Error("IndexedDB engellendi"));
    });
  },

  // Marka göçü: yeni DB boşsa eski adlı DB('ler)den verileri bir kez kopyala.
  async _migrateLegacy() {
    const hasDocs = await new Promise((res) => {
      try {
        const rq = this._db.transaction("docs", "readonly").objectStore("docs").count();
        rq.onsuccess = () => res(rq.result > 0);
        rq.onerror = () => res(true);   // emin değilsek göç etme (üzerine yazma)
      } catch (e) { res(true); }
    });
    if (hasDocs) return;
    if (!indexedDB.databases) return;  // varlık kontrolü yoksa göçü atla (veri güvende)
    let existing = [];
    try { existing = (await indexedDB.databases()).map((d) => d.name); } catch (e) { return; }
    for (const oldName of this.OLD_NAMES) {
      if (!existing.includes(oldName)) continue;
      const oldDb = await new Promise((res) => {
        const rq = indexedDB.open(oldName);   // sürüm verilmez → mevcut sürümle açılır
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => res(null);
      });
      if (!oldDb) continue;
      try {
        const names = oldDb.objectStoreNames;
        if (!names.contains("docs")) { oldDb.close(); continue; }
        const stores = names.contains("meta") ? ["docs", "meta"] : ["docs"];
        const data = await new Promise((res, rej) => {
          const tx = oldDb.transaction(stores, "readonly");
          const docsReq = tx.objectStore("docs").getAll();
          let state = null, prefs = null;
          if (names.contains("meta")) {
            const sReq = tx.objectStore("meta").get("state");
            const pReq = tx.objectStore("meta").get("prefs");
            sReq.onsuccess = () => { state = sReq.result || null; };
            pReq.onsuccess = () => { prefs = pReq.result || null; };
          }
          tx.oncomplete = () => res({ docs: docsReq.result || [], state, prefs });
          tx.onerror = () => rej(tx.error);
        });
        if (data.docs.length) await this._write("docs", (os) => data.docs.forEach((d) => os.put(d)));
        if (data.state) await this.saveMeta(data.state);
        if (data.prefs) await this.savePrefs(data.prefs);
        oldDb.close();
        if (data.docs.length) break;   // ilk dolu eski DB yeter
      } catch (e) { try { oldDb.close(); } catch (_) {} }
    }
  },

  // Yazma işlemi: tamamlanınca çözülür (quota hatası burada yakalanır)
  async _write(store, fn) {
    const db = await this._open();
    return new Promise((res, rej) => {
      let tx;
      try { tx = db.transaction(store, "readwrite"); }
      catch (e) { return rej(e); }
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error || new Error("İşlem iptal edildi"));
      try { fn(tx.objectStore(store)); }
      catch (e) { try { tx.abort(); } catch (_) {} rej(e); }
    });
  },

  saveDoc(doc) {
    // cloudId: bu belgenin bulut (Supabase) karşılığının UUID'si (varsa).
    return this._write("docs", (os) => os.put({ id: doc.id, type: doc.type, name: doc.name, data: doc.data, cloudId: doc.cloudId }));
  },
  deleteDoc(id) {
    return this._write("docs", (os) => os.delete(id));
  },
  saveMeta(meta) {
    return this._write("meta", (os) => os.put(meta, "state"));
  },

  // Kullanıcı tercihleri (tema vb.) — "meta" store'unda ayrı anahtar
  savePrefs(prefs) {
    return this._write("meta", (os) => os.put(prefs, "prefs"));
  },
  async loadPrefs() {
    const db = await this._open();
    return new Promise((res) => {
      let tx;
      try { tx = db.transaction("meta", "readonly"); } catch (e) { return res(null); }
      const rq = tx.objectStore("meta").get("prefs");
      tx.oncomplete = () => res(rq.result || null);
      tx.onerror = () => res(null);
    });
  },

  /* --- Çevrimdışı bulut kayıt kuyruğu (outbox) — Faz 4 --- */
  // entry: { key, cloudId, localId, type, name, data, ts }
  queueOutbox(entry) {
    return this._write("outbox", (os) => os.put(entry));
  },
  clearOutbox(key) {
    return this._write("outbox", (os) => os.delete(key));
  },
  async loadOutbox() {
    const db = await this._open();
    return new Promise((res) => {
      let tx;
      try { tx = db.transaction("outbox", "readonly"); } catch (e) { return res([]); }
      const rq = tx.objectStore("outbox").getAll();
      tx.oncomplete = () => res(rq.result || []);
      tx.onerror = () => res([]);
    });
  },

  // Tüm belgeleri + meta'yı oku
  async loadAll() {
    const db = await this._open();
    return new Promise((res, rej) => {
      const tx = db.transaction(["docs", "meta"], "readonly");
      const docsReq = tx.objectStore("docs").getAll();
      const metaReq = tx.objectStore("meta").get("state");
      tx.oncomplete = () => res({ docs: docsReq.result || [], meta: metaReq.result || null });
      tx.onerror = () => rej(tx.error);
    });
  },
};

/* --- Kullanıcı tercihleri (uygulama geneli, belgeden bağımsız) --- */
XL.prefs = {
  LKEY: "uniteam-prefs",
  OLD_LKEY: "weboffice-prefs",   // marka göçü: yeni anahtar boşsa eskiden oku
  data: {},

  async load() {
    if (XL.store.available()) {
      try { this.data = (await XL.store.loadPrefs()) || {}; return this.data; } catch (e) {}
    }
    try {
      this.data = JSON.parse(localStorage.getItem(this.LKEY) || localStorage.getItem(this.OLD_LKEY)) || {};
    } catch (e) { this.data = {}; }
    return this.data;
  },
  get(k, def) { return this.data[k] !== undefined ? this.data[k] : def; },
  set(k, v) {
    if (v === undefined || v === null) delete this.data[k]; else this.data[k] = v;
    this.save();
  },
  async save() {
    if (XL.store.available()) {
      try { await XL.store.savePrefs(this.data); return; } catch (e) {}
    }
    try { localStorage.setItem(this.LKEY, JSON.stringify(this.data)); } catch (e) {}
  },
};
