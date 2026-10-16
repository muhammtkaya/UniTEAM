# UniTEAM

Excel, Word ve PowerPoint'e muadil üç uygulamayı **tek bir tarayıcı arayüzünde** birleştiren web uygulaması.

Uygulama Excel arayüzüyle açılır. Alt soldaki **＋** düğmesiyle yeni bir belge eklenir ve türü seçilir: Excel çalışma kitabı (`.xlsx`), Word belgesi (`.docx`) ya da PowerPoint sunusu (`.pptx`). Alt çubuktaki her sekme bir belgedir; bir sekmeye geçildiğinde üstteki şerit ve çalışma alanı o uygulamanın arayüzüne dönüşür.

Proje şu an yalnızca web tabanlıdır. İleride masaüstü (Electron/Tauri) ve mobil uygulamaya çevrilmesi planlanıyor; bu yüzden derleme adımı olmayan, statik dosyalardan oluşan bir yapı seçildi.

---

## Çalıştırma

Proje artık **Vite** ile paketlenir (kütüphaneler npm'den gelir, CDN gerekmez,
çevrimdışı çalışır). Node.js 18+ gerekir.

```bash
npm install        # bağımlılıkları kur (ilk sefer)
npm run dev        # geliştirme sunucusu → http://localhost:5173 (anında yenileme)
npm run build      # üretim derlemesi → dist/
npm run preview    # dist/ çıktısını önizle
```

- Chrome, Edge ve Firefox'un güncel sürümleri hedeflenir.
- Ortam değişkenleri `.env` ile yönetilir (bkz. `.env.example`). Supabase
  bağlantısı boş bırakılırsa kod yerel varsayılanlara düşer.
- **PWA:** Uygulama yüklenebilir (tarayıcıda "Uygulamayı yükle") ve **çevrimdışı
  çalışır** (service worker uygulama kabuğunu önbelleğe alır). SW yalnız üretim
  derlemesinde (`build`/`preview`) etkindir; `dev`'de kapalıdır.

> Not: ES modülleri kullanıldığı için `index.html` artık çift tıklanarak
> (`file://`) açılamaz; `npm run dev` ya da derlenmiş `dist/` üzerinden sunulur.

---

## Özellikler

### Ortak
- **＋ menüsü** ile türlü belgeler; sekmeler türüne göre renklidir (yeşil Excel, mavi Word, turuncu PowerPoint).
- Çift tıklayarak belgeyi yeniden adlandırma, **×** ile kapatma.
- **Aç** (Ctrl+O): `.xlsx .xls .csv .docx .pptx` dosyaları türüne uygun yeni bir sekmede açılır. Dosyayı pencereye sürükleyip bırakmak da çalışır.
- **Kaydet** (Ctrl+S): etkin belgeyi kendi biçiminde indirir.
- **Otomatik kayıt:** tüm belgeler tarayıcı belleğine (localStorage) kaydedilir; sayfa yenilense de geri gelir.
- Office'teki gibi sekmeli şerit (Giriş, Ekle, …).

### Excel
| Alan | Neler var |
|---|---|
| Hücreler | Seçim (tıkla, sürükle, Shift), yazarak veya çift tıklayarak düzenleme, ad kutusu (`B3`, `A1:C5`), formül çubuğu |
| Formüller | 394 fonksiyon (SUM, IF, VLOOKUP, XLOOKUP, SUMIFS, PMT, FILTER, UNIQUE…), sayfalar arası başvuru, otomatik yeniden hesaplama |
| Biçim | Kalın/italik/altı çizili, yazı ve dolgu rengi, hizalama, sayı biçimleri (sayı, ₺, %, tarih) |
| Düzenleme | Satır/sütun ekle-sil (formüller kayar), Σ Otomatik Toplam, A→Z / Z→A sıralama, bul-değiştir, geri al/ileri al |
| Veri | Filtre, yinelenenleri kaldırma, CSV indirme |
| Analiz | 9 grafik türü (PNG indirilebilir), pivot tablo (sonuç yeni sayfaya yazılabilir) |
| Görünüm | Üst satırı / ilk sütunu dondurma, kılavuz çizgileri, yakınlaştırma, formülleri gösterme |
| Diğer | Birden çok sayfa, durum çubuğunda Toplam/Ortalama/Sayı, gerçek Excel'den sekmeli yapıştırma |

### Word
| Alan | Neler var |
|---|---|
| Yazı | Yazı tipi, punto, kalın/italik/altı çizili/üstü çizili, üst-alt simge, renk, vurgu |
| Paragraf | Hizalama, madde işaretleri, numaralandırma, girinti, satır aralığı, stiller (Başlık 1–4, Alıntı, Kod) |
| Ekle | Tablo (satır/sütun ekle-sil, Tab ile gezinme), resim, bağlantı, yatay çizgi, sayfa sonu, tarih, simge |
| Düzen | Kenar boşlukları, dikey/yatay sayfa, A4 / Letter / A5 |
| Diğer | Bul-değiştir, sözcük sayımı, yazım denetimi, yazdırma / PDF |

