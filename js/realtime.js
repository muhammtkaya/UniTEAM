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
    this._unbindWord();
    if (this.doc && this._onUpdate) { try { this.doc.off("update", this._onUpdate); } catch (e) {} }
    if (this.ws) { try { this.ws.close(); } catch (e) {} }
    this.ws = null;
    this.doc = null;
    this.docId = null;
    this._onUpdate = null;
  },

  /* =========================================================================
   * RT2 — Word editörüne bağlama (blok seviyesi)
   * -------------------------------------------------------------------------
   * Model: Y.Array("order") = blok id (bid) sırası; Y.Map("blocks") = bid→outerHTML.
   * Her top-level element (p/h1/ul/table…) bir blok. Farklı bloklardaki eş zamanlı
   * düzenleme temiz birleşir (blok başına LWW). İmleç, değişmeyen blokta korunur.
   * ========================================================================= */

  // Etkin (Word + bulut) belge için canlı düzenlemeyi aç/kapat.
  async toggleLiveActive() {
    if (this._word) { this.disconnect(); XL.status("Canlı düzenleme kapatıldı."); return false; }
    const doc = XL.ws.active();
    if (!doc || doc.type !== "docx") { alert("Canlı düzenleme şimdilik yalnız Word belgelerinde."); return false; }
    if (!XL.cloud || !XL.cloud.enabled()) { alert("Canlı düzenleme için giriş yapın."); return false; }
    XL.status("Canlı düzenlemeye bağlanılıyor…");
    try {
      if (!doc.cloudId) { await XL.cloud.saveActive(); }   // oda id'si = cloudId
      await this.bindWord(doc.cloudId);
      XL.status("🟢 Canlı düzenleme açık");
      return true;
    } catch (e) {
      console.error(e);
      alert("Canlı düzenlemeye bağlanılamadı: " + (e.message || e));
      XL.status("");
      return false;
    }
  },

  async bindWord(docId) {
    const mode = XL.modes.docx;
    if (!mode.body) throw new Error("Önce bir Word belgesi açık olmalı.");
    const ydoc = new Y.Doc();
    await this.connect(docId, ydoc);
    await new Promise((r) => setTimeout(r, 400));   // saklı güncellemeler yerleşsin

    const order = ydoc.getArray("order");
    const blocks = ydoc.getMap("blocks");
    this._word = { ydoc, order, blocks, body: mode.body, applying: false, pushT: null };

    if (order.length === 0) this._wordPush();   // ilk kullanıcı: editörden tohumla
    else this._wordRender();                     // mevcut oda içeriğini yükle

    // Uzak değişiklikleri render et (kendi yerel yazımımızı atla).
    const onChange = (evt, tr) => { if (tr && tr.origin === "local") return; this._wordRender(); };
    order.observe(onChange);
    blocks.observe(onChange);
    this._word.onChange = onChange;

    // Yerel giriş → Y (debounce).
    this._word.onInput = () => {
      if (this._word.applying) return;
      clearTimeout(this._word.pushT);
      this._word.pushT = setTimeout(() => this._wordPush(), 250);
    };
    mode.body.addEventListener("input", this._word.onInput);
  },

  _unbindWord() {
    const w = this._word;
    if (!w) return;
    try { w.order.unobserve(w.onChange); w.blocks.unobserve(w.onChange); } catch (e) {}
    try { if (w.body && w.onInput) w.body.removeEventListener("input", w.onInput); } catch (e) {}
    clearTimeout(w.pushT);
    this._word = null;
  },

  _parseEl(html) {
    const t = document.createElement("div");
    t.innerHTML = html;
    return t.firstElementChild || Object.assign(document.createElement("p"), { innerHTML: "<br>" });
  },

  // Editör → Y (yerel değişiklikleri yaz).
  _wordPush() {
    const w = this._word; if (!w) return;
    const body = w.body;
    [...body.children].forEach((el) => { if (!el.getAttribute("data-bid")) el.setAttribute("data-bid", "b" + Math.random().toString(36).slice(2, 9)); });
    const desired = [...body.children].map((el) => ({ bid: el.getAttribute("data-bid"), html: el.outerHTML }));
    Y.transact(w.ydoc, () => {
      const seen = new Set(desired.map((d) => d.bid));
      desired.forEach((d) => { if (w.blocks.get(d.bid) !== d.html) w.blocks.set(d.bid, d.html); });
      [...w.blocks.keys()].forEach((bid) => { if (!seen.has(bid)) w.blocks.delete(bid); });
      const cur = w.order.toArray(), next = desired.map((d) => d.bid);
      if (cur.length !== next.length || cur.some((b, i) => b !== next[i])) {
        w.order.delete(0, w.order.length);
        w.order.insert(0, next);
      }
    }, "local");
  },

  // Y → editör (uzak değişiklikleri uygula; imleci koru).
  _wordRender() {
    const w = this._word; if (!w) return;
    const body = w.body;
    const focused = document.activeElement === body;
    const caret = focused ? this._saveCaret(body) : null;
    w.applying = true;
    try {
      const desired = w.order.toArray().map((bid) => ({ bid, html: w.blocks.get(bid) })).filter((d) => d.html != null);
      const cur = new Map();
      [...body.children].forEach((el) => { const b = el.getAttribute("data-bid"); if (b) cur.set(b, el); });
      // Fazla blokları kaldır
      cur.forEach((el, bid) => { if (!desired.find((d) => d.bid === bid)) el.remove(); });
      // Sıra + içerik (appendChild mevcut düğümü sona taşır → sıralama)
      for (const d of desired) {
        let el = cur.get(d.bid);
        if (!el) el = this._parseEl(d.html);
        else if (el.outerHTML !== d.html) { const n = this._parseEl(d.html); el.replaceWith(n); el = n; cur.set(d.bid, n); }
        body.appendChild(el);
      }
      if (!body.children.length) body.innerHTML = "<p><br></p>";
    } finally {
      w.applying = false;
    }
    if (caret) this._restoreCaret(body, caret);
  },

  _saveCaret(body) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    let top = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    while (top && top.parentElement !== body) top = top.parentElement;
    if (!top) return null;
    const pre = r.cloneRange(); pre.selectNodeContents(top); pre.setEnd(r.startContainer, r.startOffset);
    return { bid: top.getAttribute("data-bid"), offset: pre.toString().length };
  },

  _restoreCaret(body, caret) {
    if (!caret || !caret.bid) return;
    const top = body.querySelector(`[data-bid="${caret.bid}"]`);
    if (!top) return;
    let remaining = caret.offset, target = null, toff = 0;
    const walker = document.createTreeWalker(top, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) { if (remaining <= n.length) { target = n; toff = remaining; break; } remaining -= n.length; }
    const sel = window.getSelection(), r = document.createRange();
    if (target) r.setStart(target, toff); else { r.selectNodeContents(top); r.collapse(false); }
    r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
  },
};

// Üst çubuktaki "🟢 Canlı" düğmesini bağla.
window.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btn-live");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const on = await XL.realtime.toggleLiveActive();
    btn.classList.toggle("live-on", !!on);
  });
});
