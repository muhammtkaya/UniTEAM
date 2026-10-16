/* comments.js — Yorumlar & @bahsetmeler & bildirimler (işbirliği, Bölüm 3)
 *
 * Veri: Supabase (document_comments / comment_mentions / notifications) +
 * RPC'ler (add_comment, list_comments, list_document_collaborators,
 * list_notifications). Yetki RLS'te; UI yalnız okur/yazar.
 *
 * Oluşturma add_comment RPC'siyle yapılır (bahsetme + bildirim atomik).
 * Okuma/çözme/silme doğrudan tabloya (RLS author/owner sınırlar).
 */
XL.comments = {
  _docId: null,
  _collab: [],      // [{user_id,email,name,role}]
  _replyTo: null,   // yanıtlanan yorum id'si
  _badgeTimer: null,

  client() { return XL.auth && XL.auth.client; },
  enabled() { return !!(XL.cloud && XL.cloud.enabled()); },

  /* ---------- Veri ---------- */
  async listCollaborators(docId) {
    const { data, error } = await this.client().rpc("list_document_collaborators", { p_document_id: docId });
    if (error) throw error;
    return data || [];
  },
  async list(docId) {
    const { data, error } = await this.client().rpc("list_comments", { p_document_id: docId });
    if (error) throw error;
    return data || [];
  },
  async add(docId, body, { parent = null, anchor = null, mentions = [] } = {}) {
    const { data, error } = await this.client().rpc("add_comment", {
      p_document_id: docId, p_body: body, p_parent_id: parent, p_anchor: anchor, p_mentions: mentions,
    });
    if (error) throw error;
    return data;
  },
  async setResolved(id, resolved) {
    const { error } = await this.client().from("document_comments").update({ resolved }).eq("id", id);
    if (error) throw error;
  },
  async remove(id) {
    const { error } = await this.client().from("document_comments").delete().eq("id", id);
    if (error) throw error;
  },

  async listNotifications() {
    const { data, error } = await this.client().rpc("list_notifications");
    if (error) throw error;
    return data || [];
  },
  async unreadCount() {
    const { count, error } = await this.client()
      .from("notifications").select("id", { count: "exact", head: true }).eq("read", false);
    if (error) return 0;
    return count || 0;
  },
  async markRead(id) { await this.client().from("notifications").update({ read: true }).eq("id", id); },
  async markAllRead() { await this.client().from("notifications").update({ read: true }).eq("read", false); },

  /* ---------- Yardımcılar ---------- */
  _timeAgo(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "az önce";
    if (s < 3600) return Math.floor(s / 60) + " dk önce";
    if (s < 86400) return Math.floor(s / 3600) + " sa önce";
    return new Date(iso).toLocaleDateString("tr-TR");
  },
  // Gövdedeki @token'ları katılımcılarla eşleştir → user_id listesi
  _parseMentions(body) {
    const ids = new Set();
    (body.match(/@([^\s@]+)/g) || []).forEach((tok) => {
      const t = tok.slice(1).toLocaleLowerCase("tr");
      const hit = this._collab.find((c) =>
        c.email.toLocaleLowerCase("tr") === t ||
        c.email.split("@")[0].toLocaleLowerCase("tr") === t ||
        (c.name || "").toLocaleLowerCase("tr").replace(/\s+/g, "") === t);
      if (hit) ids.add(hit.user_id);
    });
    return [...ids];
  },
  _highlight(body) {
    return XL.esc(body).replace(/@([^\s@]+)/g, '<span class="cmt-at">@$1</span>');
  },
  _myRole() {
    const me = XL.auth.user && XL.auth.user.id;
    const c = this._collab.find((x) => x.user_id === me);
    return c ? c.role : null;
  },

  /* ---------- Konum bağlama (anchor) ---------- */
  // Etkin belgedeki geçerli seçimi bir anchor nesnesine çevir (yoksa null).
  // anchor jsonb olarak saklanır; label gösterim için denormalize edilir.
  _captureAnchor() {
    const doc = XL.ws.active();
    if (!doc) return null;
    if (doc.type === "xlsx" && XL.state && XL.state.sheets && XL.state.sheets.length) {
      const idx = XL.state.sheets.findIndex((s) => s.id === XL.state.activeSheetId);
      const a = XL.state.active || { r: 0, c: 0 };
      const multi = XL.state.sheets.length > 1;
      const label = (multi ? XL.state.sheets[idx].name + "!" : "") + XL.addrLabel(a.r, a.c);
      return { kind: "xlsx", sheet: idx, r: a.r, c: a.c, label };
    }
    if (doc.type === "docx") {
      const body = XL.modes.docx && XL.modes.docx.body;
      if (!body) return null;
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return null;
      let n = sel.getRangeAt(0).startContainer;
      n = n.nodeType === 1 ? n : n.parentElement;
      let top = n;
      while (top && top.parentElement !== body) top = top.parentElement;
      if (!top || top.parentElement !== body) return null;
      const bi = [...body.children].indexOf(top);
      if (bi < 0) return null;
      return { kind: "docx", bi, label: "Paragraf " + (bi + 1) };
    }
    if (doc.type === "pptx") {
      const m = XL.modes.pptx;
      if (!m || !m.data) return null;
      return { kind: "pptx", slide: m.cur || 0, el: m.selId || null, label: "Slayt " + ((m.cur || 0) + 1) + (m.selId ? " · öğe" : "") };
    }
    return null;
  },

  // Bir anchor'a git (etkin belge anchor.kind ile aynı olmalı).
  _gotoAnchor(anchor) {
    if (!anchor || !anchor.kind) return;
    const doc = XL.ws.active();
    if (!doc || doc.type !== anchor.kind) { XL.status("Yorum konumu bu belgede değil."); return; }
    if (anchor.kind === "xlsx") {
      const m = XL.modes.xlsx;
      const sid = XL.state.sheets[anchor.sheet] && XL.state.sheets[anchor.sheet].id;
      if (sid != null && sid !== XL.state.activeSheetId) m.switchSheet(sid);
      XL.state.active = { r: anchor.r, c: anchor.c };
      XL.state.sel = { r1: anchor.r, c1: anchor.c, r2: anchor.r, c2: anchor.c };
      XL.grid.updateSelection();   // seçime kaydırır
      const td = XL.grid.cells[anchor.r] && XL.grid.cells[anchor.r][anchor.c];
      if (td) { td.classList.add("cmt-flash"); setTimeout(() => td.classList.remove("cmt-flash"), 1200); }
    } else if (anchor.kind === "docx") {
      const body = XL.modes.docx && XL.modes.docx.body;
      const el = body && body.children[anchor.bi];
      if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("cmt-flash"); setTimeout(() => el.classList.remove("cmt-flash"), 1200); }
    } else if (anchor.kind === "pptx") {
      const m = XL.modes.pptx;
      m.goTo(anchor.slide || 0);
      if (anchor.el) m.select(anchor.el);
    }
  },

  /* ---------- Yorum paneli ---------- */
  async openComments(docId, docName, anchor) {
    this._docId = docId;
    this._replyTo = null;
    this._pendingAnchor = anchor || null;
    XL.showPanel("💬 Yorumlar — " + (docName || ""), `
      <div id="cmt-wrap">
        <div id="cmt-list"><p class="muted">Yükleniyor…</p></div>
        <div id="cmt-compose">
          <div id="cmt-replybar" class="hidden"></div>
          <div id="cmt-anchorbar" class="hidden"></div>
          <textarea id="cmt-body" rows="2" placeholder="Yorum yaz…  @ ile birini bahset"></textarea>
          <div id="cmt-collab" class="cmt-chips"></div>
          <div class="cmt-send-row"><button id="cmt-send">Gönder</button>
            <span id="cmt-msg" class="muted"></span></div>
        </div>
      </div>`);
    try {
      this._collab = await this.listCollaborators(docId);
    } catch (e) { this._collab = []; }
    // Bahsetme ipucu çipleri
    const chips = document.getElementById("cmt-collab");
    const me = XL.auth.user && XL.auth.user.id;
    chips.innerHTML = this._collab.filter((c) => c.user_id !== me)
      .map((c) => `<button class="cmt-chip" data-at="${XL.esc(c.email.split("@")[0])}" title="${XL.esc(c.email)}">@${XL.esc(c.name || c.email.split("@")[0])}</button>`).join("")
      || '<span class="muted">Bahsetmek için belgeyi paylaşın.</span>';
    chips.querySelectorAll(".cmt-chip").forEach((b) => b.onclick = () => {
      const ta = document.getElementById("cmt-body");
      ta.value += (ta.value && !ta.value.endsWith(" ") ? " " : "") + "@" + b.dataset.at + " ";
      ta.focus();
    });
    this._renderAnchorBar();
    document.getElementById("cmt-send").onclick = () => this._send();
    document.getElementById("cmt-body").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this._send(); }
    });
    await this._refreshList();
  },

  _renderAnchorBar() {
    const bar = document.getElementById("cmt-anchorbar");
    if (!bar) return;
    if (!this._pendingAnchor) { bar.classList.add("hidden"); bar.innerHTML = ""; return; }
    bar.classList.remove("hidden");
    bar.innerHTML = `📍 Konuma iliştiriliyor: <b>${XL.esc(this._pendingAnchor.label || "")}</b> <button id="cmt-anchorclear" title="İliştirmeyi kaldır">✕</button>`;
    document.getElementById("cmt-anchorclear").onclick = () => { this._pendingAnchor = null; this._renderAnchorBar(); };
  },

  async _refreshList() {
    const box = document.getElementById("cmt-list");
    if (!box) return;
    let rows;
    try { rows = await this.list(this._docId); }
    catch (e) { box.innerHTML = `<p class="muted">Yüklenemedi: ${XL.esc(e.message || "")}</p>`; return; }
    if (!rows.length) { box.innerHTML = '<p class="muted">Henüz yorum yok. İlk yorumu siz yazın.</p>'; return; }

    const me = XL.auth.user && XL.auth.user.id;
    const owner = this._myRole() === "owner";
    const byParent = {};
    rows.forEach((r) => { const k = r.parent_id || "_root"; (byParent[k] = byParent[k] || []).push(r); });

    const card = (r, isReply) => {
      const canMod = r.author_id === me || owner;
      const mentions = (r.mentions || []).length
        ? `<div class="cmt-mentions">${r.mentions.map((m) => `<span class="cmt-at">@${XL.esc(m.split("@")[0])}</span>`).join(" ")}</div>` : "";
      const anchor = r.anchor && r.anchor.label
        ? `<button class="cmt-anchor" data-goto="1" title="Konuma git">📍 ${XL.esc(r.anchor.label)}</button>` : "";
      const replies = (byParent[r.id] || []).map((c) => card(c, true)).join("");
      return `
        <div class="cmt${isReply ? " cmt-reply" : ""}${r.resolved ? " cmt-resolved" : ""}" data-id="${r.id}">
          <div class="cmt-head">
            <b>${XL.esc(r.author_name || r.author_email)}</b>
            <span class="muted">${this._timeAgo(r.created_at)}</span>
            ${r.resolved ? '<span class="cmt-badge">çözüldü</span>' : ""}
            ${anchor}
          </div>
          <div class="cmt-text">${this._highlight(r.body)}</div>
          ${mentions}
          <div class="cmt-row">
            ${isReply ? "" : `<button data-act="reply">↩ Yanıtla</button>`}
            ${canMod ? `<button data-act="resolve">${r.resolved ? "↺ Aç" : "✓ Çöz"}</button>` : ""}
            ${canMod ? `<button data-act="del">🗑 Sil</button>` : ""}
          </div>
          ${replies ? `<div class="cmt-replies">${replies}</div>` : ""}
        </div>`;
    };
    box.innerHTML = (byParent._root || []).map((r) => card(r, false)).join("");

    // Konuma git (📍) — her yorumun anchor'ını id ile eşle.
    const anchorById = {};
    rows.forEach((r) => { if (r.anchor && r.anchor.label) anchorById[r.id] = r.anchor; });
    box.querySelectorAll(".cmt-anchor[data-goto]").forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      this._gotoAnchor(anchorById[b.closest(".cmt").dataset.id]);
    });

    box.querySelectorAll("[data-act]").forEach((b) => b.onclick = async () => {
      const id = b.closest(".cmt").dataset.id;
      const act = b.dataset.act;
      try {
        if (act === "reply") this._setReply(id, box);
        else if (act === "resolve") { const row = box.querySelector(`.cmt[data-id="${id}"]`); await this.setResolved(id, !row.classList.contains("cmt-resolved")); await this._refreshList(); }
        else if (act === "del") { if (confirm("Yorum silinsin mi?")) { await this.remove(id); await this._refreshList(); } }
      } catch (e) { alert("İşlem başarısız: " + (e.message || e)); }
    });
  },

  _setReply(id, box) {
    this._replyTo = id;
    const bar = document.getElementById("cmt-replybar");
    const row = box.querySelector(`.cmt[data-id="${id}"] .cmt-head b`);
    bar.classList.remove("hidden");
    bar.innerHTML = `↩ <b>${row ? row.textContent : ""}</b> kişisine yanıt <button id="cmt-replycancel">✕</button>`;
    document.getElementById("cmt-replycancel").onclick = () => { this._replyTo = null; bar.classList.add("hidden"); };
    document.getElementById("cmt-body").focus();
  },

  async _send() {
    const ta = document.getElementById("cmt-body");
    const msg = document.getElementById("cmt-msg");
    const body = ta.value.trim();
    if (!body) return;
    msg.textContent = "Gönderiliyor…";
    try {
      // Yanıtlarda anchor taşınmaz (kök yoruma ait); yalnız kök yorumda iliştir.
      const anchor = this._replyTo ? null : this._pendingAnchor;
      await this.add(this._docId, body, { parent: this._replyTo, anchor, mentions: this._parseMentions(body) });
      ta.value = ""; msg.textContent = "";
      this._replyTo = null;
      this._pendingAnchor = null; this._renderAnchorBar();
      const bar = document.getElementById("cmt-replybar"); if (bar) bar.classList.add("hidden");
      await this._refreshList();
      this.refreshBadge();
    } catch (e) {
      msg.textContent = "Hata: " + (e.message || e);
    }
  },

  /* ---------- Bildirimler ---------- */
  async refreshBadge() {
    const btn = document.getElementById("btn-notif");
    if (!btn) return;
    if (!this.enabled()) { btn.classList.add("hidden"); return; }
    btn.classList.remove("hidden");
    let n = 0;
    try { n = await this.unreadCount(); } catch (e) {}
    btn.dataset.count = n;
    btn.classList.toggle("has-unread", n > 0);
    btn.title = n > 0 ? n + " okunmamış bildirim" : "Bildirimler";
    btn.innerHTML = n > 0 ? `🔔<span class="notif-badge">${n > 9 ? "9+" : n}</span>` : "🔔";
  },

  async openNotifications() {
    XL.showPanel("🔔 Bildirimler", '<div id="ntf-list"><p class="muted">Yükleniyor…</p></div>');
    const box = document.getElementById("ntf-list");
    let rows;
    try { rows = await this.listNotifications(); }
    catch (e) { box.innerHTML = `<p class="muted">Yüklenemedi: ${XL.esc(e.message || "")}</p>`; return; }
    if (!rows.length) { box.innerHTML = '<p class="muted">Bildirim yok.</p>'; return; }

    box.innerHTML = `<div class="ntf-top"><button id="ntf-allread">Tümünü okundu işaretle</button></div>` +
      rows.map((r) => `
        <div class="ntf${r.read ? "" : " ntf-unread"}" data-id="${r.id}" data-doc="${r.document_id || ""}">
          <div class="ntf-text"><b>${XL.esc((r.actor_email || "Biri").split("@")[0])}</b>
            sizi bir yorumda bahsetti${r.document_name ? ` · <i>${XL.esc(r.document_name)}</i>` : ""}</div>
          ${r.excerpt ? `<div class="ntf-ex muted">"${XL.esc(r.excerpt)}"</div>` : ""}
          <div class="muted ntf-time">${this._timeAgo(r.created_at)}</div>
        </div>`).join("");

    document.getElementById("ntf-allread").onclick = async () => { await this.markAllRead(); await this.openNotifications(); this.refreshBadge(); };
    box.querySelectorAll(".ntf").forEach((el) => el.onclick = async () => {
      const id = el.dataset.id, docId = el.dataset.doc;
      try { await this.markRead(id); } catch (e) {}
      this.refreshBadge();
      if (docId) {
        try {
          const existing = XL.ws.docs.find((d) => d.cloudId === docId);
          if (existing) XL.ws.activate(existing.id); else await XL.cloud.openDoc(docId);
          const doc = XL.ws.active();
          this.openComments(docId, doc ? doc.name : "");
        } catch (e) { alert("Belge açılamadı: " + (e.message || e)); }
      }
    });
  },

  /* ---------- Bağlama ---------- */
  bind() {
    const cbtn = document.getElementById("btn-comments");
    if (cbtn) cbtn.onclick = async () => {
      if (!this.enabled()) return alert("Yorumlar için giriş yapın.");
      const doc = XL.ws.active();
      if (!doc) return;
      const anchor = this._captureAnchor();   // panel açılmadan ÖNCE (seçim hâlâ editörde)
      if (!doc.cloudId) {
        if (!confirm("Yorum yapmak için belge buluta kaydedilsin mi?")) return;
        try { await XL.cloud.saveActive(); } catch (e) { return alert("Kaydedilemedi: " + (e.message || e)); }
      }
      this.openComments(XL.ws.active().cloudId, doc.name, anchor);
    };
    const nbtn = document.getElementById("btn-notif");
    if (nbtn) nbtn.onclick = () => this.openNotifications();

    // Rozet: açılışta + oturum değişince + periyodik (45 sn).
    const tick = () => this.refreshBadge();
    if (XL.auth && XL.auth.client) {
      try { XL.auth.client.auth.onAuthStateChange(() => tick()); } catch (e) {}
    }
    setTimeout(tick, 1500);
    clearInterval(this._badgeTimer);
    this._badgeTimer = setInterval(() => { if (this.enabled()) tick(); }, 45000);
  },
};

window.addEventListener("DOMContentLoaded", () => XL.comments.bind());
