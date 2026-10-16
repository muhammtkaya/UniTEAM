/* realtime.js — gerçek zamanlı eş düzenleme istemcisi (Yjs ↔ Worker/DocRoom)
 *
 * Minimal bir Yjs "provider": bir Y.Doc'u Worker'daki DocRoom (WebSocket) odasına
 * bağlar.
 *   - Yerel değişiklik (Y.Doc update) → WebSocket ile sunucuya gönderilir.
 *   - Sunucudan gelen güncelleme → Y.applyUpdate ile belgeye uygulanır
 *     (origin "remote" → tekrar sunucuya yollanmaz, echo döngüsü önlenir).
 *   - Bağlanınca mevcut yerel durum sunucuya gönderilir (geç gelen senkron).
 *
 * UI'dan bağımsız taşıma katmanı. Editöre bağlama (Word) RT2'de yapılacak.
 */
XL.realtime = {
  ws: null,
  doc: null,
  docId: null,
  _onUpdate: null,

  // http(s) tabanlı Worker adresini ws(s) şemasına çevirir.
  _wsBase() {
    const base = (XL.config.worker && XL.config.worker.url) || "http://127.0.0.1:8787";
    return base.replace(/^http/i, "ws");
  },

  async _token() {
    if (!XL.auth || !XL.auth.client) return null;
    const { data } = await XL.auth.client.auth.getSession();
    return data.session ? data.session.access_token : null;
  },

  connected() { return this.ws && this.ws.readyState === WebSocket.OPEN; },

  // Bir Y.Doc'u belge odasına bağla. Açılınca çözülen bir söz döner.
  async connect(docId, ydoc) {
    this.disconnect();
    const token = await this._token();
    if (!token) throw new Error("Gerçek zamanlı için giriş gerekli.");

    const url = `${this._wsBase()}/rooms/${encodeURIComponent(docId)}/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    this.doc = ydoc;
    this.docId = docId;

    // Sunucudan gelen güncellemeler → belgeye uygula (remote origin).
    ws.addEventListener("message", (evt) => {
      if (!(evt.data instanceof ArrayBuffer)) return;
      Y.applyUpdate(ydoc, new Uint8Array(evt.data), "remote");
    });

    // Yerel güncellemeler → sunucuya gönder (remote kaynaklı olanlar hariç).
    this._onUpdate = (update, origin) => {
      if (origin === "remote") return;
      if (ws.readyState === WebSocket.OPEN) ws.send(update);
    };
    ydoc.on("update", this._onUpdate);

    return new Promise((resolve, reject) => {
      ws.addEventListener("open", () => {
        // Mevcut yerel durumu sunucuya tohumla (oda boşsa işe yarar).
        try {
          const state = Y.encodeStateAsUpdate(ydoc);
          if (state && state.length) ws.send(state);
        } catch (e) {}
        resolve(this);
      }, { once: true });
      ws.addEventListener("error", () => reject(new Error("WebSocket bağlanamadı")), { once: true });
    });
  },

  disconnect() {
    if (this.doc && this._onUpdate) { try { this.doc.off("update", this._onUpdate); } catch (e) {} }
    if (this.ws) { try { this.ws.close(); } catch (e) {} }
    this.ws = null;
    this.doc = null;
    this.docId = null;
    this._onUpdate = null;
  },
};
