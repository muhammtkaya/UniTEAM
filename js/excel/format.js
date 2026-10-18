/* excel/format.js — hücre biçimlendirme ve sayı biçimi gösterimi */
XL.format = {
  // Seçili hücrelere bir biçim uygula (toggle veya değer)
  apply(kind, value) {
    XL.forEachInSelection((r, c) => {
      const cur = XL.getFormat(r, c);
      switch (kind) {
        case "bold":      XL.setFormat(r, c, { bold: !cur.bold }); break;
        case "italic":    XL.setFormat(r, c, { italic: !cur.italic }); break;
        case "underline": XL.setFormat(r, c, { underline: !cur.underline }); break;
        case "color":     XL.setFormat(r, c, { color: value }); break;
        case "bg":        XL.setFormat(r, c, { bg: value }); break;
        case "align-left":   XL.setFormat(r, c, { align: "left" }); break;
        case "align-center": XL.setFormat(r, c, { align: "center" }); break;
        case "align-right":  XL.setFormat(r, c, { align: "right" }); break;
        case "numfmt":    XL.setFormat(r, c, { numfmt: value }); break;
        case "clear":     delete XL.state.formats[XL.fmtKey(r, c)]; break;
      }
    });
    XL.grid.render();
    XL.grid.updateSelection();
    XL.ws.changed();
  },

  // Bir td'ye kayıtlı biçimi uygula
  styleCell(td, r, c) {
    const f = XL.getFormat(r, c);
    td.style.fontWeight = f.bold ? "700" : "";
    td.style.fontStyle = f.italic ? "italic" : "";
    td.style.textDecoration = f.underline ? "underline" : "";
    td.style.color = f.color || "";
    td.style.background = f.bg || "";
    if (f.align) td.style.textAlign = f.align;
  },

  // Hesaplanmış değeri biçime göre metne çevir
  // Aktif arayüz diline göre BCP-47 etiketi ve para birimi (yerel biçimler — Faz 5).
  _loc() { return ({ tr: "tr-TR", en: "en-US", de: "de-DE", es: "es-ES", ar: "ar-SA" })[(XL.i18n && XL.i18n.locale) || "tr"] || "tr-TR"; },
  _ccy() { return ({ tr: "TRY", en: "USD", de: "EUR", es: "EUR", ar: "SAR" })[(XL.i18n && XL.i18n.locale) || "tr"] || "TRY"; },

  display(value, r, c) {
    if (value === null || value === undefined || value === "") return "";
    if (XL.isError(value)) return value.value; // #DIV/0! vb.
    if (typeof value === "boolean") return value ? XL.t("DOĞRU", "TRUE") : XL.t("YANLIŞ", "FALSE");

    const f = XL.getFormat(r, c);
    const fmt = f.numfmt || "general";
    const isNum = typeof value === "number";

    if (!isNum) return String(value);

    const loc = this._loc();
    switch (fmt) {
      case "number":
        return value.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case "currency":
        return value.toLocaleString(loc, { style: "currency", currency: this._ccy() });
      case "percent":
        return (value * 100).toLocaleString(loc, { maximumFractionDigits: 2 }) + "%";
      case "date":
        return XL.format.serialToDate(value);
      default:
        // Genel: gereksiz sıfırları at
        return Number.isInteger(value) ? String(value)
          : value.toLocaleString(loc, { maximumFractionDigits: 10 });
    }
  },

  // Excel seri tarihini (1 = 1899-12-31) okunur tarihe çevir (yerel biçim)
  serialToDate(serial) {
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (isNaN(d)) return String(serial);
    return d.toLocaleDateString(XL.format._loc());
  },

  isNumeric(value) {
    return typeof value === "number";
  },
};
