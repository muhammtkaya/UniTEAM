/* workspace.js — belgeler (alt sekmeler), ＋ menüsü, mod değiştirme, şerit ve kalıcılık
 *
 * Her belge: { id, type: "xlsx" | "docx" | "pptx", name, data }
 * Etkin belgenin türü, hangi modun (Excel / Word / PowerPoint) bağlanacağını belirler.
 * Mod arayüzü: ribbon(), mount(doc), unmount(doc), serialize(), command(cmd, value),
 *              isOn(state), importFile(file) → data, save(doc), createData()
 */
XL.ws = {
  KEY: "uniteam-v1",
  OLD_KEYS: ["weboffice-v2", "webexcel-v1"],   // marka göçü: eski localStorage anahtarları
  docs: [],
  activeId: null,
  mounted: false,
  ribbonTab: {},   // mod -> son seçili şerit sekmesi

  async init() {
    try { await XL.prefs.load(); this.migrateAccent(); } catch (e) { console.error("Tercih yükleme hatası:", e); }

    // Masaüstü (Office) davranışı: önceki oturumun açık belgeleri GERİ YÜKLENMEZ.
    // Uygulama normal açıldığında boş bir Excel ile başlar. İşletim sisteminden bir
    // dosya "Birlikte aç" ile gelirse (launchQueue), o dosya açılır ve bu boş
    // varsayılan sekme otomatik kapanır (bkz. setupFileLaunch / _dropPristineDefault).
    // Eski oturum verisi birikmesin diye kalıcı belge deposu bir kez temizlenir.
    try { if (XL.store.available() && XL.store.clearDocs) await XL.store.clearDocs(); } catch (e) { console.error("Depo temizleme hatası:", e); }

    this.docs = [this.makeDoc("xlsx")];   // uygulama Excel ile açılır
    this.activeId = this.docs[0].id;
    this._pristineDefaultId = this.docs[0].id;   // dosya açılırsa bırakılacak dokunulmamış varsayılan

    this.wireShell();
    this.wireRibbon();
    if (XL.i18n) XL.i18n.onChange(() => this.onLocaleChange());
    this.activate(this.activeId, true);
    if (XL.macros && XL.macros.init) XL.macros.init();   // makro kısayolları
  },

  // Dil değişince kalıcı arayüzü (şerit + sekmeler) yeniden çiz. Belge içeriği/mod korunur.
  onLocaleChange() {
    const doc = this.active();
    if (!doc) return;
    this.renderRibbon(this.modeOf(doc).ribbon(), doc.type);
    this.syncRibbonState();
    this.renderDocTabs();
    // Excel: görünen formüller + formül çubuğu yeni bölgesel ayraçla yeniden çizilsin.
    if (doc.type === "xlsx" && XL.grid && XL.grid.table) {
      XL.grid.render();
      if (XL.modes.xlsx.syncFormulaBar) XL.modes.xlsx.syncFormulaBar();
    }
  },

  active() { return this.docs.find((d) => d.id === this.activeId); },
  modeOf(doc) { return XL.modes[doc.type]; },

  makeDoc(type, data, name) {
    const m = XL.modes[type];
    // dirty: kaydedilmemiş değişiklik var mı? Yeni/açılan belge temizdir (false).
    return { id: XL.uid(), type, name: name || this.nextName(type), data: data || m.createData(), dirty: false };
  },

  nextName(type) {
    const prefix = XL.modes[type].docPrefix;
    let n = 1;
    while (this.docs.some((d) => d.name === prefix + n)) n++;
    return prefix + n;
  },

  create(type, data, name) {
    this._pristineDefaultId = null;   // kullanıcı belge ekledi; varsayılan artık otomatik kapanmaz
    const doc = this.makeDoc(type, data, name);
    // Etkin belgenin hemen sağına ekle
    const i = this.docs.findIndex((d) => d.id === this.activeId);
    this.docs.splice(i + 1, 0, doc);
    this.activate(doc.id);
    return doc;
  },

  /* ---------- Mod değiştirme ---------- */
  activate(id, first) {
    // Belge değişince canlı düzenlemeyi kapat (bağ belgeye özeldir).
    if (!first && XL.realtime && (XL.realtime._word || XL.realtime._pptx || XL.realtime._xl)) {
      XL.realtime.disconnect();
      const lb = document.getElementById("btn-live");
      if (lb) lb.classList.remove("live-on");
    }
    const prev = this.active();
    if (prev && this.mounted && !first) {
      try { this.modeOf(prev).unmount(prev); } catch (e) { console.error(e); }
      this._save(prev);   // ayrılan belgenin son durumunu kaydet
    }
    this.mounted = false;
    XL.hidePanel();

    this.activeId = id;
    const doc = this.active();
    const m = this.modeOf(doc);
    document.body.dataset.mode = doc.type;
    XL.theme.applyApp(this.appStyle(doc.type)); // uygulamaya özel renk + kutu/araç stili
    document.getElementById("mode-icon").textContent = m.icon;
    document.getElementById("mode-name").textContent = m.label;
    document.getElementById("doc-title").textContent = doc.name + m.ext;
    document.title = `${doc.name} - ${m.label} · ${XL.APP_NAME}`;

    this.renderRibbon(m.ribbon(), doc.type);
    try {
      m.mount(doc);
    } catch (e) {
      console.error(e);
      alert(XL.t("Belge açılırken hata oluştu: ", "Error while opening document: ") + e.message);
    }
    this.mounted = true;
    this.renderDocTabs();
    this.syncRibbonState();
    this.applyReadonly();   // salt-görüntüleme belgelerinde düzenlemeyi kilitle
    this.persistNow();
    // Yorum işaretçileri + canlı yenileme aboneliğini bu belgeye göre eşitle.
    if (XL.comments && XL.comments.syncForDoc) XL.comments.syncForDoc(doc);
  },

  /* ---------- Şerit (veri-güdümlü: kullanıcı sıralama/gizleme yapabilir) ---------- */
  renderRibbon(tabs, type) {
    this._tabs = tabs;
    this._type = type;
    const sel = Math.min(this.ribbonTab[type] || 0, tabs.length - 1);
    const rib = document.getElementById("ribbon");
    const editing = !!this.ribEditing;
    const editControls = editing
      ? `<button class="rtab rtab-edit active" data-ribdone title="${XL.t("Özelleştirmeyi bitir", "Finish customizing")}">✓ ${XL.t("Bitti", "Done")}</button>
         <button class="rtab rtab-reset" data-ribreset title="${XL.t("Bu moddaki şerit düzenini varsayılana döndür", "Reset this mode's ribbon layout to default")}">↺ ${XL.t("Sıfırla", "Reset")}</button>`
      : `<button class="rtab rtab-edit" data-ribedit title="${XL.t("Şeridi özelleştir: grupları sürükle-sırala, gizle", "Customize ribbon: drag to reorder groups, hide")}">⚙ ${XL.t("Özelleştir", "Customize")}</button>`;
    rib.classList.toggle("rib-editing", editing);
    rib.innerHTML = `
      <div class="rtabs">
        ${tabs.map((t, i) => `<button class="rtab${i === sel ? " active" : ""}" data-tab="${i}">${XL.esc(t.name)}</button>`).join("")}
        <span class="rtabs-spacer"></span>${editControls}
      </div>
      ${editing ? `<div class="rib-edit-hint">${XL.t("Grupları sürükleyip sıralayın · ✕ ile gizleyin · aşağıdaki şeritten geri getirin", "Drag groups to reorder · hide with ✕ · restore from the tray below")}</div>` : ""}
      ${tabs.map((t, i) => `<div class="rpanel${i === sel ? " active" : ""}" data-panel="${i}"></div>`).join("")}`;
    tabs.forEach((t, i) => this._fillPanel(rib.querySelector(`.rpanel[data-panel="${i}"]`), t, i));
  },

  // Bir sekmenin html'indeki üst düzey .rgroup'ları {id,label,html} olarak çıkar (id = orijinal sıra, kalıcı)
  _collectGroups(tab) {
    const tmp = document.createElement("div");
    tmp.innerHTML = tab.html;
    return [...tmp.children].filter((g) => g.classList.contains("rgroup")).map((g, i) => {
      const lbl = g.querySelector(":scope > label");
      return { id: "g" + i, label: lbl ? lbl.textContent.trim() : "Grup " + (i + 1), html: g.outerHTML };
    });
  },

  _layout(type, tabIndex) {
    const all = XL.prefs.get("ribbon", {}) || {};
    const l = all[type] && all[type][tabIndex];
    return { order: (l && l.order) || [], hidden: (l && l.hidden) || [] };
  },
  _setLayout(type, tabIndex, layout) {
    const all = XL.prefs.get("ribbon", {}) || {};
    all[type] = all[type] || {};
    all[type][tabIndex] = layout;
    XL.prefs.set("ribbon", all);
  },

  _fillPanel(panelEl, tab, tabIndex) {
    const groups = this._collectGroups(tab);
    const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
    const layout = this._layout(this._type, tabIndex);
    const hidden = new Set(layout.hidden.filter((id) => byId[id]));
    // Sıra: kullanıcı düzeni (mevcut olanlar) + sonradan eklenmiş yeni gruplar
    const ordered = layout.order.filter((id) => byId[id]);
    groups.forEach((g) => { if (!ordered.includes(g.id)) ordered.push(g.id); });

    panelEl.innerHTML = "";
    ordered.forEach((id) => {
      if (hidden.has(id)) return;
      const holder = document.createElement("div");
      holder.innerHTML = byId[id].html;
      const gEl = holder.firstElementChild;
      gEl.dataset.gid = id;
      gEl.dataset.tab = tabIndex;
      if (this.ribEditing) {
        gEl.setAttribute("draggable", "true");
        const x = document.createElement("button");
        x.className = "rgroup-hide"; x.textContent = "✕"; x.title = XL.t("Bu grubu gizle", "Hide this group");
        x.dataset.hide = id; x.dataset.tab = tabIndex;
        gEl.appendChild(x);
      }
      panelEl.appendChild(gEl);
    });
    // Düzenleme modunda: gizli grupları geri getirme şeridi
    if (this.ribEditing) {
      const hiddenGroups = groups.filter((g) => hidden.has(g.id));
      const tray = document.createElement("div");
      tray.className = "rgroup rgroup-tray";
      tray.innerHTML = `<div class="rrow tray-row">${hiddenGroups.length
        ? hiddenGroups.map((g) => `<button class="tray-chip" data-show="${g.id}" data-tab="${tabIndex}" title="${XL.t("Geri getir", "Restore")}">＋ ${XL.esc(g.label)}</button>`).join("")
        : `<span class="tray-empty">${XL.t("gizli grup yok", "no hidden groups")}</span>`}</div><label>${XL.t("Gizli gruplar", "Hidden groups")}</label>`;
      panelEl.appendChild(tray);
    }
  },

  toggleRibbonEdit(on) {
    this.ribEditing = on === undefined ? !this.ribEditing : on;
    this.renderRibbon(this._tabs, this._type);
    this.syncRibbonState();
  },
  resetRibbonLayout() {
    const all = XL.prefs.get("ribbon", {}) || {};
    delete all[this._type];
    XL.prefs.set("ribbon", all);
    this.renderRibbon(this._tabs, this._type);
    this.syncRibbonState();
  },
  // Sürükleme sonrası görünür grup sırasını prefs'e yaz
  _commitOrder(tabIndex) {
    const panel = document.querySelector(`#ribbon .rpanel[data-panel="${tabIndex}"]`);
    if (!panel) return;
    const order = [...panel.querySelectorAll(".rgroup[data-gid]")].map((g) => g.dataset.gid);
    const layout = this._layout(this._type, tabIndex);
    const hidden = layout.hidden.filter((h) => !order.includes(h));
    this._setLayout(this._type, tabIndex, { order: order.concat(hidden), hidden });
  },
  _dragAfter(panel, x) {
    const els = [...panel.querySelectorAll('.rgroup[draggable]:not(.dragging):not(.rgroup-tray)')];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (x < r.left + r.width / 2) return el;
    }
    return null;
  },

  wireRibbon() {
    const rib = document.getElementById("ribbon");
    // Odak şeride geçmeden önce modun metin seçimini saklamasına izin ver
    rib.addEventListener("mousedown", () => {
      const m = this.modeOf(this.active());
      if (m.beforeRibbon) m.beforeRibbon();
    }, true);
    // Düğmeler odağı çalmasın (Word/PowerPoint'te metin seçimi korunsun).
    // Düzenleme modunda engelleme yok ki grup sürüklemesi başlayabilsin.
    rib.addEventListener("mousedown", (e) => {
      if (!this.ribEditing && e.target.closest("button")) e.preventDefault();
    });
    rib.addEventListener("click", (e) => {
      // Özelleştirme kontrolleri
      if (e.target.closest("[data-ribedit]")) return this.toggleRibbonEdit(true);
      if (e.target.closest("[data-ribdone]")) return this.toggleRibbonEdit(false);
      if (e.target.closest("[data-ribreset]")) {
        if (confirm(XL.t("Bu moddaki şerit düzeni (sıralama + gizlenenler) varsayılana döndürülsün mü?", "Reset this mode's ribbon layout (order + hidden groups) to default?"))) this.resetRibbonLayout();
        return;
      }
      const hideBtn = e.target.closest("[data-hide]");
      if (hideBtn) {
        const tab = +hideBtn.dataset.tab, layout = this._layout(this._type, tab);
        if (!layout.hidden.includes(hideBtn.dataset.hide)) layout.hidden.push(hideBtn.dataset.hide);
        this._setLayout(this._type, tab, layout);
        this.renderRibbon(this._tabs, this._type); this.syncRibbonState();
        return;
      }
      const showBtn = e.target.closest("[data-show]");
      if (showBtn) {
        const tab = +showBtn.dataset.tab, layout = this._layout(this._type, tab);
        layout.hidden = layout.hidden.filter((id) => id !== showBtn.dataset.show);
        this._setLayout(this._type, tab, layout);
        this.renderRibbon(this._tabs, this._type); this.syncRibbonState();
        return;
      }
      const tab = e.target.closest(".rtab[data-tab]");
      if (tab) {
        const i = +tab.dataset.tab;
        this.ribbonTab[this.active().type] = i;
        rib.querySelectorAll(".rtab[data-tab]").forEach((t) => t.classList.toggle("active", +t.dataset.tab === i));
        rib.querySelectorAll(".rpanel").forEach((p) => p.classList.toggle("active", +p.dataset.panel === i));
        return;
      }
      if (this.ribEditing) return; // düzenleme modunda araç komutları çalışmaz
      const btn = e.target.closest("button[data-cmd]");
      if (btn) this.run(btn.dataset.cmd, btn.dataset.value);
    });
    rib.addEventListener("change", (e) => {
      if (this.ribEditing) return;
      const el = e.target;
      if (el.matches("select[data-cmd], input[data-cmd]")) this.run(el.dataset.cmd, el.value);
    });

    // --- Grup sürükle-bırak (yalnızca düzenleme modunda) ---
    rib.addEventListener("dragstart", (e) => {
      if (!this.ribEditing) return;
      const g = e.target.closest('.rgroup[draggable="true"]');
      if (!g || g.classList.contains("rgroup-tray")) return;
      this._dragTab = +g.dataset.tab;
      g.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", g.dataset.gid); } catch (_) {}
    });
    rib.addEventListener("dragover", (e) => {
      if (!this.ribEditing) return;
      const dragging = rib.querySelector(".rgroup.dragging");
      if (!dragging) return;
      const panel = e.target.closest(".rpanel");
      if (!panel) return;
      e.preventDefault();
      const after = this._dragAfter(panel, e.clientX);
      const tray = panel.querySelector(".rgroup-tray");
      if (after) panel.insertBefore(dragging, after);
      else panel.insertBefore(dragging, tray || null); // tray'den önce (sonun)
    });
    rib.addEventListener("drop", (e) => {
      if (!this.ribEditing) return;
      e.preventDefault();
      this._commitOrder(this._dragTab);
    });
    rib.addEventListener("dragend", () => {
      const d = rib.querySelector(".rgroup.dragging");
      if (d) d.classList.remove("dragging");
    });
  },

  // Etkin belge salt-görüntüleme mi? (anonim/public açılan belgeler böyle işaretlenir)
  isReadonly() { const d = this.active(); return !!(d && d.readonly); },

  // Salt-görüntüleme kilidini uygula: body sınıfı + Word contentEditable + banner.
  applyReadonly() {
    const ro = this.isReadonly();
    document.body.classList.toggle("doc-readonly", ro);
    ["wd-body", "wd-header", "wd-footer"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.setAttribute("contenteditable", ro ? "false" : "true");
    });
    let bn = document.getElementById("ro-banner");
    if (ro) {
      if (!bn) { bn = document.createElement("div"); bn.id = "ro-banner"; document.body.appendChild(bn); }
      bn.textContent = XL.t("👁 Salt görüntüleme — bu belge yalnızca görüntülenebilir; düzenlemeler kaydedilmez.",
        "👁 View only — this document can only be viewed; edits are not saved.");
    } else if (bn) { bn.remove(); }
  },

  run(cmd, value) {
    if (this.isReadonly()) { XL.status(XL.t("👁 Salt görüntüleme — düzenleme kapalı.", "👁 View only — editing disabled.")); return; }
    try {
      const r = this.modeOf(this.active()).command(cmd, value);
      if (r && r.catch) r.catch((err) => alert(XL.t("İşlem başarısız: ", "Operation failed: ") + err.message));
    } catch (err) {
      console.error(err);
      alert(XL.t("İşlem başarısız: ", "Operation failed: ") + err.message);
    }
    this.syncRibbonState();
  },

  // Açık/kapalı düğmeleri (Kalın, Formülleri göster vb.) güncelle
  syncRibbonState() {
    const doc = this.active();
    if (!doc) return;
    const m = this.modeOf(doc);
    document.querySelectorAll("#ribbon [data-state]").forEach((b) => {
      let on = false;
      try { on = m.isOn(b.dataset.state); } catch (e) {}
      b.classList.toggle("active", !!on);
    });
  },

  /* ---------- Belge sekmeleri ---------- */
  renderDocTabs() {
    const wrap = document.getElementById("doctabs");
    wrap.innerHTML = "";
    this.docs.forEach((d) => {
      const m = this.modeOf(d);
      const tab = document.createElement("div");
      tab.className = `doctab t-${d.type}` + (d.id === this.activeId ? " active" : "") + (d.dirty ? " dirty" : "");
      tab.dataset.id = d.id;
      tab.title = `${d.name}${m.ext}${d.dirty ? " • " + XL.t("kaydedilmedi", "unsaved") : ""} — ${XL.t("çift tık: yeniden adlandır", "double-click: rename")}`;
      tab.innerHTML = `<span class="ic">${m.icon}</span><span class="nm"></span><span class="dot" title="${XL.t("Kaydedilmemiş değişiklik", "Unsaved changes")}">●</span><button class="x" title="${XL.t("Kapat", "Close")}">×</button>`;
      tab.querySelector(".nm").textContent = d.name;
      tab.addEventListener("click", (e) => {
        if (e.target.closest(".x")) return this.close(d.id);
        if (d.id !== this.activeId) this.activate(d.id);
      });
      tab.addEventListener("dblclick", (e) => {
        if (e.target.closest(".x")) return;
        const n = prompt(XL.t("Belge adı:", "Document name:"), d.name);
        if (n && n.trim()) {
          d.name = n.trim().replace(/\.(xlsx|docx|pptx)$/i, "");
          this.renderDocTabs();
          if (d.id === this.activeId) document.getElementById("doc-title").textContent = d.name + m.ext;
          this.changed();
        }
      });
      wrap.appendChild(tab);
    });
  },

  // Kullanıcı bir belgeyi kapatmak istedi (sekmedeki ×). Değişiklik varsa
  // Kaydet / Kaydetme / İptal sorulur; yoksa doğrudan kapatılır.
  async close(id) {
    const doc = this.docs.find((d) => d.id === id);
    if (!doc) return;

    if (doc.dirty) {
      const choice = await this._confirmClose(doc.name);
      if (choice === "cancel" || choice == null) return;   // İptal → açık kalır
      if (choice === "save") {
        // "Kaydet": serialize etkin belgeyi okuduğundan belgeyi önce etkinleştir.
        if (id !== this.activeId) this.activate(id);
        try { await this.save(); } catch (e) { console.error(e); }
        // Kaydetme iptal edildi/başarısızsa (ör. Farklı Kaydet penceresi kapatıldı)
        // belge hâlâ "değişmiş" kalır → veri kaybını önlemek için kapatma.
        if (doc.dirty) return;
      }
      // "save" (başarılı) ve "discard": her ikisi de kapatır.
    }
    this._removeDoc(id);
  },

  // Değişmiş belge için 3 seçenekli kapatma diyaloğu → "save" | "discard" | "cancel"
  _confirmClose(name) {
    const msg = XL.t(
      `<b>${XL.esc(name)}</b> belgesinde kaydedilmemiş değişiklikler var.<br>Değişiklikleri kaydetmek istiyor musunuz?`,
      `<b>${XL.esc(name)}</b> has unsaved changes.<br>Do you want to save your changes?`);
    return XL.modal(XL.t("Kapatmadan önce", "Before closing"), `<p style="margin:0">${msg}</p>`, [
      { value: "save", label: XL.t("💾 Kaydet", "💾 Save"), kind: "primary", default: true },
      { value: "discard", label: XL.t("Kaydetme", "Don't save") },
      { value: "cancel", label: XL.t("İptal", "Cancel") },
    ]).then((v) => v || "cancel");
  },

  // Belgeyi fiilen kaldır (soru sormadan). Boş varsayılanı düşürmek için de kullanılır.
  _removeDoc(id) {
    const doc = this.docs.find((d) => d.id === id);
    if (!doc) return;
    const idx = this.docs.indexOf(doc);
    if (id === this._pristineDefaultId) this._pristineDefaultId = null;
    if (id === this.activeId) {
      try { this.modeOf(doc).unmount(doc); } catch (e) {}
      this.mounted = false;
    }
    this.docs.splice(idx, 1);
    if (XL.store.available()) XL.store.deleteDoc(id).catch((e) => console.error(e));

    // Son belge de kapatıldı → uygulamayı kapatmayı dene. Kurulu PWA penceresinde
    // window.close() pencereyi kapatır. Sıradan bir tarayıcı sekmesi buna izin
    // vermezse (güvenlik), boş bir Excel ile devam ederiz (kullanıcı boşta kalmasın).
    if (!this.docs.length) {
      try { window.close(); } catch (e) {}
      this.docs.push(this.makeDoc("xlsx"));
      this._pristineDefaultId = this.docs[0].id;
      this.activeId = null;
      this.activate(this.docs[0].id, true);
      return;
    }

    if (id === this.activeId) {
      this.activeId = null;
      this.activate(this.docs[Math.max(0, idx - 1)].id, true);
    } else {
      this.renderDocTabs();
      this.persistNow();
    }
  },

  // Bir dosya açıldığında, açılıştan beri DOKUNULMAMIŞ boş varsayılan Excel'i
  // kaldır (yalnız açılan dosya kalsın). id açmadan ÖNCEki varsayılanın kimliğidir.
  _dropPristineDefaultById(id) {
    if (!id) return;
    const d = this.docs.find((x) => x.id === id);
    if (d && !d.dirty && d.id !== this.activeId && this.docs.length > 1) this._removeDoc(id);
  },

  /* ---------- Kabuk: ＋ menüsü, aç, kaydet ---------- */
  wireShell() {
    const menu = document.getElementById("new-menu");
    document.getElementById("btn-new").addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("hidden");
    });
    menu.addEventListener("click", (e) => {
      const b = e.target.closest("[data-new]");
      if (!b) return;
      menu.classList.add("hidden");
      this.create(b.dataset.new);
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#new-wrap")) menu.classList.add("hidden");
    });

    const fileInput = document.getElementById("fileInput");
    document.getElementById("btn-open").addEventListener("click", () => this.openPicker(fileInput));
    fileInput.addEventListener("change", () => {
      if (fileInput.files[0]) this.openFile(fileInput.files[0]);   // yedek yol: tutamaç yok
      fileInput.value = "";
    });
    document.getElementById("btn-download").addEventListener("click", () => this.download());
    document.getElementById("btn-save").addEventListener("click", () => this.save());
    document.getElementById("btn-theme").addEventListener("click", () => this.settingsPanel());
    document.getElementById("panel-close").addEventListener("click", () => XL.hidePanel());

    // Dosyayı pencereye sürükle-bırak ile aç
    document.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); });
    document.addEventListener("drop", (e) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      const m = this.modeOf(this.active());
      [...e.dataTransfer.files].forEach((f) => {
        // Resimler Word/PowerPoint'te belgeye eklenir; diğer dosyalar yeni sekmede açılır
        if (f.type.startsWith("image/") && m.insertImageFile) m.insertImageFile(f);
        else this.openFile(f);
      });
    });

    document.addEventListener("keydown", (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === "s") { e.preventDefault(); e.shiftKey ? this.saveAs() : this.save(); }
      if (ctrl && e.key.toLowerCase() === "o") { e.preventDefault(); this.openPicker(fileInput); }
      if (e.key === "Escape") { menu.classList.add("hidden"); }
    });
    // Uygulamayı/sekmeyi kapatırken: yalnızca kaydedilmemiş (değişmiş) belge varsa
    // tarayıcının standart "ayrılmak istediğinize emin misiniz?" uyarısını tetikle.
    // (Tarayıcı güvenliği gereği buraya özel Kaydet/Kaydetme düğmeleri konamaz.)
    window.addEventListener("beforeunload", (e) => {
      this.persistNow();
      if (this.docs.some((d) => d.dirty)) {
        e.preventDefault();
        e.returnValue = "";   // Chrome/Edge: standart onay iletişimini gösterir
        return "";
      }
    });

    // PWA dosya açıcı: Windows "Birlikte aç → UniTEAM" veya çift tıkla açılan
    // .docx/.pptx/.xlsx/.xlsm dosyaları buradan gelir (File Handling API).
    this.setupFileLaunch();
  },

  /* PWA olarak kurulduğunda işletim sisteminden gönderilen dosyaları yakalar.
     launchQueue yalnız yüklü PWA'da ve güvenli bağlamda (HTTPS/localhost) vardır. */
  setupFileLaunch() {
    if (!("launchQueue" in window) || !window.launchQueue) return;
    window.launchQueue.setConsumer(async (params) => {
      if (!params || !params.files || !params.files.length) return;
      for (const handle of params.files) {
        try {
          const file = await handle.getFile();
          await this.openFile(file, handle);   // tutamaç → Kaydet üstüne yazar; boş varsayılan openFile içinde düşer
        } catch (e) {
          console.error("launchQueue: dosya açılamadı", e);
          if (XL.obs) XL.obs.captureException(e, { op: "launchQueue" });
        }
      }
    });
  },

  /* ---------- Görünüm / kişiselleştirme (uygulamaya özel) ---------- */
  // prefs.appStyle[type] = { accent, box:{color,alpha}, ctrl:{color,alpha} }
  appStyle(type) {
    const all = XL.prefs.get("appStyle", {}) || {};
    return all[type] || {};
  },
  setAppStyle(type, style) {
    const all = XL.prefs.get("appStyle", {}) || {};
    if (style && (style.accent || style.box || style.ctrl)) all[type] = style; else delete all[type];
    XL.prefs.set("appStyle", all);
  },
  // Eski global "accent" tercihini uygulama-bazlı yapıya taşı (bir kez)
  migrateAccent() {
    const old = XL.prefs.get("accent");
    if (old && !XL.prefs.get("appStyle")) {
      const all = {};
      ["xlsx", "docx", "pptx"].forEach((t) => (all[t] = { accent: old }));
      XL.prefs.set("appStyle", all);
    }
    if (old !== undefined) XL.prefs.set("accent", null); // artık kullanılmıyor
  },

  settingsPanel() {
    const type = this.active() ? this.active().type : "xlsx";
    const appName = { xlsx: "Excel", docx: "Word", pptx: "PowerPoint" }[type] || type;
    const st = this.appStyle(type);
    const presets = ["#185abd", "#107c41", "#c43e1c", "#5b2d91", "#0f6cbd", "#d83b01", "#117865", "#b14d00", "#8a3b8f", "#2b2b2b"];
    const accentCur = /^#([0-9a-f]{6})$/i.test(st.accent || "") ? st.accent
      : (getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#185abd");
    const boxColor = (st.box && st.box.color) || "#faf6ef";
    const boxAlpha = st.box && st.box.alpha != null ? st.box.alpha : 1;
    const ctrlColor = (st.ctrl && st.ctrl.color) || "#fffdf9";
    const ctrlAlpha = st.ctrl && st.ctrl.alpha != null ? st.ctrl.alpha : 1;
    const pct = (a) => Math.round(a * 100);

    XL.showPanel(XL.t("Görünümü Özelleştir", "Customize Appearance"), `
      <div class="settings">
        <p class="muted" style="margin-top:0">${XL.t(`Bu ayarlar yalnızca <b>${XL.esc(appName)}</b> için geçerlidir ve size özel kaydedilir.`, `These settings apply only to <b>${XL.esc(appName)}</b> and are saved for you.`)}</p>

        <h4 style="margin:.4em 0 .2em">${XL.t("Tema rengi", "Theme color")}</h4>
        <p class="muted" style="margin:.1em 0 .4em">${XL.t("Üst çubuk ve şerit vurgusu.", "Top bar and ribbon accent.")}</p>
        <div class="theme-presets">${presets.map((c) => `<button class="theme-dot" data-c="${c}" style="background:${c}" title="${c}"></button>`).join("")}</div>
        <label style="display:inline-flex;align-items:center;gap:8px;margin-top:4px">
          ${XL.t("Özel renk", "Custom color")} <input type="color" id="pref-accent" value="${accentCur}"></label>
        <div style="margin-top:8px"><button id="accent-reset" class="btn-secondary">${XL.t("↓ Tema rengini varsayılana döndür", "↓ Reset theme color to default")}</button></div>

        <hr style="margin:14px 0;border:none;border-top:1px solid #e6e6e6">
        <h4 style="margin:.2em 0">${XL.t("Araç kutuları", "Tool boxes")}</h4>
        <p class="muted" style="margin:.1em 0 .4em">${XL.t("Tüm sekmelerdeki grup kutularının arka planı.", "Background of group boxes on all tabs.")}</p>
        <label style="display:inline-flex;align-items:center;gap:8px">${XL.t("Renk", "Color")} <input type="color" id="box-color" value="${boxColor}"></label>
        <label style="display:flex;align-items:center;gap:8px;margin-top:6px">${XL.t("Saydamlık", "Opacity")}
          <input type="range" id="box-alpha" min="0" max="100" value="${pct(boxAlpha)}" style="flex:1">
          <span id="box-alpha-v" style="width:38px;text-align:right">%${pct(boxAlpha)}</span></label>
        <div style="margin-top:8px"><button id="box-reset" class="btn-secondary">${XL.t("↓ Kutu stilini varsayılana döndür", "↓ Reset box style to default")}</button></div>

        <hr style="margin:14px 0;border:none;border-top:1px solid #e6e6e6">
        <h4 style="margin:.2em 0">${XL.t("Kutu içindeki araçlar", "Tools inside boxes")}</h4>
        <p class="muted" style="margin:.1em 0 .4em">${XL.t("Düğme ve kontrollerin arka planı.", "Background of buttons and controls.")}</p>
        <label style="display:inline-flex;align-items:center;gap:8px">${XL.t("Renk", "Color")} <input type="color" id="ctrl-color" value="${ctrlColor}"></label>
        <label style="display:flex;align-items:center;gap:8px;margin-top:6px">${XL.t("Saydamlık", "Opacity")}
          <input type="range" id="ctrl-alpha" min="0" max="100" value="${pct(ctrlAlpha)}" style="flex:1">
          <span id="ctrl-alpha-v" style="width:38px;text-align:right">%${pct(ctrlAlpha)}</span></label>
        <div style="margin-top:8px"><button id="ctrl-reset" class="btn-secondary">${XL.t("↓ Araç stilini varsayılana döndür", "↓ Reset tool style to default")}</button></div>
      </div>`);

    // Geçerli taslak durumu (panel kapanana kadar canlı önizleme + kayıt)
    const draft = {
      accent: st.accent || null,
      box: st.box ? Object.assign({}, st.box) : null,
      ctrl: st.ctrl ? Object.assign({}, st.ctrl) : null,
    };
    const commit = () => { XL.theme.applyApp(draft); this.setAppStyle(type, draft); };

    const $ = (id) => document.getElementById(id);
    // Tema rengi
    const setAccent = (c) => { draft.accent = c || null; if (c) $("pref-accent").value = c; commit(); };
    $("pref-accent").addEventListener("input", (e) => setAccent(e.target.value));
    document.querySelectorAll(".theme-dot").forEach((b) => b.addEventListener("click", () => setAccent(b.dataset.c)));
    $("accent-reset").addEventListener("click", () => setAccent(null));
    // Kutu stili
    const setBox = () => { draft.box = { color: $("box-color").value, alpha: +$("box-alpha").value / 100 }; $("box-alpha-v").textContent = "%" + $("box-alpha").value; commit(); };
    $("box-color").addEventListener("input", setBox);
    $("box-alpha").addEventListener("input", setBox);
    $("box-reset").addEventListener("click", () => { draft.box = null; $("box-color").value = "#faf6ef"; $("box-alpha").value = 100; $("box-alpha-v").textContent = "%100"; commit(); });
    // Araç stili
    const setCtrl = () => { draft.ctrl = { color: $("ctrl-color").value, alpha: +$("ctrl-alpha").value / 100 }; $("ctrl-alpha-v").textContent = "%" + $("ctrl-alpha").value; commit(); };
    $("ctrl-color").addEventListener("input", setCtrl);
    $("ctrl-alpha").addEventListener("input", setCtrl);
    $("ctrl-reset").addEventListener("click", () => { draft.ctrl = null; $("ctrl-color").value = "#fffdf9"; $("ctrl-alpha").value = 100; $("ctrl-alpha-v").textContent = "%100"; commit(); });
  },

  typeForFile(name) {
    const ext = "." + name.split(".").pop().toLowerCase();
    return Object.values(XL.modes).find((m) => m.accept.includes(ext));
  },

  // Aç düğmesi: destekleyen tarayıcıda dosya TUTAMACIYLA aç (Kaydet üstüne yazsın);
  // yoksa klasik dosya seçiciye (input) düş.
  async openPicker(fileInput) {
    if (!XL.fsa.canOpen()) return fileInput.click();
    let handles;
    try {
      handles = await window.showOpenFilePicker({
        multiple: true,
        types: [{
          description: XL.t("Office belgeleri", "Office documents"),
          accept: { "application/octet-stream": [".xlsx", ".xlsm", ".xls", ".csv", ".docx", ".pptx"] },
        }],
      });
    } catch (e) {
      if (e && e.name === "AbortError") return;   // kullanıcı iptal etti
      console.error(e); return fileInput.click();
    }
    for (const handle of handles) {
      try { await this.openFile(await handle.getFile(), handle); }
      catch (e) { console.error(e); }
    }
  },

  // file: açılacak File; handle (varsa): aynı dosyaya Kaydet'te üstüne yazmak için tutamaç.
  async openFile(file, handle) {
    const m = this.typeForFile(file.name);
    if (!m) return alert(XL.t("Desteklenmeyen dosya türü: ", "Unsupported file type: ") + file.name + "\n" + XL.t("Desteklenenler: ", "Supported: ") + ".xlsx .xlsm .xls .csv .docx .pptx");
    XL.status(XL.t("Açılıyor: ", "Opening: ") + file.name + " …");
    const pristineId = this._pristineDefaultId;   // açmadan önceki dokunulmamış boş varsayılan
    try {
      const data = await m.importFile(file);
      const doc = this.create(m.type, data, file.name.replace(/\.[^.]+$/, ""));
      // CSV tutamacını saklamayız: Kaydet .xlsx üretir, .csv üstüne yazamaz.
      if (handle && !/\.csv$/i.test(file.name)) doc.handle = handle;
      // "Dosya açtıysa o dosya açılsın": açılan dosya geldiğinde, hiç dokunulmamış
      // boş varsayılan Excel sekmesini kaldır (yalnız açılan dosya kalsın).
      this._dropPristineDefaultById(pristineId);
      XL.status(XL.t("Açıldı: ", "Opened: ") + file.name);
    } catch (err) {
      console.error(err);
      if (XL.obs) XL.obs.captureException(err, { op: "openFile", ext: (file.name.match(/\.[^.]+$/) || [""])[0] });
      // Bozuk/beklenmedik dosyada çökme yerine zarif, anlaşılır hata (Faz 6).
      const msg = String(err && err.message || err);
      const friendly = /zip|end of central|corrupt|invalid|unexpected|not a|format/i.test(msg)
        ? XL.t("Dosya bozuk veya bu biçimin desteklenmeyen bir türevi olabilir.",
               "The file may be corrupt or an unsupported variant of this format.")
        : msg;
      alert(XL.t("Dosya açılamadı: ", "Could not open file: ") + file.name + "\n\n" + friendly);
      XL.status("");
    }
  },

  // Office biçim MIME türleri (yerinde kaydetme konum seçicisi için)
  MIME: {
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },

  /* İndir: her zaman bir KOPYA indirir (tarayıcının indirme klasörüne).
   * "Kaydet"ten farkı: dosya tutamacının üstüne yazmaz, konum sormaz; yalnız
   * bir .xlsx/.docx/.pptx kopyası üretip indirir. "Değişti" durumunu bozmaz. */
  async download() {
    const doc = this.active();
    if (!doc) return;
    const m = this.modeOf(doc);
    if (XL.grid && XL.grid.editing && doc.type === "xlsx") XL.grid.commitEdit();
    let blob;
    try {
      blob = await m.buildBlob(doc);
    } catch (err) {
      console.error(err);
      return alert(XL.t("İndirilemedi: ", "Could not download: ") + (err && err.message || err));
    }
    const fname = doc.name + m.ext;
    XL.download(blob, fname);
    XL.status(XL.t("İndirildi: ", "Downloaded: ") + fname);
  },

  /* Kaydet:
   *  1) Belgenin bir dosya tutamacı varsa (açılan dosya) → ÜSTÜNE YAZ (yerinde kaydet).
   *  2) Yoksa ve tarayıcı destekliyorsa → konum sor (Farklı Kaydet), tutamacı sakla.
   *  3) Hiçbiri yoksa → indir (eski davranış, yedek). */
  async save() {
    const doc = this.active();
    if (!doc) return;
    const m = this.modeOf(doc);
    if (XL.grid && XL.grid.editing && doc.type === "xlsx") XL.grid.commitEdit();

    let blob;
    try {
      blob = await m.buildBlob(doc);
    } catch (err) {
      console.error(err);
      return alert(XL.t("Kaydedilemedi: ", "Could not save: ") + (err && err.message || err));
    }

    const ext = m.ext;                 // ".xlsx" / ".docx" / ".pptx"
    const fname = doc.name + ext;
    const mime = this.MIME[doc.type] || "application/octet-stream";

    try {
      // 1) Tutamaç varsa üstüne yaz
      if (doc.handle && XL.fsa.canSave()) {
        if (await XL.fsa.ensureWritable(doc.handle)) {
          await XL.fsa.write(doc.handle, blob);
          doc.dirty = false; this._syncTabDirty(doc.id);
          XL.status(XL.t("Kaydedildi: ", "Saved: ") + (doc.handle.name || fname));
          return;
        }
        // izin verilmediyse Farklı Kaydet'e düş
      }

      // 2) Tutamaç yok → konum sor (Farklı Kaydet)
      if (XL.fsa.canSave()) {
        let handle;
        try {
          handle = await window.showSaveFilePicker({
            suggestedName: fname,
            types: [{ description: m.label, accept: { [mime]: [ext] } }],
          });
        } catch (e) {
          if (e && e.name === "AbortError") return;   // kullanıcı iptal etti
          throw e;
        }
        await XL.fsa.write(handle, blob);
        doc.handle = handle;
        doc.name = (handle.name || fname).replace(/\.[^.]+$/, "");
        doc.dirty = false;
        this.renderDocTabs();
        if (doc.id === this.activeId) document.getElementById("doc-title").textContent = doc.name + ext;
        XL.status(XL.t("Kaydedildi: ", "Saved: ") + (handle.name || fname));
        return;
      }

      // 3) Yedek: indir
      XL.download(blob, fname);
      doc.dirty = false; this._syncTabDirty(doc.id);
      XL.status(XL.t("İndirildi: ", "Downloaded: ") + fname);
    } catch (err) {
      console.error(err);
      alert(XL.t("Kaydedilemedi: ", "Could not save: ") + (err && err.message || err));
    }
  },

  // "Farklı Kaydet": tutamacı yok sayıp her zaman yeni konum sor (varsa).
  async saveAs() {
    const doc = this.active();
    if (doc) doc.handle = null;
    return this.save();
  },

  /* ---------- Kalıcılık (tarayıcı belleği) ---------- */
  changed() {
    const d = this.active();
    if (d && !d.dirty) { d.dirty = true; this._syncTabDirty(d.id); }
    if (d && d.id === this._pristineDefaultId) this._pristineDefaultId = null; // düzenlendi
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persistNow(), 500);
  },

  // Tek bir sekmenin "değişti" göstergesini (nokta) güncelle (tümünü yeniden çizmeden).
  _syncTabDirty(id) {
    const doc = this.docs.find((d) => d.id === id);
    const tab = document.querySelector(`#doctabs .doctab[data-id="${id}"]`);
    if (doc && tab) tab.classList.toggle("dirty", !!doc.dirty);
  },

  persistNow() {
    clearTimeout(this.saveTimer);
    const doc = this.active();
    if (doc && this.mounted) {
      try { doc.data = this.modeOf(doc).serialize(); } catch (e) { console.error(e); }
    }
    this._save(doc);
  },

  // Etkin belgeyi + meta'yı kaydet (eşzamansız, ateşle-unut)
  async _save(doc) {
    if (!XL.store.available()) return this._saveLocal();
    try {
      if (doc) await XL.store.saveDoc(doc);
      await XL.store.saveMeta({ order: this.docs.map((d) => d.id), activeId: this.activeId });
    } catch (e) {
      console.error("Kayıt hatası:", e);
      XL.status(XL.t("⚠ Otomatik kayıt yapılamadı (", "⚠ Auto-save failed (") + (e && e.name === "QuotaExceededError" ? XL.t("disk alanı dolu", "disk full") : XL.t("depolama hatası", "storage error")) + XL.t(") — 💾 Kaydet ile indirin.", ") — download with 💾 Save."));
    }
  },

  // Tüm belgeleri kaydet (açılış / göç sonrası)
  async _saveAll() {
    if (!XL.store.available()) return this._saveLocal();
    try {
      for (const d of this.docs) await XL.store.saveDoc(d);
      await XL.store.saveMeta({ order: this.docs.map((d) => d.id), activeId: this.activeId });
    } catch (e) {
      console.error("Toplu kayıt hatası:", e);
      XL.status(XL.t("⚠ Otomatik kayıt yapılamadı (depolama) — 💾 Kaydet ile indirin.", "⚠ Auto-save failed (storage) — download with 💾 Save."));
    }
  },

  // Son çare: IndexedDB yoksa (eski/kısıtlı tarayıcı, gizli sekme) localStorage
  _saveLocal() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify({ docs: this.docs, activeId: this.activeId }));
    } catch (e) {
      XL.status(XL.t("⚠ Otomatik kayıt yapılamadı (tarayıcı belleği dolu) — 💾 Kaydet ile indirin.", "⚠ Auto-save failed (browser storage full) — download with 💾 Save."));
    }
  },

  async restore() {
    if (XL.store.available()) {
      try {
        const { docs, meta } = await XL.store.loadAll();
        if (docs && docs.length) {
          this.docs = docs.filter((d) => XL.modes[d.type]);
          if (!this.docs.length) return false;
          if (meta && Array.isArray(meta.order)) {
            const pos = (id) => { const i = meta.order.indexOf(id); return i < 0 ? 1e9 : i; };
            this.docs.sort((a, b) => pos(a.id) - pos(b.id));
          }
          this.activeId = meta && this.docs.some((d) => d.id === meta.activeId) ? meta.activeId : this.docs[0].id;
          return true;
        }
        // IndexedDB boş → eski localStorage kaydını taşı
        if (this.restoreLocal()) { await this._saveAll(); this._clearLocal(); return true; }
        return false;
      } catch (e) {
        console.error("IndexedDB okunamadı, localStorage'a düşülüyor:", e);
      }
    }
    return this.restoreLocal();
  },

  // localStorage'tan oku (yeni uniteam-v1; yoksa eski weboffice-v2 / ilk sürüm webexcel-v1)
  restoreLocal() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(this.KEY) || localStorage.getItem("weboffice-v2")); } catch (e) {}
    if (data && Array.isArray(data.docs) && data.docs.length) {
      this.docs = data.docs.filter((d) => XL.modes[d.type]);
      if (!this.docs.length) return false;
      this.activeId = this.docs.some((d) => d.id === data.activeId) ? data.activeId : this.docs[0].id;
      return true;
    }
    return this.migrateV1();
  },

  _clearLocal() {
    try { localStorage.removeItem(this.KEY); this.OLD_KEYS.forEach((k) => localStorage.removeItem(k)); } catch (e) {}
  },

  // İlk sürümün (yalnızca Excel) kaydını yeni biçime taşı
  migrateV1() {
    let old = null;
    try { old = JSON.parse(localStorage.getItem("webexcel-v1")); } catch (e) {}
    if (!old || !old.sheets || !old.sheets.length) return false;
    const sheets = old.sheets.map((s, i) => {
      const formats = {};
      Object.entries(old.formats || {}).forEach(([k, f]) => {
        const [sid, r, c] = k.split(":");
        if (+sid === i) formats[r + ":" + c] = f;
      });
      return { name: s.name, cells: s.cells || {}, formats };
    });
    const doc = this.makeDoc("xlsx", { rows: old.rows || 100, cols: old.cols || 26, activeSheet: 0, sheets });
    this.docs = [doc];
    this.activeId = doc.id;
    return true;
  },
};

window.addEventListener("DOMContentLoaded", () => XL.ws.init());
