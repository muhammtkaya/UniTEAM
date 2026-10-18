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

    // Gelen mesajlar: [0]=Yjs doc güncellemesi, [1]=awareness (presence/imleç).
    ws.addEventListener("message", (evt) => {
      if (!(evt.data instanceof ArrayBuffer)) return;
      const bytes = new Uint8Array(evt.data);
      if (bytes.length < 1) return;
      const payload = bytes.subarray(1);
      if (bytes[0] === 0) Y.applyUpdate(ydoc, payload, "remote");
      else if (bytes[0] === 1) this._onAwareness(payload);
    });

    // Yerel güncellemeler → sunucuya gönder ([0] öntakılı; remote hariç).
    this._onUpdate = (update, origin) => {
      if (origin === "remote") return;
      if (ws.readyState === WebSocket.OPEN) ws.send(this._framed(0, update));
    };
    ydoc.on("update", this._onUpdate);

    // Awareness (presence) kurulumu.
    this._awSetup(ydoc);

    return new Promise((resolve, reject) => {
      ws.addEventListener("open", () => {
        try {
          const state = Y.encodeStateAsUpdate(ydoc);
          if (state && state.length) ws.send(this._framed(0, state));
        } catch (e) {}
        this._sendAwareness();   // hemen "buradayım" bildir
        resolve(this);
      }, { once: true });
      ws.addEventListener("error", () => reject(new Error("WebSocket bağlanamadı")), { once: true });
    });
  },

  /* ---------- Çerçeveleme + Awareness (RT3) ---------- */

  // [type][payload] çerçevesi.
  _framed(type, bytes) {
    const out = new Uint8Array(bytes.length + 1);
    out[0] = type; out.set(bytes, 1);
    return out;
  },

  _colorFor(id) { return `hsl(${(id * 47) % 360} 70% 45%)`; },

  _awSetup(ydoc) {
    this._aw = { remote: new Map(), color: this._colorFor(ydoc.clientID), cursor: null, hb: null, prune: null };
    this._aw.hb = setInterval(() => this._sendAwareness(), 4000);
    this._aw.prune = setInterval(() => {
      let changed = false;
      const now = Date.now();
      for (const [id, v] of this._aw.remote) { if (now - v.ts > 12000) { this._aw.remote.delete(id); changed = true; } }
      if (changed) { this._renderPresence(); this._renderCursors(); }
    }, 3000);
    this._onScroll = () => this._renderCursors();
    window.addEventListener("scroll", this._onScroll, true);
    window.addEventListener("resize", this._onScroll);
  },

  _sendAwareness() {
    if (!this.connected() || !this.doc || !this._aw) return;
    const email = (XL.auth && XL.auth.user && XL.auth.user.email) || "?";
    const state = { id: this.doc.clientID, email, color: this._aw.color, cursor: this._aw.cursor };
    this.ws.send(this._framed(1, new TextEncoder().encode(JSON.stringify(state))));
  },

  // Excel/PPT seçimi değişince (grid.updateSelection / pptx.select çağırır) — canlı seçim göstergesi.
  onLocalSelection() {
    if (!this._aw || !this.connected()) return;
    if (this._xl && XL.state && XL.state.sheets) {
      const idx = XL.state.sheets.findIndex((s) => s.id === XL.state.activeSheetId);
      const a = XL.state.active || { r: 0, c: 0 };
      this._aw.cursor = { kind: "xl", sheet: idx, r: a.r, c: a.c };
    } else if (this._pptx && XL.modes.pptx) {
      this._aw.cursor = { kind: "pp", slide: XL.modes.pptx.cur, el: XL.modes.pptx.selId || null };
    } else return;
    this._sendAwareness();
    this._renderCursors();   // yerel görünüm değişince uzak göstergeleri yeniden konumla
  },

  _onAwareness(payload) {
    if (!this._aw) return;
    try {
      const state = JSON.parse(new TextDecoder().decode(payload));
      if (!state || state.id == null) return;
      if (this.doc && state.id === this.doc.clientID) return; // kendimiz
      this._aw.remote.set(state.id, { state, ts: Date.now() });
      this._renderPresence();
      this._renderCursors();
    } catch (e) {}
  },

  _awTeardown() {
    if (!this._aw) return;
    clearInterval(this._aw.hb); clearInterval(this._aw.prune);
    if (this._onScroll) { window.removeEventListener("scroll", this._onScroll, true); window.removeEventListener("resize", this._onScroll); this._onScroll = null; }
    const p = document.getElementById("rt-presence"); if (p) p.remove();
    const c = document.getElementById("rt-cursors"); if (c) c.remove();
    this._aw = null;
  },

  _renderPresence() {
    if (!this._aw) return;
    let el = document.getElementById("rt-presence");
    if (!el) { el = document.createElement("div"); el.id = "rt-presence"; document.body.appendChild(el); }
    const chips = [...this._aw.remote.values()].map(({ state }) =>
      `<span class="rt-chip" title="${XL.esc(state.email)}" style="background:${state.color}">${XL.esc((state.email || "?")[0].toUpperCase())}</span>`).join("");
    el.innerHTML = chips ? `<span class="rt-plabel">Canlı:</span>${chips}` : "";
  },

  _renderCursors() {
    if (!this._aw) return;
    let cont = document.getElementById("rt-cursors");
    if (!cont) { cont = document.createElement("div"); cont.id = "rt-cursors"; document.body.appendChild(cont); }
    cont.innerHTML = "";
    for (const { state } of this._aw.remote.values()) {
      const cur = state.cursor;
      if (!cur) continue;
      // Geriye dönük uyum: kind yoksa Word imleci varsay.
      const kind = cur.kind || (cur.bid ? "wd" : null);
      if (kind === "wd") this._drawWordCaret(cont, state, cur);
      else if (kind === "xl") this._drawCellSel(cont, state, cur);
      else if (kind === "pp") this._drawElSel(cont, state, cur);
    }
  },

  _nameLabel(state, cls) {
    const label = document.createElement("div");
    label.className = cls || "rt-caret-label";
    label.textContent = (state.email || "?").split("@")[0];
    label.style.background = state.color;
    return label;
  },

  _drawWordCaret(cont, state, cur) {
    const body = XL.modes.docx && XL.modes.docx.body;
    if (!body || !cur.bid) return;
    const top = body.querySelector(`[data-bid="${cur.bid}"]`);
    if (!top) return;
    let remaining = cur.offset, target = null, toff = 0;
    const walker = document.createTreeWalker(top, NodeFilter.SHOW_TEXT);
    let n; while ((n = walker.nextNode())) { if (remaining <= n.length) { target = n; toff = remaining; break; } remaining -= n.length; }
    const r = document.createRange();
    if (target) r.setStart(target, toff); else { r.selectNodeContents(top); r.collapse(false); }
    r.collapse(true);
    const rect = r.getBoundingClientRect();
    if (!rect || (rect.left === 0 && rect.top === 0)) return;
    const caret = document.createElement("div");
    caret.className = "rt-caret";
    caret.style.left = rect.left + "px"; caret.style.top = rect.top + "px";
    caret.style.height = (rect.height || 16) + "px"; caret.style.background = state.color;
    caret.appendChild(this._nameLabel(state));
    cont.appendChild(caret);
  },

  // Excel: uzak kullanıcının seçili hücresini çerçevele (yalnız aynı sayfadaysa).
  _drawCellSel(cont, state, cur) {
    if (!XL.grid || !XL.grid.cells) return;
    const idx = XL.state.sheets.findIndex((s) => s.id === XL.state.activeSheetId);
    if (cur.sheet !== idx) return;
    const td = XL.grid.cells[cur.r] && XL.grid.cells[cur.r][cur.c];
    if (!td) return;
    const rect = td.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const box = document.createElement("div");
    box.className = "rt-cellsel";
    box.style.left = rect.left + "px"; box.style.top = rect.top + "px";
    box.style.width = rect.width + "px"; box.style.height = rect.height + "px";
    box.style.outlineColor = state.color;
    box.appendChild(this._nameLabel(state, "rt-sel-label"));
    cont.appendChild(box);
  },

  // PPT: uzak kullanıcının seçili öğesini çerçevele (yalnız aynı slayttaysa).
  _drawElSel(cont, state, cur) {
    const mode = XL.modes.pptx;
    if (!mode || mode.cur !== cur.slide || !cur.el || !mode.stageSlide) return;
    const el = mode.stageSlide.querySelector(`.pp-el[data-id="${cur.el}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const box = document.createElement("div");
    box.className = "rt-cellsel";
    box.style.left = rect.left + "px"; box.style.top = rect.top + "px";
    box.style.width = rect.width + "px"; box.style.height = rect.height + "px";
    box.style.outlineColor = state.color;
    box.appendChild(this._nameLabel(state, "rt-sel-label"));
    cont.appendChild(box);
  },

  disconnect() {
    this._unbindWord();
    this._unbindPptx();
    this._unbindXlsx();
    this._awTeardown();
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

  // Etkin (Word/PowerPoint + bulut) belge için canlı düzenlemeyi aç/kapat.
  async toggleLiveActive() {
    if (this._word || this._pptx || this._xl) { this.disconnect(); XL.status(XL.t("Canlı düzenleme kapatıldı.", "Live editing turned off.")); return false; }
    const doc = XL.ws.active();
    if (!doc || !["docx", "pptx", "xlsx"].includes(doc.type)) {
      alert(XL.t("Canlı düzenleme şimdilik Word, PowerPoint ve Excel belgelerinde.", "Live editing is available for Word, PowerPoint and Excel documents.")); return false;
    }
    if (!XL.cloud || !XL.cloud.enabled()) { alert(XL.t("Canlı düzenleme için giriş yapın.", "Sign in to use live editing.")); return false; }
    XL.status(XL.t("Canlı düzenlemeye bağlanılıyor…", "Connecting to live editing…"));
    try {
      if (!doc.cloudId) { await XL.cloud.saveActive(); }   // oda id'si = cloudId
      if (doc.type === "docx") await this.bindWord(doc.cloudId);
      else if (doc.type === "pptx") await this.bindPptx(doc.cloudId);
      else await this.bindXlsx(doc.cloudId);
      XL.status(XL.t("🟢 Canlı düzenleme açık", "🟢 Live editing on"));
      return true;
    } catch (e) {
      console.error(e);
      alert(XL.t("Canlı düzenlemeye bağlanılamadı: ", "Could not connect to live editing: ") + (e.message || e));
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

    // İmleç konumunu awareness ile paylaş (canlı imleçler).
    this._word.onSel = () => {
      if (!this._aw) return;
      if (document.activeElement !== mode.body) return;
      const car = this._saveCaret(mode.body);
      this._aw.cursor = car ? Object.assign({ kind: "wd" }, car) : null;
      this._sendAwareness();
    };
    document.addEventListener("selectionchange", this._word.onSel);
  },

  _unbindWord() {
    const w = this._word;
    if (!w) return;
    try { w.order.unobserve(w.onChange); w.blocks.unobserve(w.onChange); } catch (e) {}
    try { if (w.body && w.onInput) w.body.removeEventListener("input", w.onInput); } catch (e) {}
    try { if (w.onSel) document.removeEventListener("selectionchange", w.onSel); } catch (e) {}
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
    this._renderCursors();   // uzak imleç konumları kaydı
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

  /* =========================================================================
   * RT4 — PowerPoint editörüne bağlama (slayt + öğe seviyesi)
   * -------------------------------------------------------------------------
   * PPT modeli contenteditable değil, yapılandırılmış JSON'dır:
   *   data = { theme, aspect, footer, slides:[{ id, layout, bg, transition,
   *            notes, elements:[{ id, type, x, y, w, h, html, ... }] }] }
   * CRDT eşlemesi (RT2'deki "birim başına LWW, birimler arası birleşme" fikri):
   *   ppMeta  (Y.Map)   : theme / aspect / footer(JSON)   — sunum geneli
   *   ppOrder (Y.Array) : slayt id sırası
   *   ppSlides(Y.Map)   : slaytId → { layout, bg, transition, notes, els:[elId] }
   *   ppEls   (Y.Map)   : elId → öğe JSON'u        — ÖĞE başına LWW
   * Böylece farklı slaytları / farklı metin kutularını eş zamanlı düzenleme
   * temiz birleşir; yalnız aynı öğeyi aynı anda yazanlar son-yazan-kazanır.
   *
   * Değişiklikler tek kanaldan akar: mod her değişiklikte XL.ws.changed() çağırır
   * → ona bağlanıp (debounce) Y'ye yazarız. Uzak değişiklik gelince data yeniden
   * kurulur + renderAll; ama kullanıcı metin yazıyor / sürüklüyor / not giriyorsa
   * render ertelenir (imleç ve sürükleme bozulmasın).
   * ========================================================================= */

  async bindPptx(docId) {
    const mode = XL.modes.pptx;
    if (!mode || !mode.data || document.body.dataset.mode !== "pptx") {
      throw new Error("Önce bir PowerPoint belgesi açık olmalı.");
    }
    const ydoc = new Y.Doc();
    await this.connect(docId, ydoc);
    await new Promise((r) => setTimeout(r, 400));   // saklı güncellemeler yerleşsin

    const meta = ydoc.getMap("ppMeta");
    const order = ydoc.getArray("ppOrder");
    const slides = ydoc.getMap("ppSlides");
    const els = ydoc.getMap("ppEls");
    this._pptx = { ydoc, meta, order, slides, els, mode, applying: false, pushT: null, renderT: null };

    if (order.length === 0) this._pptxPush();   // ilk kullanıcı: editörden tohumla
    else this._pptxRender();                     // mevcut oda içeriğini yükle

    // Uzak değişiklikleri render et (kendi yerel yazımımızı atla).
    const onChange = (evt, tr) => {
      if (tr && tr.origin === "local") return;
      clearTimeout(this._pptx.renderT);
      this._pptx.renderT = setTimeout(() => this._pptxRender(), 120);
    };
    [meta, order, slides, els].forEach((y) => y.observe(onChange));
    this._pptx.onChange = onChange;

    // Yerel değişiklik → Y: mod XL.ws.changed() üzerinden akar, oraya bağlan (debounce).
    this._pptx.origChanged = XL.ws.changed.bind(XL.ws);
    const self = this;
    XL.ws.changed = function () {
      self._pptx.origChanged();
      if (self._pptx && !self._pptx.applying) {
        clearTimeout(self._pptx.pushT);
        self._pptx.pushT = setTimeout(() => self._pptxPush(), 300);
      }
    };
  },

  _unbindPptx() {
    const p = this._pptx;
    if (!p) return;
    try { [p.meta, p.order, p.slides, p.els].forEach((y) => y.unobserve(p.onChange)); } catch (e) {}
    if (p.origChanged) { try { XL.ws.changed = p.origChanged; } catch (e) {} }
    clearTimeout(p.pushT);
    clearTimeout(p.renderT);
    clearTimeout(p.renderRetry);
    this._pptx = null;
  },

  // Kullanıcı düzenleme/sürükleme/not yazma ortasında mı? (uzak render ertelenir)
  _pptxBusy(mode) {
    return !!(mode.editingId || mode.drag ||
      document.activeElement === document.getElementById("pp-notes"));
  },

  // Editör → Y (yerel durumu yaz; yalnız değişen slayt/öğeleri dokun).
  _pptxPush() {
    const p = this._pptx; if (!p) return;
    const d = p.mode.data;
    Y.transact(p.ydoc, () => {
      if (p.meta.get("theme") !== d.theme) p.meta.set("theme", d.theme);
      if (p.meta.get("aspect") !== d.aspect) p.meta.set("aspect", d.aspect);
      const fj = JSON.stringify(d.footer || {});
      if (p.meta.get("footer") !== fj) p.meta.set("footer", fj);

      const seenS = new Set(), seenE = new Set();
      d.slides.forEach((s) => {
        seenS.add(s.id);
        (s.elements || []).forEach((e) => {
          seenE.add(e.id);
          const ej = JSON.stringify(e);
          if (p.els.get(e.id) !== ej) p.els.set(e.id, ej);
        });
        const srec = JSON.stringify({
          layout: s.layout, bg: s.bg, transition: s.transition,
          notes: s.notes || "", els: (s.elements || []).map((e) => e.id),
        });
        if (p.slides.get(s.id) !== srec) p.slides.set(s.id, srec);
      });
      [...p.slides.keys()].forEach((id) => { if (!seenS.has(id)) p.slides.delete(id); });
      [...p.els.keys()].forEach((id) => { if (!seenE.has(id)) p.els.delete(id); });

      const next = d.slides.map((s) => s.id), cur = p.order.toArray();
      if (cur.length !== next.length || cur.some((b, i) => b !== next[i])) {
        p.order.delete(0, p.order.length);
        p.order.insert(0, next);
      }
    }, "local");
  },

  // Y → editör (uzak durumu uygula; kullanıcı meşgulse ertele).
  _pptxRender() {
    const p = this._pptx; if (!p) return;
    const mode = p.mode;
    if (document.body.dataset.mode !== "pptx" || !mode.data) return;

    // Oda içeriğini data modeline çevir.
    const newSlides = p.order.toArray().map((sid) => {
      const raw = p.slides.get(sid);
      if (!raw) return null;
      const srec = JSON.parse(raw);
      const elements = (srec.els || []).map((eid) => {
        const r = p.els.get(eid);
        return r ? JSON.parse(r) : null;
      }).filter(Boolean);
      return { id: sid, layout: srec.layout, bg: srec.bg, transition: srec.transition, notes: srec.notes || "", elements };
    }).filter(Boolean);
    if (!newSlides.length) return;   // oda henüz tohumlanmadı

    // Kullanıcı yazıyor/sürüklüyorsa: thumb'ları tazele, sahneyi bozma, sonra tekrar dene.
    if (this._pptxBusy(mode)) {
      clearTimeout(p.renderRetry);
      p.renderRetry = setTimeout(() => this._pptxRender(), 700);
      return;
    }

    p.applying = true;
    try {
      mode.data.slides = newSlides;
      const th = p.meta.get("theme"); if (th && mode.THEMES[th]) mode.data.theme = th;
      const asp = p.meta.get("aspect"); if (asp && mode.ASPECTS[asp]) mode.data.aspect = asp;
      const fr = p.meta.get("footer"); if (fr) { try { mode.data.footer = JSON.parse(fr); } catch (e) {} }
      mode.applyAspect();
      mode.cur = Math.max(0, Math.min(mode.cur, newSlides.length - 1));
      if (mode.selId && !newSlides.some((s) => s.elements.some((e) => e.id === mode.selId))) mode.selId = null;
      mode.history = [mode.snap()];   // uzak durum yeni temel; geçmişi sıfırla
      mode.future = [];
      mode.renderAll();
    } finally {
      p.applying = false;
    }
  },

  /* =========================================================================
   * RT5 — Excel editörüne bağlama (hücre seviyesi)  [en zor: HyperFormula + CRDT]
   * -------------------------------------------------------------------------
   * Excel modeli HyperFormula motorudur (hücre ham içeriği) + XL.state.formats
   * (biçimler, "sheetId:r:c") + sayfa listesi + yazdırma düzeni.
   * CRDT eşlemesi (yine "birim başına LWW"; birim = HÜCRE):
   *   xlSheets (Y.Array): sayfa adları/sırası → kanonik sayfa İNDEKSİ (id değil,
   *     çünkü HF id'leri motora göre değişir; indeks istemciler arası kararlı).
   *   xlCells   (Y.Map): "idx:r:c" → ham içerik (formül dahil)
   *   xlFormats (Y.Map): "idx:r:c" → biçim JSON
   *   xlMeta    (Y.Map): rows / cols / page(JSON)
   * Not: satır/sütun ekle-sil, koordinatları kaydırdığı için Y'ye toplu hücre
   * güncellemesi olarak yansır (içerik doğru birleşir; atomik "satır ekle" değil).
   * Uzak değişiklik gelince data Y'den kurulup engine.load + grid.build ile
   * yeniden yüklenir (RT4 felsefesi); kullanıcı yazarken ertelenir, aktif
   * hücre/seçim korunur.
   * ========================================================================= */

  async bindXlsx(docId) {
    if (!XL.state || !XL.state.hf || document.body.dataset.mode !== "xlsx") {
      throw new Error("Önce bir Excel belgesi açık olmalı.");
    }
    const ydoc = new Y.Doc();
    await this.connect(docId, ydoc);
    await new Promise((r) => setTimeout(r, 400));   // saklı güncellemeler yerleşsin

    const xlSheets = ydoc.getArray("xlSheets");
    const xlCells = ydoc.getMap("xlCells");
    const xlFormats = ydoc.getMap("xlFormats");
    const xlMeta = ydoc.getMap("xlMeta");
    this._xl = { ydoc, xlSheets, xlCells, xlFormats, xlMeta, applying: false, pushT: null, renderT: null };

    if (xlSheets.length === 0) this._xlPush();   // ilk kullanıcı: motordan tohumla
    else this._xlRender();                        // mevcut oda içeriğini yükle

    const onChange = (evt, tr) => {
      if (tr && tr.origin === "local") return;
      clearTimeout(this._xl.renderT);
      this._xl.renderT = setTimeout(() => this._xlRender(), 150);
    };
    [xlSheets, xlCells, xlFormats, xlMeta].forEach((y) => y.observe(onChange));
    this._xl.onChange = onChange;

    this._xl.origChanged = XL.ws.changed.bind(XL.ws);
    const self = this;
    XL.ws.changed = function () {
      self._xl.origChanged();
      if (self._xl && !self._xl.applying) {
        clearTimeout(self._xl.pushT);
        self._xl.pushT = setTimeout(() => self._xlPush(), 300);
      }
    };
  },

  _unbindXlsx() {
    const p = this._xl;
    if (!p) return;
    try { [p.xlSheets, p.xlCells, p.xlFormats, p.xlMeta].forEach((y) => y.unobserve(p.onChange)); } catch (e) {}
    if (p.origChanged) { try { XL.ws.changed = p.origChanged; } catch (e) {} }
    clearTimeout(p.pushT);
    clearTimeout(p.renderT);
    clearTimeout(p.renderRetry);
    this._xl = null;
  },

  // Kullanıcı hücre/formül çubuğunda yazıyor mu? (uzak render ertelenir)
  _xlBusy() {
    return !!(XL.grid && XL.grid.editing) ||
      document.activeElement === document.getElementById("formula-input");
  },

  // Motor → Y (yalnız değişen hücre/biçimleri dokun).
  _xlPush() {
    const p = this._xl; if (!p) return;
    const st = XL.state;
    Y.transact(p.ydoc, () => {
      if (p.xlMeta.get("rows") !== XL.ROWS) p.xlMeta.set("rows", XL.ROWS);
      if (p.xlMeta.get("cols") !== XL.COLS) p.xlMeta.set("cols", XL.COLS);
      const pageJson = JSON.stringify(st.page || null);
      if (p.xlMeta.get("page") !== pageJson) p.xlMeta.set("page", pageJson);

      // Sayfa düzeni (sütun genişliği / satır yüksekliği / birleştirme) — sayfa İNDEKSİne göre.
      const layout = {};
      st.sheets.forEach((s, idx) => {
        const l = XL.state.layout && XL.state.layout[s.id];
        if (l && (l.merges.length || Object.keys(l.colWidths).length || Object.keys(l.rowHeights).length)) layout[idx] = l;
      });
      const layoutJson = JSON.stringify(layout);
      if (p.xlMeta.get("layout") !== layoutJson) p.xlMeta.set("layout", layoutJson);

      const names = st.sheets.map((s) => s.name), cur = p.xlSheets.toArray();
      if (cur.length !== names.length || cur.some((n, i) => n !== names[i])) {
        p.xlSheets.delete(0, p.xlSheets.length);
        p.xlSheets.insert(0, names);
      }

      const seenC = new Set(), seenF = new Set();
      st.sheets.forEach((s, idx) => {
        const dims = st.hf.getSheetDimensions(s.id);
        for (let r = 0; r < dims.height; r++)
          for (let c = 0; c < dims.width; c++) {
            const raw = XL.engine.getRaw(r, c, s.id);
            if (raw !== "") { const k = idx + ":" + r + ":" + c; seenC.add(k); if (p.xlCells.get(k) !== raw) p.xlCells.set(k, raw); }
          }
        const prefix = s.id + ":";
        Object.entries(st.formats).forEach(([key, fmt]) => {
          if (!key.startsWith(prefix)) return;
          const k = idx + ":" + key.slice(prefix.length);
          const fj = JSON.stringify(fmt);
          seenF.add(k); if (p.xlFormats.get(k) !== fj) p.xlFormats.set(k, fj);
        });
      });
      [...p.xlCells.keys()].forEach((k) => { if (!seenC.has(k)) p.xlCells.delete(k); });
      [...p.xlFormats.keys()].forEach((k) => { if (!seenF.has(k)) p.xlFormats.delete(k); });
    }, "local");
  },

  // Oda içeriğini XL.engine.load'un beklediği data şekline çevir.
  _xlBuildData() {
    const p = this._xl;
    const names = p.xlSheets.toArray();
    const sheets = names.map((name) => ({ name, cells: {}, formats: {} }));
    p.xlCells.forEach((raw, k) => {
      const [idx, r, c] = k.split(":").map(Number);
      if (sheets[idx]) sheets[idx].cells[r + "," + c] = raw;
    });
    p.xlFormats.forEach((fj, k) => {
      const [idx, r, c] = k.split(":").map(Number);
      if (sheets[idx]) { try { sheets[idx].formats[r + ":" + c] = JSON.parse(fj); } catch (e) {} }
    });
    const data = { rows: p.xlMeta.get("rows") || 100, cols: p.xlMeta.get("cols") || 26, activeSheet: 0, sheets };
    const pr = p.xlMeta.get("page"); if (pr) { try { const pg = JSON.parse(pr); if (pg) data.page = pg; } catch (e) {} }
    const lr = p.xlMeta.get("layout");
    if (lr) { try { const lo = JSON.parse(lr); Object.entries(lo).forEach(([idx, l]) => { if (sheets[idx]) Object.assign(sheets[idx], l); }); } catch (e) {} }
    return data;
  },

  // Y → motor (data yeniden kurulup yüklenir; kullanıcı meşgulse ertele).
  _xlRender() {
    const p = this._xl; if (!p) return;
    if (document.body.dataset.mode !== "xlsx" || !XL.state.hf) return;
    if (!p.xlSheets.length) return;   // oda henüz tohumlanmadı

    if (this._xlBusy()) {
      clearTimeout(p.renderRetry);
      p.renderRetry = setTimeout(() => this._xlRender(), 700);
      return;
    }

    p.applying = true;
    try {
      const st = XL.state, m = XL.modes.xlsx;
      const keepIdx = Math.max(0, st.sheets.findIndex((s) => s.id === st.activeSheetId));
      const keepActive = { ...st.active }, keepSel = { ...st.sel };

      XL.engine.load(this._xlBuildData());

      const ns = st.sheets;
      st.activeSheetId = ns[Math.min(keepIdx, ns.length - 1)].id;
      const clampR = (v) => Math.max(0, Math.min(v, XL.ROWS - 1));
      const clampC = (v) => Math.max(0, Math.min(v, XL.COLS - 1));
      st.active = { r: clampR(keepActive.r), c: clampC(keepActive.c) };
      st.sel = { r1: clampR(keepSel.r1), c1: clampC(keepSel.c1), r2: clampR(keepSel.r2), c2: clampC(keepSel.c2) };

      XL.grid.build();
      m.applyView();
      m.renderSheetTabs();
      m.syncFormulaBar();
    } finally {
      p.applying = false;
    }
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
