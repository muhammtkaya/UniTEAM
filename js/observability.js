/* observability.js — XL.obs: gözlemlenebilirlik (Faz 7)
 *
 * Sağlayıcı-BAĞIMSIZ hafif bir katman: loglama + breadcrumb (son olaylar halkası) +
 * global hata/promise yakalama + hafif metrik/zamanlama + OPSİYONEL "beacon" taşıma.
 *
 * Felsefe — "önce kod, hesap en sona" (bkz. yol haritası Faz 9):
 *   • DSN BOŞSA (varsayılan) HİÇBİR ağ isteği yapılmaz; olaylar yalnız konsola ve
 *     yerel halka tamponuna gider → servis/hesap gerekmez, çevrimdışı güvenli.
 *   • config.observability.dsn ayarlanınca (Faz 9) olaylar o uca sendBeacon/fetch
 *     ile gönderilir. Bu, Sentry gibi gerçek bir SDK'nın yerine geçecek ince bir
 *     köprüdür; gerçek SDK ileride tek yerde (transport) değiştirilerek takılır.
 *
 * GİZLİLİK: belge İÇERİĞİ asla gönderilmez. Yalnız meta veri (olay türü, mesaj,
 *   yığın izi, süre, etkin belge TÜRÜ, dil, giriş durumu) kaydedilir.
 */
