/* storage.js — belgelerin kalıcılığı (IndexedDB), localStorage'a düşüşle
 *
 * Neden IndexedDB: localStorage ~5 MB ile sınırlıydı; resimli belgelerde otomatik
 * kayıt sessizce başarısız olup veri kaybına yol açıyordu. IndexedDB yüzlerce MB
 * sunar, eşzamansızdır ve belge başına kayıt tutar (yalnızca değişeni yazarız).
 *
 * Şema:  veritabanı "weboffice"
 *   - object store "docs"  (keyPath: "id")  -> { id, type, name, data }
 *   - object store "meta"  (anahtar "state") -> { order: [id...], activeId }
 */
XL.store = {
  NAME: "weboffice",
  VER: 1,
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
      };
      req.onsuccess = () => { this._db = req.result; res(this._db); };
      req.onerror = () => rej(req.error);
      req.onblocked = () => rej(new Error("IndexedDB engellendi"));
    });
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
    return this._write("docs", (os) => os.put({ id: doc.id, type: doc.type, name: doc.name, data: doc.data }));
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
  LKEY: "weboffice-prefs",
  data: {},

  async load() {
    if (XL.store.available()) {
      try { this.data = (await XL.store.loadPrefs()) || {}; return this.data; } catch (e) {}
    }
    try { this.data = JSON.parse(localStorage.getItem(this.LKEY)) || {}; } catch (e) { this.data = {}; }
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
