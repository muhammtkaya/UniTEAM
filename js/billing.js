/* billing.js — XL.billing: plan / koltuk / kota + faturalandırma paneli  [Faz 3, A5]
 *
 * İş modelinin KULLANICI YÜZÜ. Sunucu tarafı (migration 20261019130000):
 *   • plans KATALOĞU + subscriptions (çift özneli: org VEYA kişisel)
 *   • KOTA ENFORCEMENT: belge sayısı (trigger) + koltuk (invite/accept RPC)
 *   • RPC'ler: list_plans / get_subscription / change_plan (ÖDEME SİMÜLASYONU)
 *
 * ⚠️ Gerçek ödeme (Stripe checkout/webhook) = Faz 9. change_plan() ödeme sonrası
 * durumu simüle eder; panel bunu açıkça belirtir.
 *
 * PLAN_META: katalog aynası — fiyat/kota KARTLARINI AĞ OLMADAN (ve giriş olmadan)
 * çizebilmek için. Yetkili kaynak DB'dir; bu yalnız gösterimdir. Güncel kullanım
 * (belge/üye/depolama) girişliyken get_subscription ile canlı çekilir.
 *
 * UI: hesap menüsünden (kişisel) ve org yönetim panelinden (Plan sekmesi) açılır;
 * cloud.js / org.js ile aynı deseni kullanır (XL.showPanel / XL.esc / XL.t).
 */