XL.obs = {
  _crumbs: [],          // breadcrumb halka tamponu (son N olay)
  _max: 50,
  _seen: new Map(),     // hata mesajı -> son gönderim zamanı (sel/tekrar koruması)
  _booted: false,
  cfg() { return (XL.config && XL.config.observability) || { dsn: "", env: "local", release: XL.APP_VERSION, sampleRate: 1 }; },

  /* ---- bağlam (PII yok) ---- */
  context() {
    const doc = (XL.ws && XL.ws.active && XL.ws.active()) || null;
    let authed = false, uid = null;
    try { const u = XL.auth && XL.auth.user; if (u) { authed = true; uid = u.id || null; } } catch (e) {}
    return {
      app: XL.APP_NAME, release: this.cfg().release, env: this.cfg().env,
      locale: (XL.i18n && XL.i18n.locale) || "tr",
      docType: doc ? doc.type : null,
      authed, uid,
      online: typeof navigator !== "undefined" ? navigator.onLine : null,
      ua: typeof navigator !== "undefined" ? navigator.userAgent : null,
      url: typeof location !== "undefined" ? location.href : null,
      ts: new Date().toISOString(),
    };
  },

  /* ---- breadcrumb ---- */
  breadcrumb(type, msg, data) {
    const c = { t: Date.now(), type: type || "info", msg: String(msg == null ? "" : msg).slice(0, 300) };
    if (data !== undefined) { try { c.data = JSON.parse(JSON.stringify(data)); } catch (e) {} }
    this._crumbs.push(c);
    if (this._crumbs.length > this._max) this._crumbs.shift();
    return c;
  },
  recent() { return this._crumbs.slice(); },

  /* ---- loglama (konsola + breadcrumb) ---- */
  log(level, msg, data) {
    level = level || "info";
    this.breadcrumb("log." + level, msg, data);
    const fn = { debug: "debug", info: "info", warn: "warn", error: "error" }[level] || "log";
    try { (console[fn] || console.log)("[obs]", msg, data !== undefined ? data : ""); } catch (e) {}
  },
  info(m, d) { this.log("info", m, d); },
  warn(m, d) { this.log("warn", m, d); },
  debug(m, d) { this.log("debug", m, d); },
  error(m, d) { this.log("error", m, d); },

  /* ---- metrik / zamanlama ---- */
  metric(name, value, tags) {
    const m = { name: String(name), value: value == null ? 1 : Number(value), tags: tags || {} };
    this.breadcrumb("metric", name + "=" + m.value, tags);
    this._send({ kind: "metric", metric: m, context: this.context() });
    return m;
  },
  // Senkron veya Promise döndüren işi zamanla; süreyi metrik olarak kaydet.
  time(name, fn) {
    const t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
    const done = () => this.metric(name, Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0), { unit: "ms" });
    try {
      const r = fn();
      if (r && typeof r.then === "function") return r.then((v) => { done(); return v; }, (e) => { done(); throw e; });
      done(); return r;
    } catch (e) { done(); throw e; }
  },

  /* ---- olay yakalama ---- */
  captureMessage(msg, level, extra) {
    const ev = { kind: "message", level: level || "info", message: String(msg).slice(0, 2000), extra: extra || null, breadcrumbs: this.recent(), context: this.context() };
    this.breadcrumb("event", msg);
    this._send(ev);
    return ev;
  },
  captureException(err, extra) {
    const e = err || {};
    const message = (e && e.message) ? String(e.message) : String(e);
    // Sel/tekrar koruması: aynı mesaj 5 sn içinde yeniden gönderilmesin.
    const now = Date.now();
    const last = this._seen.get(message);
    if (last && now - last < 5000) return null;
    this._seen.set(message, now);
    const ev = {
      kind: "exception", level: "error",
      message: message.slice(0, 2000),
      name: (e && e.name) || "Error",
      stack: (e && e.stack) ? String(e.stack).slice(0, 4000) : null,
      extra: extra || null,
      breadcrumbs: this.recent(),
      context: this.context(),
    };
    try { console.error("[obs] exception:", err, extra !== undefined ? extra : ""); } catch (_) {}
    this._send(ev);
    return ev;
  },

  /* ---- taşıma (DSN varsa) ---- */
  _send(envelope) {
    const cfg = this.cfg();
    if (!cfg.dsn) return;                               // DSN yok → ağ yok (yerel-yalnız)
    if (cfg.sampleRate < 1 && Math.random() > cfg.sampleRate) return;
    let body;
    try { body = JSON.stringify(envelope); } catch (e) { return; }
    try {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(cfg.dsn, new Blob([body], { type: "application/json" }));
      } else if (typeof fetch !== "undefined") {
        fetch(cfg.dsn, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true, mode: "cors" }).catch(() => {});
      }
    } catch (e) { /* taşıma hatası gözlemlenebilirliği çökertmez */ }
  },

  /* ---- tanılama dışa aktarımı (destek için) ---- */
  diagnostics() {
    return { context: this.context(), breadcrumbs: this.recent(), generatedAt: new Date().toISOString() };
  },

  /* ---- başlatma: global yakalayıcılar + XL.status köprüsü + perf ---- */
  init() {
    if (this._booted) return;
    this._booted = true;

    if (typeof window !== "undefined") {
      window.addEventListener("error", (e) => {
        if (e && e.error) this.captureException(e.error, { source: "window.error", filename: e.filename, line: e.lineno, col: e.colno });
        else this.captureMessage(e && e.message ? e.message : "window error", "error", { source: "window.error" });
      });
      window.addEventListener("unhandledrejection", (e) => {
        const r = e && e.reason;
        if (r instanceof Error) this.captureException(r, { source: "unhandledrejection" });
        else this.captureMessage("Unhandled rejection: " + (typeof r === "string" ? r : JSON.stringify(r)).slice(0, 500), "error", { source: "unhandledrejection" });
      });
    }

    // Kullanıcıya görünen durum mesajlarını breadcrumb'a köprüle (XL.status'u sarar).
    if (typeof XL.status === "function" && !XL.status.__obsWrapped) {
      const orig = XL.status;
      const self = this;
      XL.status = function (msg) { try { if (msg) self.breadcrumb("status", msg); } catch (e) {} return orig.apply(this, arguments); };
      XL.status.__obsWrapped = true;
    }

    // Sayfa yükleme süresi (tek seferlik performans metriği).
    if (typeof window !== "undefined") {
      window.addEventListener("load", () => {
        try {
          const nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
          if (nav && nav.duration) this.metric("page.load_ms", Math.round(nav.duration), { unit: "ms" });
        } catch (e) {}
      });
    }

    this.breadcrumb("boot", "observability init", { release: this.cfg().release, env: this.cfg().env, dsn: this.cfg().dsn ? "set" : "none" });
  },
};

// Erken başlat (global hataları en baştan yakalamak için).
try { XL.obs.init(); } catch (e) { /* no-op */ }