### PowerPoint
| Alan | Neler var |
|---|---|
| Slaytlar | 6 düzen, yeni/çoğalt/sil, küçük resimlerde sürükleyerek sıralama |
| Öğeler | Metin kutusu, resim, tablo, 7 şekil; sürükleyerek taşıma, tutamaçlarla boyutlandırma (Shift: oranı koru), öne/arkaya |
| Biçim | Yazı tipi, punto, renk, listeler, yatay/dikey hizalama, şekil dolgusu ve çerçevesi |
| Tasarım | 6 tema, slayt arka planı (tek slayt veya tümü) |
| Gösteri | Geçişler (solma, itme, yakınlaştırma, çevirme), tam ekran slayt gösterisi (F5 / Shift+F5) |
| Diğer | Konuşmacı notları, geri al/ileri al (tema ve notlar dahil) |

---

## Klavye kısayolları

| Kısayol | Excel | Word | PowerPoint |
|---|---|---|---|
| Ctrl+S / Ctrl+O | Kaydet / Aç | Kaydet / Aç | Kaydet / Aç |
| Ctrl+Z / Ctrl+Y | Geri al / İleri al | Geri al / İleri al | Geri al / İleri al |
| Ctrl+B / I / U | Kalın / İtalik / Altı çizili | Kalın / İtalik / Altı çizili | (metin düzenlerken) |
| Ctrl+C / X / V | Kopyala / Kes / Yapıştır | Kopyala / Kes / Yapıştır | Öğeyi kopyala / yapıştır |
| F2 | Hücreyi düzenle | | Seçili kutuyu düzenle |
| Ctrl+H | | Bul ve değiştir | |
| Ctrl+E / L / R / J | | Ortala / Sola / Sağa / İki yana | |
| Ctrl+Enter | | Sayfa sonu | |
| Ctrl+M / Ctrl+D | | | Yeni slayt / Öğeyi çoğalt |
| F5 / Shift+F5 | | | Gösteri baştan / geçerli slayttan |
| Ok tuşları | Hücreler arası gezinme | | Öğeyi 1 px kaydır (Shift: 10 px) |

---

## Dosya uyumluluğu

| Biçim | Okuma | Yazma | Not |
|---|---|---|---|
| `.xlsx` / `.xls` | ✔ | ✔ (`.xlsx`) | Formüller, sayfalar ve temel sayı biçimleri korunur |
| `.csv` | ✔ | ✔ | Etkin sayfa, UTF-8 |
| `.docx` | ✔ | ✔ | Başlıklar, hizalama, renk, punto, yazı tipi, listeler, tablolar ve resimler korunur |
| `.pptx` | ✔ | ✔ | Metin biçimleri, madde işaretleri, şekiller, resimler, tablolar, notlar ve arka plan korunur |

`.docx` ve `.pptx` dosyaları, hazır kütüphanelerin attığı biçim bilgilerini koruyabilmek için kendi OOXML okuyucularımızla okunur. `.docx` okuması başarısız olursa yedek olarak mammoth kullanılır.

---

## Proje yapısı

```
index.html            Kabuk: üst çubuk, şerit, çalışma alanı, belge çubuğu, CDN betikleri
css/styles.css        Tüm stiller (mod renkleri, şerit, üç modun arayüzü, yazdırma kuralları)
js/
  core.js             Ortak ad alanı (XL), yardımcılar, paylaşılan panel
  workspace.js        Belgeler, ＋ menüsü, mod değiştirme, şerit, açma/kaydetme, otomatik kayıt
  excel/
    mode.js           Excel modu: şerit, formül çubuğu, sayfa sekmeleri, komutlar
    engine.js         HyperFormula sarmalayıcısı (hesap motoru)
    grid.js           Izgara: çizim, seçim, düzenleme, klavye, pano
    format.js         Hücre biçimi ve sayı gösterimi
    io.js             .xlsx / .csv okuma-yazma (SheetJS)
    charts.js         Grafikler (Chart.js)
    pivot.js          Pivot tablo
  word/
    mode.js           Word modu: sayfa düzenleyici, şerit, komutlar
    docx-io.js        .docx okuma (kendi OOXML okuyucusu) ve yazma (docx)
  pptx/
    mode.js           PowerPoint modu: slaytlar, öğe düzenleme, temalar, slayt gösterisi
    pptx-io.js        .pptx okuma (kendi OOXML okuyucusu) ve yazma (PptxGenJS)
```

---

## Mimari

Her uygulama bir **mod** nesnesidir ve `XL.modes.xlsx`, `XL.modes.docx`, `XL.modes.pptx` altında kendini kaydeder. `workspace.js` belgeleri yönetir ve etkin belgenin türüne göre ilgili modu bağlar.