XL.billing = {
  // Katalog aynası (DB plans tablosuyla eşleşir; -1 = sınırsız, price = ¢/ay).
  TIERS: ["free", "pro", "team", "enterprise"],
  PLAN_META: {
    free:       { name: "Free",       price: 0,    perSeat: false, seats: 3,  storageMb: 100,    docs: 25 },
    pro:        { name: "Pro",        price: 900,  perSeat: false, seats: 5,  storageMb: 5120,   docs: 500 },
    team:       { name: "Team",       price: 1200, perSeat: true,  seats: 25, storageMb: 102400, docs: -1 },
    enterprise: { name: "Enterprise", price: null, perSeat: true,  seats: -1, storageMb: -1,     docs: -1 },
  },

  /* ---------------- Yardımcılar ---------------- */
  _client() { return (XL.auth && XL.auth.client) || null; },
  _authed() { try { return !!(XL.auth && XL.auth.user); } catch (e) { return false; } },

  _unlimited() { return XL.t("Sınırsız", "Unlimited"); },
  _price(m) {
    if (m.price == null) return XL.t("Özel", "Custom");
    if (m.price === 0) return XL.t("Ücretsiz", "Free");
    const d = "$" + (m.price / 100).toFixed(m.price % 100 ? 2 : 0);
    return d + (m.perSeat ? XL.t(" / koltuk / ay", " / seat / mo") : XL.t(" / ay", " / mo"));
  },
  _mb(mb) {
    if (mb < 0) return this._unlimited();
    return mb >= 1024 ? (mb / 1024).toFixed(mb % 1024 ? 1 : 0) + " GB" : mb + " MB";
  },
  _bytes(b) {
    b = Number(b) || 0;
    const u = ["B", "KB", "MB", "GB"]; let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return b.toFixed(i && b % 1 ? 1 : 0) + " " + u[i];
  },
  _limit(n) { return n < 0 ? this._unlimited() : String(n); },

  /* ---------------- RPC sarmalayıcıları ---------------- */
  async listPlans() {
    const c = this._client(); if (!c) return null;
    const { data, error } = await c.rpc("list_plans");
    if (error) throw error;
    return data;
  },
  async getSubscription(orgId) {
    const c = this._client(); if (!c) return null;
    const { data, error } = await c.rpc("get_subscription", { p_org: orgId || null });
    if (error) throw error;
    return data;
  },
  async changePlan(tier, orgId) {
    const c = this._client(); if (!c) throw new Error(XL.t("Giriş gerekli", "Sign in required"));
    const { data, error } = await c.rpc("change_plan", { p_tier: tier, p_org: orgId || null });
    if (error) throw error;
    return data;
  },

  /* ---------------- Kullanım ölçeri (bar) ---------------- */
  _meter(labelTr, labelEn, used, limit, fmt) {
    const unlimited = limit < 0;
    const pct = unlimited || !limit ? 0 : Math.min(100, Math.round((used / limit) * 100));
    const over = !unlimited && limit >= 0 && used >= limit;
    const usedTxt = fmt ? fmt(used) : String(used);
    const limTxt = unlimited ? this._unlimited() : (fmt ? fmt(limit) : String(limit));
    return `<div class="bill-meter${over ? " over" : ""}">
      <div class="bm-row"><span>${XL.t(labelTr, labelEn)}</span><span class="bm-val">${usedTxt} / ${limTxt}</span></div>
      <div class="bm-track"><div class="bm-fill" style="width:${unlimited ? 8 : pct}%"></div></div>
    </div>`;
  },

  /* ---------------- Plan kartları (girişsiz de çizilir) ---------------- */
  _planCards(currentTier, orgId) {
    return '<div class="bill-cards">' + this.TIERS.map((tier) => {
      const m = this.PLAN_META[tier];
      const cur = tier === currentTier;
      const feats = [
        this._limit(m.docs) + " " + XL.t("belge", "documents"),
        (m.seats < 0 ? this._unlimited() : m.seats) + " " + XL.t("koltuk", "seats"),
        this._mb(m.storageMb) + " " + XL.t("depolama", "storage"),
      ];
      return `<div class="bill-card${cur ? " current" : ""}" data-tier="${tier}">
        <div class="bc-name">${XL.esc(m.name)}</div>
        <div class="bc-price">${this._price(m)}</div>
        <ul class="bc-feats">${feats.map((f) => `<li>${XL.esc(f)}</li>`).join("")}</ul>
        ${cur
          ? `<div class="bc-badge">${XL.t("Mevcut plan", "Current plan")}</div>`
          : (m.price == null
            ? `<button class="bc-pick" data-contact="1">${XL.t("İletişime geç", "Contact us")}</button>`
            : `<button class="bc-pick" data-tier="${tier}">${XL.t("Bu plana geç", "Switch to this plan")}</button>`)}
      </div>`;
    }).join("") + "</div>";
  },

  /* ---------------- Panel (kişisel) ---------------- */
  openPanel(orgId) {
    XL.showPanel(XL.t("💳 Plan ve Faturalandırma", "💳 Plan & Billing"),
      `<div class="bill-ui"><p class="muted">${XL.t("Yükleniyor…", "Loading…")}</p></div>`);
    const host = document.querySelector("#panel-body .bill-ui") || document.getElementById("panel-body");
    this.renderInto(host, orgId);
  },

  // Verilen konteynere faturalandırma arayüzünü çizer (hem panel hem org sekmesi kullanır).
  async renderInto(host, orgId) {
    if (!host) return;
    const note = `<p class="bill-note">${XL.t(
      "ℹ️ Gerçek ödeme entegrasyonu (Stripe) Faz 9'da gelecek. Şimdilik plan değişimi bir SİMÜLASYONDUR — kart bilgisi alınmaz.",
      "ℹ️ Real payment integration (Stripe) ships in Phase 9. For now, switching plans is a SIMULATION — no card is charged.")}</p>`;

    // Giriş yoksa: yalnız fiyat/kota kartları (karşılaştırma) + giriş daveti.
    if (!this._authed()) {
      host.innerHTML = `
        <p class="muted">${XL.t("Planları karşılaştırın. Abonelik ve kullanım için giriş yapın.", "Compare plans. Sign in to subscribe and see usage.")}</p>
        ${this._planCards("free", null)}
        ${note}`;
      return;
    }

    host.innerHTML = `<p class="muted">${XL.t("Abonelik bilgisi alınıyor…", "Fetching subscription…")}</p>`;
    let sub;
    try { sub = await this.getSubscription(orgId); }
    catch (e) { host.innerHTML = `<p class="muted">${XL.t("Hata: ", "Error: ")}${XL.esc(e.message || String(e))}</p>`; return; }

    const lim = sub.limits || {}, use = sub.usage || {};
    const isOrg = sub.subject === "org";
    const period = sub.current_period_end
      ? XL.t("Dönem bitişi: ", "Renews: ") + new Date(sub.current_period_end).toLocaleDateString()
      : "";

    const meters = [
      this._meter("Belgeler", "Documents", use.documents || 0, lim.max_documents),
      isOrg ? this._meter("Üyeler (koltuk)", "Members (seats)", use.members || 0, lim.seats) : "",
      this._meter("Depolama", "Storage", use.storage_bytes || 0, (lim.storage_quota_mb || 0) * 1024 * 1024,
        (v) => this._bytes(v)),
    ].join("");

    host.innerHTML = `
      <div class="bill-current">
        <div class="bc-head">
          <span class="bc-plan">${XL.esc(sub.plan_name || sub.tier)}</span>
          <span class="bc-status bc-st-${XL.esc(sub.status)}">${this._statusLbl(sub.status)}</span>
        </div>
        <div class="muted">${isOrg ? XL.t("Organizasyon aboneliği", "Organization subscription") : XL.t("Kişisel abonelik", "Personal subscription")}${period ? " · " + period : ""}</div>
      </div>
      <div class="share-sub">${XL.t("Kullanım", "Usage")}</div>
      ${meters}
      <div class="share-sub">${XL.t("Planlar", "Plans")}</div>
      ${this._planCards(sub.tier, orgId)}
      ${note}
      <div id="bill-msg" class="share-msg hidden"></div>`;

    this._wireCards(host, orgId);
  },

  _statusLbl(s) {
    return ({
      active:   XL.t("Etkin", "Active"),
      trialing: XL.t("Deneme", "Trialing"),
      past_due: XL.t("Ödeme gecikti", "Past due"),
      canceled: XL.t("İptal", "Canceled"),
    })[s] || s;
  },

  _wireCards(host, orgId) {
    const msg = (t, kind) => { const e = host.querySelector("#bill-msg"); if (!e) return; e.textContent = t || ""; e.className = "share-msg" + (t ? " " + (kind || "error") : " hidden"); };
    host.querySelectorAll(".bc-pick[data-contact]").forEach((b) => b.addEventListener("click", () => {
      msg(XL.t("Enterprise için bizimle iletişime geçin (satış e-postası — Faz 9).", "For Enterprise, contact us (sales email — Phase 9)."), "ok");
    }));
    host.querySelectorAll(".bc-pick[data-tier]").forEach((b) => b.addEventListener("click", async () => {
      const tier = b.dataset.tier;
      const m = this.PLAN_META[tier];
      if (!confirm(XL.t(
        "“" + m.name + "” planına geçilsin mi? (Simülasyon — ödeme alınmaz.)",
        "Switch to the “" + m.name + "” plan? (Simulation — no charge.)"))) return;
      msg("");
      b.disabled = true;
      try {
        await this.changePlan(tier, orgId);
        msg(XL.t("✅ Plan güncellendi: ", "✅ Plan updated: ") + m.name, "ok");
        if (XL.obs) XL.obs.breadcrumb("billing", "change_plan", { tier, org: !!orgId });
        setTimeout(() => this.renderInto(host, orgId), 500);
      } catch (e) {
        b.disabled = false;
        msg(this._err(e));
      }
    }));
  },

  // Sunucu kota/downgrade hatalarını anlaşılır (iki dilli) mesaja çevirir.
  _err(e) {
    const m = (e && e.message) || String(e);
    if (/koltuk kotası|koltuk sunar/i.test(m)) return XL.t("Koltuk kotası engeli — önce üye çıkarın veya daha yüksek plan seçin.", "Seat quota blocked — remove members or pick a higher plan.");
    if (/belge kotası|belge sunar/i.test(m)) return XL.t("Belge kotası engeli — önce belge silin veya daha yüksek plan seçin.", "Document quota blocked — delete documents or pick a higher plan.");
    if (/yalnızca org yöneticisi|yöneticisi değiştirebilir/i.test(m)) return XL.t("Planı yalnızca organizasyon yöneticisi değiştirebilir.", "Only an organization admin can change the plan.");
    return m;
  },
};
