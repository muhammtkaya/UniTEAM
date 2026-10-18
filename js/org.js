/* org.js — Organizasyonlar (çok-kiracılık) & yönetim paneli  [Faz 1]
 *
 * Sorumluluk: giriş yapmış kullanıcının ORGANİZASYONLARINI (şirket/ekip) ve
 * org yöneticisiyse ÜYE YÖNETİMİNİ yürütmek. Tüm yetki kontrolleri ve iş
 * kuralları (son-admin koruması, erişim devri, audit) veritabanındaki
 * SECURITY DEFINER RPC'lerindedir (bkz. migration 20261018130000); bu katman
 * yalnız onları çağırır ve arayüzü çizer. RLS her şeyi ayrıca zorlar.
 *
 * UI, cloud.js ile aynı deseni kullanır: XL.showPanel / XL.esc / XL.t.
 */
XL.org = {
  client() { return XL.auth && XL.auth.client; },
  enabled() { return !!(this.client() && XL.auth.user); },
  _assert() {
    if (!this.client()) throw new Error("Supabase istemcisi yok.");
    if (!XL.auth.user) throw new Error("Giriş yapılmamış.");
  },
  async _rpc(fn, args) {
    this._assert();
    const { data, error } = await this.client().rpc(fn, args || {});
    if (error) throw error;
    return data;
  },

  /* ---------- Veri (RPC sarmalayıcıları) ---------- */
  createOrg(name)                 { return this._rpc("create_organization", { p_name: name }); },
  listMine()                      { return this._rpc("list_my_organizations"); },
  listMembers(orgId)              { return this._rpc("list_org_members", { p_org: orgId }); },
  listInvites(orgId)              { return this._rpc("list_org_invites", { p_org: orgId }); },
  invite(orgId, email, role)      { return this._rpc("invite_to_org", { p_org: orgId, p_email: email, p_role: role }); },
  acceptInvite(token)             { return this._rpc("accept_org_invite", { p_token: token }); },
  setRole(orgId, userId, role)    { return this._rpc("set_member_role", { p_org: orgId, p_user: userId, p_role: role }); },
  setStatus(orgId, userId, st)    { return this._rpc("set_member_status", { p_org: orgId, p_user: userId, p_status: st }); },
  removeMember(orgId, userId)     { return this._rpc("remove_member", { p_org: orgId, p_user: userId }); },
  transferDoc(docId, newOwner)    { return this._rpc("transfer_document_ownership", { p_doc: docId, p_new_owner: newOwner }); },
  moveDoc(docId, orgId)           { return this._rpc("move_document_to_org", { p_doc: docId, p_org: orgId }); },
  listDocs(orgId)                 { return this._rpc("list_org_documents", { p_org: orgId }); },
  listAudit(orgId)                { return this._rpc("list_audit_log", { p_org: orgId }); },

  inviteUrl(token) { return location.origin + location.pathname + "?invite=" + token; },

  // Açılışta ?invite=<token> varsa: giriş varsa kabul et, yoksa giriş iste.
  async handleUrlInvite() {
    const token = new URLSearchParams(location.search).get("invite");
    if (!token) return;
    if (!this.enabled()) { if (XL.auth && !XL.auth.user) XL.auth.openModal(); return; }
    history.replaceState(null, "", location.origin + location.pathname);
    try {
      const org = await this.acceptInvite(token);
      XL.status(XL.t("Organizasyona katıldınız: ", "Joined organization: ") + (org && org.name ? org.name : ""));
      this.openPanel();
    } catch (e) {
      alert(XL.t("Davet kabul edilemedi: ", "Could not accept invite: ") + (e.message || e));
    }
  },

  /* ---------- UI ---------- */

  // Organizasyon listesi + oluştur.
  async openPanel() {
    if (!this.enabled()) return alert(XL.t("Önce giriş yapın (👤 Giriş).", "Sign in first (👤 Sign in)."));
    XL.showPanel(XL.t("Organizasyonlarım", "My Organizations"), `<p class="muted">${XL.t("Yükleniyor…", "Loading…")}</p>`);
    const body = document.getElementById("panel-body");
    let rows;
    try { rows = await this.listMine(); }
    catch (e) { body.innerHTML = `<p class="muted">${XL.t("Hata: ", "Error: ")}${XL.esc(e.message || String(e))}</p>`; return; }

    const roleLbl = { admin: XL.t("Yönetici", "Admin"), member: XL.t("Üye", "Member") };
    const list = rows.length
      ? '<div class="org-list">' + rows.map((o) => `
          <div class="org-item" data-id="${o.id}" data-name="${XL.esc(o.name)}" data-role="${o.org_role}">
            <span class="oi-ic">🏢</span>
            <span class="oi-name">${XL.esc(o.name)}
              <small class="oi-meta">${roleLbl[o.org_role]} · ${o.member_count} ${XL.t("üye", "member(s)")}${o.status === "suspended" ? " · " + XL.t("askıda", "suspended") : ""}</small>
            </span>
            ${o.org_role === "admin" ? `<button class="oi-manage" data-manage="${o.id}">${XL.t("Yönet", "Manage")} →</button>` : ""}
          </div>`).join("") + "</div>"
      : `<p class="muted">${XL.t("Henüz bir organizasyonun yok.", "You don't belong to any organization yet.")}</p>`;

    body.innerHTML = `
      <div class="org-ui">
        ${list}
        <div class="share-sub">${XL.t("Yeni organizasyon", "New organization")}</div>
        <div class="share-form">
          <input type="text" id="org-new-name" placeholder="${XL.t("Örn. Acme A.Ş.", "e.g. Acme Inc.")}">
          <button id="org-create" class="share-add">${XL.t("Oluştur", "Create")}</button>
        </div>
        <div class="share-sub">${XL.t("Davet kodum var", "I have an invite code")}</div>
        <div class="share-form">
          <input type="text" id="org-invite-code" placeholder="${XL.t("davet kodu", "invite code")}">
          <button id="org-join" class="share-add">${XL.t("Katıl", "Join")}</button>
        </div>
        <div id="org-msg" class="share-msg hidden"></div>
      </div>`;

    const msg = (t, kind) => { const e = document.getElementById("org-msg"); if (!e) return; e.textContent = t || ""; e.className = "share-msg" + (t ? " " + (kind || "error") : " hidden"); };

    body.querySelectorAll("[data-manage]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const item = b.closest(".org-item");
      this.openManage(b.dataset.manage, item.dataset.name);
    }));
    document.getElementById("org-create").addEventListener("click", async () => {
      const name = document.getElementById("org-new-name").value.trim();
      if (!name) return msg(XL.t("Ad girin.", "Enter a name."));
      msg("");
      try { await this.createOrg(name); this.openPanel(); }
      catch (e) { msg(e.message || String(e)); }
    });
    document.getElementById("org-join").addEventListener("click", async () => {
      const code = document.getElementById("org-invite-code").value.trim();
      if (!code) return msg(XL.t("Davet kodu girin.", "Enter an invite code."));
      msg("");
      try { const org = await this.acceptInvite(code); msg(XL.t("Katıldınız: ", "Joined: ") + (org.name || ""), "ok"); setTimeout(() => this.openPanel(), 600); }
      catch (e) { msg(this._err(e)); }
    });
  },

  // Bir organizasyonu yönet (üyeler + belgeler + denetim) — yalnız admin.
  async openManage(orgId, orgName) {
    XL.showPanel(XL.t("Yönetim — ", "Manage — ") + (orgName || ""), `
      <div class="org-ui">
        <button class="share-back" id="org-back">← ${XL.t("Organizasyonlarım", "My Organizations")}</button>
        <div class="org-tabs">
          <button class="org-tab active" data-tab="members">${XL.t("Üyeler", "Members")}</button>
          <button class="org-tab" data-tab="docs">${XL.t("Belgeler", "Documents")}</button>
          <button class="org-tab" data-tab="audit">${XL.t("Denetim", "Audit")}</button>
        </div>
        <div id="org-msg" class="share-msg hidden"></div>
        <div id="org-tabpane"></div>
      </div>`);
    document.getElementById("org-back").addEventListener("click", () => this.openPanel());
    const tabs = document.querySelectorAll(".org-tab");
    tabs.forEach((t) => t.addEventListener("click", () => {
      tabs.forEach((x) => x.classList.toggle("active", x === t));
      this._renderTab(orgId, t.dataset.tab);
    }));
    this._renderTab(orgId, "members");
  },

  _msg(t, kind) { const e = document.getElementById("org-msg"); if (!e) return; e.textContent = t || ""; e.className = "share-msg" + (t ? " " + (kind || "error") : " hidden"); },

  async _renderTab(orgId, tab) {
    const pane = document.getElementById("org-tabpane");
    if (!pane) return;
    pane.innerHTML = `<p class="muted">${XL.t("Yükleniyor…", "Loading…")}</p>`;
    try {
      if (tab === "members") return this._renderMembers(orgId, pane);
      if (tab === "docs")    return this._renderDocs(orgId, pane);
      if (tab === "audit")   return this._renderAudit(orgId, pane);
    } catch (e) { pane.innerHTML = `<p class="muted">${XL.t("Hata: ", "Error: ")}${XL.esc(e.message || String(e))}</p>`; }
  },

  async _renderMembers(orgId, pane) {
    const roles = [["member", XL.t("Üye", "Member")], ["admin", XL.t("Yönetici", "Admin")]];
    const [members, invites] = await Promise.all([this.listMembers(orgId), this.listInvites(orgId).catch(() => [])]);
    const me = XL.auth.user.id;
    const roleName = Object.fromEntries(roles);
    const memHtml = members.map((m) => {
      const self = m.user_id === me;
      return `<div class="org-row" data-uid="${m.user_id}">
        <span class="or-email">${XL.esc(m.name || m.email)}${self ? ` <small>(${XL.t("siz", "you")})</small>` : ""}${m.status === "suspended" ? ` <small class="or-susp">${XL.t("askıda", "suspended")}</small>` : ""}</span>
        <select class="or-role" data-uid="${m.user_id}">${roles.map(([v, l]) => `<option value="${v}"${v === m.org_role ? " selected" : ""}>${l}</option>`).join("")}</select>
        <button class="or-susp-btn" data-uid="${m.user_id}" data-status="${m.status}">${m.status === "active" ? XL.t("Askıya al", "Suspend") : XL.t("Etkinleştir", "Reactivate")}</button>
        <button class="sr-del" data-del="${m.user_id}" title="${XL.t("Çıkar", "Remove")}">✕</button>
      </div>`;
    }).join("");
    const invHtml = invites.length
      ? `<div class="share-sub">${XL.t("Bekleyen davetler", "Pending invites")}</div>` + invites.map((i) => `
          <div class="org-row">
            <span class="or-email">${XL.esc(i.email)} <small>(${roleName[i.org_role] || i.org_role})</small></span>
            <button class="lk-copy" data-code="${i.token}">📋 ${XL.t("Kodu kopyala", "Copy code")}</button>
          </div>`).join("")
      : "";

    pane.innerHTML = `
      <div class="share-form">
        <input type="email" id="org-inv-email" placeholder="${XL.t("kullanici@eposta.com", "user@email.com")}">
        <select id="org-inv-role">${roles.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
        <button id="org-inv-add" class="share-add">${XL.t("Davet et", "Invite")}</button>
      </div>
      <div class="share-sub">${XL.t("Üyeler", "Members")}</div>
      <div class="org-members">${memHtml}</div>
      ${invHtml}`;

    const reload = () => this._renderTab(orgId, "members");
    document.getElementById("org-inv-add").addEventListener("click", async () => {
      const email = document.getElementById("org-inv-email").value.trim();
      const role = document.getElementById("org-inv-role").value;
      if (!email) return this._msg(XL.t("E-posta girin.", "Enter an email."));
      this._msg("");
      try {
        const r = await this.invite(orgId, email, role);
        if (r && r.kind === "invite") {
          const url = this.inviteUrl(r.token);
          try { await navigator.clipboard.writeText(url); } catch { /* yoksay */ }
          this._msg(XL.t("Davet oluşturuldu (bağlantı kopyalandı): ", "Invite created (link copied): ") + email, "ok");
        } else {
          this._msg(XL.t("Üye eklendi: ", "Member added: ") + email, "ok");
        }
        reload();
      } catch (e) { this._msg(this._err(e)); }
    });
    pane.querySelectorAll(".or-role").forEach((s) => s.addEventListener("change", async () => {
      this._msg("");
      try { await this.setRole(orgId, s.dataset.uid, s.value); reload(); }
      catch (e) { this._msg(this._err(e)); reload(); }
    }));
    pane.querySelectorAll(".or-susp-btn").forEach((b) => b.addEventListener("click", async () => {
      this._msg("");
      const next = b.dataset.status === "active" ? "suspended" : "active";
      try { await this.setStatus(orgId, b.dataset.uid, next); reload(); }
      catch (e) { this._msg(this._err(e)); }
    }));
    pane.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm(XL.t("Bu üye çıkarılsın mı? (org belgeleri bir yöneticiye devredilir)", "Remove this member? (their org documents transfer to an admin)"))) return;
      this._msg("");
      try { await this.removeMember(orgId, b.dataset.del); reload(); }
      catch (e) { this._msg(this._err(e)); }
    }));
    pane.querySelectorAll(".lk-copy").forEach((b) => b.addEventListener("click", async () => {
      const url = this.inviteUrl(b.dataset.code);
      try { await navigator.clipboard.writeText(url); this._msg(XL.t("Davet bağlantısı kopyalandı", "Invite link copied"), "ok"); }
      catch { prompt(XL.t("Bağlantıyı kopyalayın:", "Copy the link:"), url); }
    }));
  },

  async _renderDocs(orgId, pane) {
    const [docs, members] = await Promise.all([this.listDocs(orgId), this.listMembers(orgId)]);
    const icon = { xlsx: "📊", docx: "📄", pptx: "📙" };
    if (!docs.length) { pane.innerHTML = `<p class="muted">${XL.t("Bu organizasyona bağlı belge yok.", "No documents linked to this organization.")}</p>`; return; }
    const owners = members.map((m) => [m.user_id, m.name || m.email]);
    pane.innerHTML = '<div class="org-members">' + docs.map((d) => `
      <div class="org-row" data-doc="${d.id}">
        <span class="or-email">${icon[d.type] || "📄"} ${XL.esc(d.name)}${d.trashed ? ` <small>(${XL.t("çöpte", "trashed")})</small>` : ""}
          <small class="oi-meta">${XL.t("sahip", "owner")}: ${XL.esc(d.owner_email)}</small></span>
        <select class="od-owner" data-doc="${d.id}">${owners.map(([id, nm]) => `<option value="${id}"${id === d.owner_id ? " selected" : ""}>${XL.esc(nm)}</option>`).join("")}</select>
      </div>`).join("") + "</div>" +
      `<p class="muted">${XL.t("Sahibi değiştirmek erişimi devreder (ör. ayrılan çalışandan).", "Changing the owner transfers access (e.g. from a departed employee).")}</p>`;
    pane.querySelectorAll(".od-owner").forEach((s) => s.addEventListener("change", async () => {
      this._msg("");
      try { await this.transferDoc(s.dataset.doc, s.value); this._msg(XL.t("Sahiplik devredildi.", "Ownership transferred."), "ok"); }
      catch (e) { this._msg(this._err(e)); this._renderTab(orgId, "docs"); }
    }));
  },

  async _renderAudit(orgId, pane) {
    const rows = await this.listAudit(orgId);
    if (!rows.length) { pane.innerHTML = `<p class="muted">${XL.t("Henüz denetim kaydı yok.", "No audit entries yet.")}</p>`; return; }
    const label = {
      "org.create": XL.t("organizasyon kuruldu", "organization created"),
      "member.add": XL.t("üye eklendi", "member added"),
      "member.role": XL.t("rol değişti", "role changed"),
      "member.status": XL.t("durum değişti", "status changed"),
      "member.remove": XL.t("üye çıkarıldı", "member removed"),
      "invite.create": XL.t("davet oluşturuldu", "invite created"),
      "invite.accept": XL.t("davet kabul edildi", "invite accepted"),
      "doc.transfer": XL.t("belge devredildi", "document transferred"),
      "doc.move": XL.t("belge taşındı", "document moved"),
    };
    pane.innerHTML = '<div class="org-audit">' + rows.map((a) => {
      const when = new Date(a.created_at).toLocaleString();
      const meta = a.metadata ? Object.entries(a.metadata).map(([k, v]) => `${XL.esc(k)}=${XL.esc(String(v))}`).join(", ") : "";
      return `<div class="au-row">
        <span class="au-act">${label[a.action] || XL.esc(a.action)}</span>
        <span class="au-by">${XL.esc(a.actor_email || "—")}</span>
        ${meta ? `<span class="au-meta">${meta}</span>` : ""}
        <span class="au-when">${XL.esc(when)}</span>
      </div>`;
    }).join("") + "</div>";
  },

  _err(e) {
    const m = (e && e.message) || String(e);
    if (/zaten üye/i.test(m)) return XL.t("Bu kişi zaten üye.", "This person is already a member.");
    if (/Son yöneticiyi|Son aktif yönetici/i.test(m)) return XL.t("Son yönetici işlemi engellendi (önce başka yönetici atayın).", "Last-admin action blocked (assign another admin first).");
    if (/başka bir e-postaya/i.test(m)) return XL.t("Bu davet başka bir e-postaya ait.", "This invite belongs to another email.");
    if (/Geçersiz veya kullanılmış/i.test(m)) return XL.t("Geçersiz veya kullanılmış davet.", "Invalid or already-used invite.");
    if (/aktif üyesi olmalı|üyesi değil/i.test(m)) return XL.t("İlgili kişi bu organizasyonun aktif üyesi olmalı.", "The person must be an active member of this organization.");
    return m;
  },
};