Her belge şu biçimde tutulur:

```js
{ id, type: "xlsx" | "docx" | "pptx", name, data }
```

Her mod aynı arayüzü uygular:

| Üye | Görevi |
|---|---|
| `type`, `label`, `icon`, `ext`, `docPrefix`, `accept` | Tanım bilgileri |
| `createData()` | Boş belge verisi |
| `ribbon()` | Şerit sekmeleri: `[{ name, html }]` |
| `mount(doc)` / `unmount(doc)` | Arayüzü kur / canlı durumu `doc.data`'ya yaz |
| `serialize()` | Canlı durumu belge verisine çevir (otomatik kayıt için) |
| `command(cmd, value)` | Şeritteki `data-cmd` denetimlerinin işleyicisi |
| `isOn(state)` | Açık/kapalı düğmelerin durumu (`data-state`) |
| `importFile(file)` → `data` | Dosyadan belge verisi üret |
| `save(doc)` | Dosyayı indir |
| `beforeRibbon()` *(isteğe bağlı)* | Şeride tıklanmadan önce metin seçimini sakla |
| `insertImageFile(file)` *(isteğe bağlı)* | Sürükle-bırak ile gelen resmi ekle |

Yeni bir uygulama (ör. Outlook muadili) eklemek için bu arayüzü uygulayan bir mod yazmak, betiğini `index.html`'e eklemek ve `#new-menu`'ye bir seçenek koymak yeterlidir.

Şerit düğmeleri `data-cmd` (ve isteğe bağlı `data-value`) öznitelikleriyle tanımlanır; tıklamalar `workspace.js` tarafından tek noktadan etkin modun `command()` yöntemine iletilir.

---

## Kullanılan açık kaynak kütüphaneler

| Kütüphane | Sürüm | Görevi | Lisans |
|---|---|---|---|
| [HyperFormula](https://hyperformula.handsontable.com/) | 2.7.0 | Excel formül ve hesap motoru | GPL-3.0 (veya ticari) |
| [SheetJS](https://sheetjs.com/) | 0.20.3 | `.xlsx` / `.csv` okuma-yazma | Apache-2.0 |
| [Chart.js](https://www.chartjs.org/) | 4.4.1 | Grafikler | MIT |
| [docx](https://docx.js.org/) | 8.5.0 | `.docx` yazma | MIT |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | 1.8.0 | Yedek `.docx` okuma | BSD-2-Clause |
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | `.docx` / `.pptx` paketlerini açma | MIT / GPL-3.0 |
| [PptxGenJS](https://gitbrent.github.io/PptxGenJS/) | 3.12.0 | `.pptx` yazma | MIT |

> **Lisans notu:** HyperFormula `gpl-v3` lisans anahtarıyla kullanılıyor. Uygulama dağıtılacaksa bu, projenin GPL-3.0 uyumlu bir lisansla yayımlanmasını ya da HyperFormula için ticari lisans alınmasını gerektirir. Projenin kendisi için henüz bir lisans dosyası yok.

---

## Bilinen sınırlamalar

- **Otomatik kayıt kotası:** tarayıcı belleği yaklaşık 5 MB'tır. Çok resimli belgelerde otomatik kayıt başarısız olabilir; durum çubuğunda uyarı çıkar. Bu durumda **Kaydet** ile dosyayı indirin.
- **Belgeler tarayıcıya özeldir:** otomatik kaydedilen veriler yalnızca o tarayıcıda durur; başka bir cihaza veya tarayıcıya taşınmaz.
- **Excel:** koşullu biçimlendirme, veri doğrulama, hücre birleştirme, sütun genişliği ayarı ve Türkçe fonksiyon adları (`=TOPLA`) henüz yok. Fonksiyonlar İngilizce adlarıyla yazılır (gerçek `.xlsx` dosyaları da böyle saklar).
- **Word:** üst/alt bilgi, dipnot, yorum ve değişiklik izleme yok. Sayfa sınırları çizgiyle gösterilir; metin henüz gerçek sayfalara bölünmez.
- **PowerPoint:** öğe animasyonları, döndürme ve slayta grafik ekleme yok. Slayt geçişleri `.pptx` dosyasına aktarılmaz.
- **Dokunmatik ekranlar** için ayrıca bir uyarlama yapılmadı.

---

## Yol haritası

1. Excel'deki eksikler (koşullu biçim, veri doğrulama, birleştirme, sütun genişliği, Türkçe fonksiyon adları)
2. Word'de üst/alt bilgi, dipnot, yorumlar ve gerçek sayfalama
3. PowerPoint'te animasyonlar, döndürme ve slayta grafik
4. Dokunmatik / mobil arayüz
5. Masaüstü (Electron veya Tauri) ve mobil paketleme
6. Diğer Office uygulamalarının muadilleri
