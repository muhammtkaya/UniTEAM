# UniTEAM

Excel, Word ve PowerPoint'e muadil üç uygulamayı **tek bir tarayıcı arayüzünde** birleştiren web uygulaması.

Uygulama Excel arayüzüyle açılır. Alt soldaki **＋** düğmesiyle yeni bir belge eklenir ve türü seçilir: Excel çalışma kitabı (`.xlsx`), Word belgesi (`.docx`) ya da PowerPoint sunusu (`.pptx`). Alt çubuktaki her sekme bir belgedir; bir sekmeye geçildiğinde üstteki şerit ve çalışma alanı o uygulamanın arayüzüne dönüşür.

Uygulama **testler kolaylaşsın diye önce tarayıcıda** geliştirilmiştir (hızlı yineleme, derleme/sertifika derdi yok). Bu geçici bir tercihtir: **uygulama bittiğinde masaüstü (Electron/Tauri) ve mobil sürümleri de üretilecektir.** İstemci (frontend) ile sunucu (backend) net ayrıldığı ve üçü de aynı API'ye bağlandığı için web, masaüstü ve mobil istemciler aynı çekirdeği paylaşır — platform paketlemesi en sona bırakılır.

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
- **Backend opsiyoneldir:** uygulama giriş yapmadan, backend olmadan tam çalışır
  (yerel belgeler). Bulut/işbirliği özelliklerini yerelde denemek için Supabase
  (`supabase start`) ve Worker (`cd worker && npx wrangler dev`) ayağa kaldırılır;
  canlı hesaplar ve deploy → Faz 9 ([docs/accounts.md](docs/accounts.md)).

> Not: ES modülleri kullanıldığı için `index.html` artık çift tıklanarak
> (`file://`) açılamaz; `npm run dev` ya da derlenmiş `dist/` üzerinden sunulur.

---

## Özellikler

### Ortak
- **＋ menüsü** ile türlü belgeler; sekmeler türüne göre renklidir (yeşil Excel, mavi Word, turuncu PowerPoint).
- Çift tıklayarak belgeyi yeniden adlandırma, **×** ile kapatma.
- **Aç** (Ctrl+O): `.xlsx .xls .csv .docx .pptx` dosyaları türüne uygun yeni bir sekmede açılır. Dosyayı pencereye sürükleyip bırakmak da çalışır.
- **Kaydet** (Ctrl+S): etkin belgeyi kendi biçiminde indirir.
- **Otomatik kayıt:** tüm belgeler tarayıcıya (IndexedDB) kaydedilir; sayfa yenilense de geri gelir. Çevrimdışıyken yapılan bulut kayıtları kuyruğa alınır, yeniden bağlanınca eşitlenir.
- **Çok dilli arayüz:** 🌐 menüsünden dil (TR/EN tam; DE/ES/AR çekirdek), RTL (Arapça), yerel sayı/tarih/para biçimleri, Türkçe formül adları (`=TOPLA`, `=EĞER`…).
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

### İşbirliği, bulut ve hesaplar
| Alan | Neler var |
|---|---|
| Hesap | E-posta+parola kayıt/giriş (Supabase Auth), 2FA/MFA (TOTP), giriş geçmişi + "diğer/her yerden çık", yeni cihaz bildirimi |
| Bulut | Belgeyi buluta kaydet/aç, sürüm geçmişi (🕘), çöp kutusu (🗑), çevrimdışı kuyruk |
| Paylaşım | E-posta+rol (owner/editor/commenter/viewer), token'lı bağlantı, herkese açık (anon) link, süreli link, gerçek salt-okunur mod |
| Gerçek zamanlı | **Word + PowerPoint + Excel eş düzenleme** (Yjs CRDT), presence rozetleri, canlı uzak imleç + hücre/öğe seçim göstergeleri |
| Yorumlar | Thread + @bahsetme + bildirimler (zil), canlı yenileme, editörde konuma iliştirilmiş (anchored) işaretçiler |
| Organizasyon | Çok-kiracılık (org/takım), RBAC (admin/üye), üye davet/rol/askı, belge sahipliği devri, denetim kaydı |
| Plan & kota | Plan kataloğu (Free/Pro/Team/Enterprise), koltuk/belge/depolama kotası + sunucu enforcement, "💳 Plan ve Faturalandırma" paneli *(gerçek ödeme → Faz 9)* |
| Gizlilik | "Verilerimi indir" (yerel + hesap), hesap silme, KVKK/GDPR taslak yasal metinler |

> Hesap/işbirliği özellikleri **eklemeli katmandır**: giriş yapmadan da yerel belge akışı tam çalışır. Bulut/gerçek zamanlı özellikler bir Supabase + Cloudflare Worker hesabına bağlanınca canlıya girer (bkz. [docs/accounts.md](docs/accounts.md)); yerelde geliştirilip Faz 9'da deploy edilir.

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
index.html            Kabuk: üst çubuk, şerit, çalışma alanı, belge çubuğu (tek giriş: src/main.js)
src/
  main.js             Vite giriş noktası — tüm modülleri doğru sırada import eder
  vendor.js           Kütüphaneleri window global'lerine köprüler + .env → window.__ENV__
css/styles.css        Tüm stiller (mod renkleri, şerit, üç modun arayüzü, panel/billing, yazdırma)
js/
  core.js             Ortak ad alanı (XL), yardımcılar, paylaşılan panel
  config.js           Ortam ayarları + XL.config.services HESAP/SERVİS kayıt defteri
  i18n.js             Çoklu dil (N dil + sözlük + RTL) + Türkçe fonksiyon adları
  observability.js    Gözlemlenebilirlik (XL.obs: log/breadcrumb/hata yakalama; DSN boşsa ağsız)
  workspace.js        Belgeler, ＋ menüsü, mod değiştirme, şerit, açma/kaydetme, otomatik kayıt
  storage.js          IndexedDB kalıcılık (belgeler + çevrimdışı outbox kuyruğu)
  auth.js             Kimlik (Supabase Auth): kayıt/giriş/çıkış, hesap menüsü
  cloud.js            Bulut belge katmanı + paylaşım + sürüm/çöp kutusu
  org.js              Organizasyonlar & admin paneli (çok-kiracılık, RBAC, davet, denetim)
  billing.js          Plan/koltuk/kota + faturalandırma paneli (XL.billing)
  security.js         Hesap güvenliği (2FA/MFA, giriş geçmişi, oturum yönetimi)
  privacy.js          Veri hakları (indir/sil) + KVKK/GDPR taslak yasal metinler
  byos.js             Belge byte deposu sağlayıcı soyutlaması (relay + Drive/OneDrive iskeleti)
  onboarding.js       Karşılama + yardım paneli + şablon galerisi
  comments.js         Yorumlar + @bahsetmeler + bildirimler
  realtime.js         Gerçek zamanlı eş düzenleme (Yjs CRDT + Durable Object; artımlı render)
  excel/
    mode.js           Excel modu: şerit, formül çubuğu, sayfa sekmeleri, komutlar
    formula.js        Kendi formül/hesap motorumuz (HyperFormula yerine, bağımlılıksız)
    engine.js         Hesap motoru sarmalayıcısı (formula.js'i kullanır)
    grid.js           Izgara: çizim, seçim, düzenleme, klavye, pano
    format.js         Hücre biçimi ve sayı gösterimi
    layout.js         Sütun genişliği / satır yüksekliği / hücre birleştirme
    io.js             .xlsx okuma (SheetJS+stil ExcelJS) / yazma (ExcelJS), .csv
    charts.js         Grafikler (Chart.js)
    pivot.js          Pivot tablo
    condfmt.js        Koşullu biçimlendirme (kural → dinamik hücre stili)
    validation.js     Veri doğrulama (açılır liste / sayı / metin uzunluğu)
  word/
    mode.js           Word modu: sayfa düzenleyici, dipnot, değişiklik izleme, sayfalama
    docx-io.js        .docx okuma (kendi OOXML okuyucusu) ve yazma (docx)
  pptx/
    mode.js           PowerPoint modu: slaytlar, öğe düzenleme, grafik, animasyon, gösteri
    pptx-io.js        .pptx okuma (kendi OOXML okuyucusu) ve yazma (PptxGenJS)
worker/               Cloudflare Worker (ince backend): JWT doğrulama, WS/DocRoom relay,
                      snapshot sıkıştırma (Yjs mergeUpdates), rate-limit
supabase/             Postgres şeması + migration'lar (RLS, RPC'ler, çok-kiracılık, billing)
docs/                 api-contract.md · database-schema.md · accounts.md (hesap yol haritası)
test/                 Puppeteer e2e + dosya sadakati (fidelity) + gerçek Office korpusu
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

### Backend & bulut mimarisi

**İstemci (frontend) ile sunucu (backend) net ayrılmıştır** — istemci her zaman standart bir API/protokol üzerinden konuşur. Böylece web, masaüstü ve mobil istemciler **aynı backend'i** paylaşır (tek "mutfak", çok "salon"). İki backend katmanı (ölçek eğrileri farklı olduğu için ayrı seçildi):

| Katman | Teknoloji | Görevi |
|---|---|---|
| **Durağan** | **Supabase** (Postgres + Auth + Storage, RLS) | Hesaplar, belge metadata'sı, paylaşım/izin, organizasyon, abonelik. Güvenlik satır-seviyesi (RLS) + SECURITY DEFINER RPC'lerindedir. |
| **Gerçek zamanlı** | **Cloudflare Worker + Durable Objects** + **Yjs** CRDT | "Belge = oda" relay; JWT doğrulama, WS yetki (403), presence, snapshot sıkıştırma. Sunucuda Y.Doc çalışmaz (yalnız relay + depo). |

**BYOS (Bring Your Own Storage):** belge byte'larını kalıcı olarak biz saklamayız — bugün geçici `relay` (Supabase Storage), ileride kullanıcının Drive/OneDrive'ı. Biz yalnız CRDT durumu + küçük meta veri tutarız.

**Hesap/servis geçitleme:** her dış servis `js/config.js` içindeki `XL.config.services` kayıt defterinde tanımlıdır (`when: "now"|"future"`, `configured()`). Bir hesabın env anahtarı girilene kadar ilgili özellik **zarifçe devre dışı** kalır (ör. gözlemlenebilirlik DSN boşsa ağa çıkmaz; Drive hesabı yoksa seçenek görünmez). Hangi hesabın ne zaman açılacağı: [docs/accounts.md](docs/accounts.md). Gizli anahtarlar istemciye değil Worker secret'ına konur; güvenlik RLS + Worker'dadır.

---

## Kullanılan açık kaynak kütüphaneler

| Kütüphane | Sürüm | Görevi | Lisans |
|---|---|---|---|
| [SheetJS](https://sheetjs.com/) | 0.20.3 | `.xlsx` okuma (değer/formül) + `.csv` | Apache-2.0 |
| [ExcelJS](https://github.com/exceljs/exceljs) | 4.4.0 | `.xlsx` yazma + dış dosyadan stil okuma (font/dolgu/hizalama) | MIT |
| [Chart.js](https://www.chartjs.org/) | 4.4.1 | Grafikler | MIT |
| [docx](https://docx.js.org/) | 8.5.0 | `.docx` yazma | MIT |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | 1.13.0 | Yedek `.docx` okuma | BSD-2-Clause |
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | `.docx` / `.pptx` paketlerini açma | MIT / GPL-3.0 |
| [PptxGenJS](https://gitbrent.github.io/PptxGenJS/) | 3.12.0 | `.pptx` yazma | MIT |
| [Yjs](https://github.com/yjs/yjs) | 13.6.20 | Gerçek zamanlı eş düzenleme (CRDT) + snapshot birleştirme | MIT |
| [supabase-js](https://github.com/supabase/supabase-js) | 2.118.0 | Supabase istemcisi (Auth/DB/Storage/Realtime) | MIT |

> Worker tarafı ayrıca [jose](https://github.com/panva/jose) (JWT doğrulama) ve Yjs `mergeUpdates` kullanır.
>
> **Lisans notu:** Excel formül motoru GPL-3.0 lisanslı HyperFormula'dan **kendi bağımsız, bağımlılıksız motorumuza** (`js/excel/formula.js`) taşındı; bu yüzden ürünü GPL'e zorlayan engel kalktı. Kalan kütüphaneler (SheetJS Apache-2.0; ExcelJS/Chart.js/docx/JSZip/PptxGenJS/Yjs/supabase-js MIT; mammoth BSD-2) ticari dağıtıma uygundur. JSZip'in MIT sürümü kullanılır. Projenin kendi lisansı `LICENSE` dosyasında tescilli (proprietary) olarak tanımlıdır; üçüncü taraf atıfları `THIRD-PARTY-NOTICES.md`'dedir.

---

## Bilinen sınırlamalar

- **Yerel vs bulut:** otomatik kayıt yerel IndexedDB'dedir (o tarayıcıya özel). Başka cihaza taşımak/paylaşmak/eş düzenlemek için **buluta kaydet** gerekir — bu da canlı bir Supabase + Worker hesabı ister (şu an yerelde geliştiriliyor; canlı → Faz 9, bkz. [docs/accounts.md](docs/accounts.md)).
- **Faturalandırma simülasyonu:** plan/koltuk/kota modeli ve enforcement hazırdır; ancak plan değişimi **gerçek ödeme almaz** (Stripe entegrasyonu Faz 9).
- **Excel:** koşullu biçimlendirme ve veri doğrulama **uygulama içinde** çalışır (kütüphane kısıtı nedeniyle `.xlsx`'e yazılmaz). Font/dolgu/hizalama stili artık `.xlsx`'e **yazılır** ve dış dosyadan **okunur** (ExcelJS; tema/indexed renkler v1'de atlanır). Türkçe fonksiyon adları (`=TOPLA`) kayıtta İngilizce'ye çevrilir.
- **Word:** üst/alt bilgi, sayfa numarası, **dipnot**, **değişiklik izleme (track changes)** ve **gerçek sayfalama (sayfa görünümü)** vardır. Değişiklik izleme v1'de yalnız metin ekleme/silmeyi kapsar (paragraf/biçim değişimi hariç).
- **PowerPoint:** öğe döndürme (`.pptx` round-trip), giriş animasyonları (uygulama içi) ve **slayta grafik** (`.pptx`'e aktarımlı) vardır. Animasyon/geçişler ve grafiğin `.pptx`'ten geri okunması aktarılmaz (PptxGenJS kısıtı).
- **Dokunmatik / dar ekran:** responsive düzen + Pointer Events ile birleşik dokunmatik ızgara (uzun-bas aralık seçimi, çift-dokunuş düzenleme) eklendi.
- **Ölçek/altyapı (Faz 9):** OAuth/SSO, BYOS (Drive/OneDrive), Redis cache, çok bölge, gerçek dağıtık rate-limit, PITR yedekleme canlı deploy ve ilgili hesaplara bağlıdır.

---

## Ürün vizyonu

Hedef: tek tarayıcıda çalışan bir demoyu, **dünya çapında kullanılabilen, şirketlere lisanslanabilen/satılabilen, çok kullanıcılı ve ölçeklenebilir bir SaaS**'a dönüştürmek.

- **Paylaşım + gerçek zamanlı eş düzenleme** (Google Docs / Office 365 seviyesi) — çekirdek felsefe, ekstra değil.
- **Ölçeklenebilir:** hedef ~100.000 eş zamanlı kullanıcı (belge = bağımsız oda, yatay ölçek).
- **Güvenilir:** çevrimdışı düzenleme + yeniden bağlanınca senkron, veri kaybı yok.
- **Dosya byte'larını kalıcı biz saklamayız (BYOS):** içerik kullanıcının Drive/OneDrive'ında; biz yalnızca gerçek zamanlı durum (CRDT) + küçük meta veri/izin tutarız.
- **Çok platform:** şu an web (test kolaylığı için); uygulama bitince masaüstü + mobil paketlenir — hepsi aynı backend/API'ye bağlanır.

## Yol haritası — satılabilir ürüne giden checklist

**Öncelik ilkesi:** önce **kod içinde** yapılabilen işler; **deploy, URL/domain edinimi ve canlıya alma en sona** bırakılır. İşaretli (✅) maddeler yerelde tamamlanmıştır.

### 🔑 Açılması gereken hesaplar / servisler

Yol haritasının bir de **dış hesap** boyutu var: hangi servislere kaydolmak gerekiyor, ne zaman? Tam liste + maliyet + env anahtarları → **[docs/accounts.md](docs/accounts.md)**. Kod karşılığı: [js/config.js](js/config.js) içindeki `XL.config.services` kayıt defteri (her hesap env ile yapılandırılana kadar ilgili özellik **zarifçe devre dışı** kalır).

**A) ŞU AN açılması gerekenler (ilk canlı sürüm — hepsi Faz 9 ile devreye girer):**
- [ ] **Supabase** bulut projesi — Postgres + Auth + Storage (ücretsiz → $25/ay Pro)
- [ ] **Cloudflare** — Workers + Durable Objects (gerçek zamanlı; DO için ~$5/ay ücretli Workers planı şart)
- [ ] **Statik hosting/CDN** — Cloudflare Pages / Vercel / Netlify (ücretsiz)
- [ ] **Alan adı (domain)** — ~$10-15/yıl (OAuth + güvenli çerez gerçek origin ister)
- [x] **GitHub** — repo + CI/CD (zaten kullanılıyor)

**B) GELECEKTE (uygulama büyüyünce / şirketlere satılınca) açılacak veya upgrade edilecek:**
- [ ] **Stripe** — gerçek ödeme/abonelik (Faz 3 modeli hazır; `change_plan` şimdilik SİMÜLE)
- [ ] **Google Cloud Console** — "Google ile giriş" + Google Drive BYOS (OAuth client id)
- [ ] **Microsoft Entra/Azure** — "Microsoft ile giriş" + OneDrive BYOS + kurumsal **SAML/SCIM**
- [ ] **Apple Developer** — "Apple ile giriş" + iOS App Store ($99/yıl; Faz 10 mobil)
- [ ] **Sentry** (vb.) — canlı hata/metrik toplayıcı (Faz 7 katmanı hazır, DSN boşken ağ yok)
- [ ] **İşlemsel e-posta** (Resend/Postmark/SES) — davet/bildirim/sıfırlama hacim yapınca
- [ ] **Redis/KV** (Upstash vb.) — cache + gerçek dağıtık rate-limit (ölçek)
- [ ] **Upgrade'ler:** Supabase Pro, Cloudflare üst plan, çok bölge/edge/DDoS
- [ ] **SOC 2 / ISO 27001 denetçisi** + imzalı DPA — kurumsal satış ön koşulu (Faz 8; erken başlat)

### ✅ Tamamlanan çekirdek (yerelde)
- [x] Vite build/bundle, npm, CDN'siz, çevrimdışı, `.env` → `dist/`
- [x] PWA (yüklenebilir + çevrimdışı service worker)
- [x] Hesap/kimlik: e-posta+parola kayıt/giriş (Supabase Auth, yerelde)
- [x] Bulut belge veri katmanı + paylaşım (e-posta/rol, token'lı link, anonim herkese açık link, süreli link)
- [x] Gerçek zamanlı eş düzenleme: **Word + PowerPoint + Excel** (Yjs CRDT, Cloudflare Durable Object relay)
- [x] Presence rozetleri + canlı uzak imleçler + WS belge-yetki (403)
- [x] Yorumlar + @bahsetmeler + bildirimler + canlı yenileme + konuma iliştirilmiş (anchored) yorumlar
- [x] Gerçek salt-okunur mod
- [x] i18n altyapısı (TR/EN dil seçici, kalıcı)
- [x] Excel dosya sadakati: hücre birleştirme + sütun genişliği + satır yüksekliği
- [x] **Lisans engeli kalktı:** HyperFormula (GPL) → kendi bağımsız formül motoru

### Faz 0 — Marka & lisans & güvenlik temizliği (kod, hızlı, hukuki ön koşul)
- [x] **Marka temizliği (kod) ✅:** Kodda "Microsoft/Office" çağrışımları kaldırıldı — Supabase proje kimliği `Microsoft_Team` → `uniteam`, PPTX'te kullanıcıya görünen "Office" tema adı → "Klasik" (veri anahtarı `office` korunur). İç depolama anahtarları **geriye dönük göç ile** yenilendi: IndexedDB `weboffice` → `uniteam` (ilk açılışta eski DB'den otomatik kopya, veri kaybı yok), localStorage `weboffice-v2/-prefs/-locale` → `uniteam-*` (eski anahtarlar yedek olarak okunur). Test paketi adı da güncellendi. 34/34 test geçiyor. (Not: nominative kullanımlar korundu — OOXML MIME tipi, OAuth sağlayıcı adı "Microsoft", "Office gibi" kıyas ifadeleri.)
  - ⏳ **Kalan manuel adım:** çalışma klasörü adı hâlâ `Microsoft Team` (dosya sistemi; git remote zaten `UniTEAM`). Klasörü işletim sisteminde elle `UniTEAM` olarak yeniden adlandırın; `supabase/config.toml` kimliği değiştiği için bir sonraki `supabase start`'ta yerel yığın yeni kimlikle kurulur (eski yerel veri eski birimde kalır).
- [x] **Kendi lisans dosyası ✅:** `LICENSE` tescilli (proprietary, tüm hakları saklı) — ticari dağıtıma uygun; telif sahibi dolduruldu. `THIRD-PARTY-NOTICES.md` güncel (HyperFormula kaldırıldı, sürümler/atıflar doğru). *(Telif sahibini bir şirket/tüzel kişi altında lisanslayacaksanız `LICENSE`'taki adı güncelleyin.)*
- [x] **xlsx açığı + parse sertleştirme ✅:** xlsx açığı zaten kapalı (0.20.3 — eski prototype-pollution/ReDoS giderilmiş). Gerçek bağımlılık açıkları kapatıldı: `image-size` (high, görsel-parse DoS) override ile 2.x, `vite` (high, dev-server) 6.4.4, `mammoth` (directory-traversal) 1.13.0. Kod sertleştirmesi: güvensiz dosyadan gelen anahtarlarla kurulan sözlükler `Object.create(null)` (docx/pptx okuyucuları → prototype pollution engeli) + merkezi dosya boyutu tavanı (75 MB, DoS/zip-bomb) + açmada zarif hata. 34/34 test. *(Kalan 3 moderate `sprintf-js/argparse` uyarısı mammoth'un CLI zincirinde — tarayıcı paketine girmez.)*

### Faz 1 — Çok-kiracılık & yetki modeli (en büyük kod işi, enterprise çekirdeği) ✅ (yerelde)
- [x] **Organizasyon / takım şeması + RLS:** `organizations` (kiracı), `organization_members` (N:M üyelik, rol+durum), `organization_invites` (e-posta daveti), `audit_log` (append-only denetim) + `documents.org_id`. Migration `20261018130000_organizations.sql`; tam öğretici DDL `db/schema.sql`'de.
- [x] **Org rolleri + RBAC:** `org_role` (admin/member) + `member_status` (active/suspended). `user_doc_role()` genişletildi → org **admini** org'a bağlı belgede `owner` yetkisi kazanır (**ayrılan çalışandan erişim devri**: üye çıkarılınca belgeleri bir admine otomatik devredilir). Son-admin koruması.
- [x] **Admin paneli (frontend):** `js/org.js` = `XL.org` + hesap menüsünde "🏢 Organizasyonlarım". Üye davet (hesabı yoksa token'lı davet bağlantısı) / rol değiştir / askıya al-etkinleştir / çıkar; belge sahipliği devri; kota (belge) görünürlüğü; denetim kaydı sekmesi. Belge sahibi paylaş panelinden belgeyi org'a bağlayabilir.
- [x] **Audit log:** her yönetim işlemi (`org.create`, `member.add/role/status/remove`, `invite.create/accept`, `doc.transfer/move`) SECURITY DEFINER RPC'leri içinde atomik kaydedilir; yalnız adminler okur.
- ⏳ **Kalan (canlı):** bulut Supabase'e migration uygulanıp çok-kullanıcılı akışların canlı yığınla doğrulanması (Faz 9 deploy ile). v1 kapsam notu: org üyeliği tek başına belge erişimi vermez — adminler yönetişim için erişir; "takım sürücüsü" (tüm üyeler tüm org belgelerini görür) ileride bir org ayarı.

### Faz 2 — Hesap güvenliği & kimlik (kod) ✅ (yerelde)
- [x] **2FA/MFA (TOTP):** Supabase Auth'un yerleşik `auth.mfa.*`'ı — `js/security.js`'te kaydet (QR + secret) / doğrula / kaldır; **girişte ikinci faktör** sorulur (aal1→aal2, iptal → oturum kapanır). `config.toml`'da TOTP açıldı.
- [x] **Şüpheli giriş uyarıları:** `login_events` (giriş olay tablosu) + `record_login_event` RPC → yeni cihaz tespiti; ilk giriş değilse yeni cihazda `security_new_device` **bildirimi** (zil + anlık). Giriş geçmişi güvenlik panelinde.
- [x] **Oturum sertleştirme:** güvenlik panelinde "diğer cihazlardan çık" (`signOut scope:others`) + "her yerden çık" (`global`); son girişler listesi (cihaz + yeni-cihaz işareti).
- [x] **Rate limiting + abuse önleme (Worker):** IP başına genel 120/dk + WS bağlantı 30/dk limiti; `DocRoom`'da oturum başına mesaj sel koruması (400/10sn → kapat) + 1 MB mesaj boyut tavanı. *(İzolat-yerel sayaç = "kod hazırlığı"; üretimde Durable Object/KV ile global doğruluk.)*
- [ ] **SSO/SAML + SCIM:** ertelendi — Supabase SSO (SAML) bir **canlı/proje ayarıdır** (yerel kod tarafı anlamlı değil); OAuth (Google/Microsoft/Apple) ile birlikte Faz 9 (deploy) kapsamında.
- ⏳ **Kalan (canlı):** MFA + giriş akışlarının canlı Supabase yığınıyla doğrulanması; gerçek rate-limit için Worker deploy.

### Faz 3 — Faturalandırma & plan/kota (kod) ✅ (yerelde; gerçek ödeme → Faz 9)
- [x] **Plan / koltuk / kota veri modeli:** `plans` KATALOĞU (free/pro/team/enterprise — fiyat, koltuk, depolama, belge kotaları; kurallar kodda değil VERİDE) + `subscriptions` (**çift özneli**: bir organizasyon **veya** bir kişisel hesap; "tam olarak biri dolu" kuralı `CHECK` + kısmi `UNIQUE` indekslerle zorlanır). Migration `20261019130000_billing.sql`. `-1` = sınırsız.
- [x] **Kota ENFORCEMENT (sunucuda, hangi istemci olursa olsun):** belge sayısı → `documents` üzerinde **BEFORE INSERT trigger** (`_enforce_document_quota`); koltuk sayısı → `invite_to_org` / `accept_org_invite` RPC'lerinde `_assert_seat_available`; org'a belge taşımada `move_document_to_org` kota kontrolü; **downgrade bütünlüğü** → mevcut kullanım yeni kotayı aşıyorsa plan düşürme reddedilir. Depolama byte'ı `get_subscription`'da raporlanır (sert yükleme reddi → Faz 9 Storage kancası).
- [x] **İş modeli (freemium / abonelik / kurumsal):** katalog 4 basamak — Free (ücretsiz), Pro ($9/ay), Team ($12/koltuk/ay), Enterprise (özel fiyat). RPC'ler: `list_plans`, `get_subscription` (plan + limit + güncel kullanım tek JSON), `change_plan` (**ödeme sonrası durumu SİMÜLE eder** — kart alınmaz).
- [x] **Faturalandırma UI (`js/billing.js` = `XL.billing`):** hesap menüsünde "💳 Plan ve Faturalandırma" (kişisel) + org yönetim panelinde "Plan" sekmesi. Mevcut plan + durum, kullanım ölçerleri (belge/üye/depolama, kota aşımında kırmızı), plan karşılaştırma kartları + tek tıkla plan değişimi. Kartlar girişsiz/çevrimdışı da çizilir (katalog aynası). `cloud.js` belge kota hatasını anlaşılır "planı yükseltin" mesajına çevirir. 90/90 test (e2e +5).
- [ ] **Gerçek ödeme (Stripe checkout + webhook) → Faz 9:** `stripe_customer_id`/`stripe_subscription_id` alanları hazır; canlı checkout, fatura ve `past_due`/`canceled` durum geçişleri deploy ile takılır (model değişmeden).

### Faz 4 — Güvenilirlik & veri sahipliği (kod) ✅ (yerelde; BYOS canlı kısmı Faz 9)
- [x] **Sürüm geçmişi + çöp kutusu:** `js/cloud.js` — bulut belgelerinde "🕘 Sürümler" (anlık görüntü oluştur/listele/geri yükle; sunucu-içi kopya, mevcut `document_versions` tablosu) ve "🗑 Çöp kutusu" (soft-delete `trashed_at` → çöpe taşı / geri yükle / kalıcı sil). **Yeni şema/migration gerekmedi** (tablolar/sütunlar zaten vardı).
- [x] **Çevrimdışı kuyruk:** IndexedDB `outbox` store'u (`js/storage.js`, DB sürümü 1→2); çevrimdışıyken/ağ hatasında bulut kaydı kuyruğa alınır, yeniden çevrimiçi olunca (`online` olayı + giriş) otomatik eşitlenir. Çakışma: bulut byte'ında son-yazan-kazanır; canlı eş düzenleme yolu zaten Yjs CRDT ile birleştirir.
- [x] **BYOS soyutlaması:** `js/byos.js` — sağlayıcı arayüzü (`putBytes/getBytes/copy/remove`); bugün etkin tek sağlayıcı `relay` (Supabase Storage), `gdrive`/`onedrive` **iskelet** (OAuth + domain gerektirdiği için çağrıldığında net "Faz 9" hatası). `cloud.js` artık byte'lara tek bir arayüzden konuşur.
- [ ] **BYOS canlı (Google Drive / OneDrive):** OAuth client kaydı (Google Cloud Console / Azure) + domain gerektirir → **Faz 9** (deploy/OAuth go-live) ile adaptörlerin içi doldurulur.

### Faz 5 — Erişim genişliği (kod) ✅ (yerelde)
- [x] **i18n derinleştirme:** çok-dilli motor (`XL.t` artık sözlük katmanıyla N dil — TR/EN/DE/ES/AR; eksik dize İngilizce'ye düşer), **RTL** (Arapça/İbranice → `<html dir=rtl>`), üstte 🌐 dil menüsü. **Türkçe fonksiyon adları** (`=TOPLA`, `=EĞER`, `=DÜŞEYARA`… → hesaplanır ve kayıtta İngilizce'ye kanonikleşir, `.xlsx` birlikte çalışır). Yerel sayı/tarih/para biçimleri (`Intl`, arayüz diline göre). CJK/Arapça yazı tipi yedekleri.
- [x] **Erişilebilirlik (a11y):** "İçeriğe geç" skip-link, ARIA rolleri (toolbar/dialog/menu) + ikon düğmelerine `aria-label` (iki dilli `data-i18n-aria`), görünür klavye odağı (`:focus-visible`).
- [x] **Responsive / dokunmatik:** dar ekran (≤760/480px) için üst çubuk sarması, kaydırılabilir şerit, tam genişlik panel; dokunma hedefleri + `touch-action`.
- [x] **Onboarding:** ilk açılışta bloklamayan karşılama banner'ı (bir kez), "❔ Yardım & Şablonlar" paneli (hızlı başlangıç + kısayollar + diller) ve **şablon galerisi** (boş + önceden doldurulmuş Excel Bütçe / Word Mektup).
- ⏳ **Kalan (artımlı):** DE/ES/AR sözlüklerinin derin (mod şeritleri/diyaloglar) doldurulması; tam dokunmatik grid sürükleme; daha fazla şablon.

### Faz 6 — Dosya sadakati & eş düzenleme olgunluğu (kod) — 🔶 Bölüm A ✅ (yerelde)
- [x] **Excel: koşullu biçimlendirme** (`js/excel/condfmt.js`): hücre değeri kuralları (>, <, =, arasında, metin içerir) + renk ölçeği + veri çubuğu; "Veri → Kurallar" şeridi. Belge verisinde saklanır (uygulama içi; SheetJS .xlsx yazımı desteklemez).
- [x] **Excel: veri doğrulama** (`js/excel/validation.js`): açılır liste (datalist) + sayı aralığı/tam sayı + metin uzunluğu; girişte reddetme. Belge verisinde saklanır.
- [x] **PowerPoint: döndürme** (`rot`): öğe render (CSS transform) + ⟲/⟳ şerit düğmeleri + **.pptx içe/dışa aktarım** (OOXML `rot` 60000/derece ↔ PptxGenJS `rotate`).
- [x] **Bozuk dosyada zarif hata:** `openFile` artık bozuk/geçersiz dosyada çökme yerine anlaşılır (iki dilli) mesaj verir.
- [x] **Biçim sadakati testleri:** fidelity'ye koşullu biçim + veri doğrulama round-trip + PPT döndürme round-trip eklendi (**43/43 test**).

**Bölüm B** (2026-10-18):
- [x] **Canlı seçim göstergeleri (Excel + PPT):** awareness kanalı genişletildi — uzak kullanıcının seçili hücresi (Excel, aynı sayfada) ve seçili öğesi (PPT, aynı slaytta) kullanıcı rengi + adıyla çerçevelenir (`js/realtime.js`; Word imleci zaten vardı).
- [x] **PowerPoint giriş animasyonları:** öğe başına `anim` (belir/uçarak/yakınlaş), "Geçişler → Animasyon" şeridi + ▶ önizleme, slayt gösterisinde sırayla oynatılır. *(Uygulama içi; PptxGenJS animasyon XML'i desteklemediği için `.pptx`'e aktarılmaz.)*
- [x] **Not:** Word üst/alt bilgi + sayfa numarası zaten mevcut (önceki çalışma).
- [x] **Koşullu biçim/veri doğrulama canlı eş düzenleme senkronu** (`js/realtime.js`): kurallar artık `xlMeta`'da sayfa indeksine göre taşınır (layout deseniyle birebir), uzak değişiklikte korunur.

**Bölüm C** (2026-10-18 — kalan saf-kod maddeleri):
- [x] **PowerPoint slayta grafik** (`js/pptx/mode.js`, `pptx-io.js`): yeni `chart` öğesi (sütun/çizgi/pasta), uygulama içi SVG render, "📊 Grafik" ekleme düğmesi + çift tıkla veri düzenleyici, `.pptx`'e PptxGenJS `addChart` ile aktarım. *(Grafiğin `.pptx`'ten geri okunması kapsam dışı — büyük iş.)*
- [x] **Word dipnot** (`js/word/mode.js`, `docx-io.js`): satır içi işaretçi + sayfa altı türetilen liste + otomatik numaralama; "🔖 Dipnot Ekle" (Gözden Geçir); `.docx`'e gerçek OOXML dipnotu (`FootnoteReferenceRun` + `Document.footnotes`).
- [x] **Excel büyük sayfada artımlı canlı render** (`js/realtime.js`): uzak değişiklik yalnız hücre/biçimse ve sayfa yapısı aynıysa yalnız değişen hücreler `setCell` + tek repaint (tam `engine.load` + `grid.build` yok); yapısal değişiklikte tam yükleme fallback.
- [x] **Excel font/dolgu/hizalama stili `.xlsx` yazımı → ExcelJS'e geçildi** (`src/vendor.js`, `js/excel/io.js`): yazıcı ExcelJS (kalın/italik/altı çizili/renk/dolgu/hizalama + değer/formül/sayı biçimi/birleştirme/boyut/kenar boşluğu/üst-alt bilgi). **Okuma + CSV SheetJS'te kaldı** (fidelity %99.7 korunur). *(Dış dosyadan stil **okuma** ayrı/ileri iş.)*
- [x] **Word değişiklik izleme (track changes)** (`js/word/mode.js`, `docx-io.js`): "📝 Değişiklikleri İzle" (Gözden Geçir) — ekleme `<ins>`/silme `<del>` işaretlenir (yazar+tarih), tıkla→kabul/reddet + Tümünü Kabul/Reddet; `.docx`'e gerçek OOXML revizyonu (`InsertedTextRun`/`DeletedTextRun` → `w:ins`/`w:del`).
- [x] **Word gerçek sayfalama (sayfa görünümü)** (`js/word/mode.js`, CSS): "📄 Sayfa Görünümü" (Görünüm) — bloklar sayfa sınırını aşacaksa sonraki sayfaya itilir, sayfalar gri oluklarla ayrılır; canlı sayfa sayısı; itmeler serialize'a taşınmaz.

**Eş düzenleme olgunlaştırma (A6)** (2026-10-19):
- [x] **Büyük sayfada artımlı render CİLASI** (`js/realtime.js`, `js/excel/engine.js`+`formula.js`): artımlı yol artık tüm grid'i (`grid.render()` = ROWS×COLS) değil **yalnız etkilenen hücreleri** boyar — değişen hücreler + **aktif sayfadaki formül hücreleri** (`engine.formulaCells`; motorun bağımlılık grafiği olmadığından uzak değişiklik herhangi bir formülün değerini değiştirebilir, düz değerler ise yalnız kendileri değişince). Görünmeyen sayfalarda hiç boyama yok; repaint seti çok büyükse tam render'a fallback. Büyük sayfalarda uzak güncelleme repaint maliyetini birkaç hücreye indirir.
- [x] **DO snapshot sıkıştırma hazırlığı** (`worker/src/index.js`): `DocRoom` artık sınırsız büyüyen güncelleme dizisi yerine **snapshot + kuyruk (append-only log)** modeli — kuyruk eşiği (100 güncelleme / 512 KB) aşınca `Y.mergeUpdates([snapshot, ...tail])` ile tek snapshot'a katlanır, kuyruk boşalır. Geç gelen istemci snapshot + kuyruk alır (sonuç TÜM güncellemeleri almakla aynı; test edildi: 502 güncelleme → 3 blob, durum birebir). Storage sınırlı + bağlanma hızlı kalır. Eski tek-`updates` anahtarı yüklemede kuyruğa göç eder. *(Snapshot'ı R2/object storage'a taşıma = Faz 9 ölçek işi.)*
- [ ] **Kalan (kütüphane kısıtı / büyük ayrı iş — ayrı karar/greenlight gerektirir):**
  - Excel: dış `.xlsx`'ten font/dolgu stili **okuma** (okuyucu ExcelJS'e de alınabilir — ayrı iş).
  - PPT animasyon/geçişlerin `.pptx`'e aktarımı: PptxGenJS animasyon XML'i üretmez (format kısıtı).
  - Geniş gerçek-dünya `.xlsx/.docx/.pptx` regresyon korpusu: telifli dosyalar (`.gitignore`'da) gerektirir — kod değil, veri işi.

### Faz 7 — Gözlemlenebilirlik (kod entegrasyonu)
- [ ] Hata takibi (Sentry), yapılandırılmış log, metrik SDK'leri (servise bağlama Faz 9)

### Faz 8 — Hukuk & uyumluluk
- [ ] Gizlilik politikası, kullanım şartları (ToS), veri işleme sözleşmesi (DPA), çerez onayı
- [ ] GDPR/KVKK/CCPA: veri silme/indirme (export) uçları (kod)
- [ ] SOC 2 / ISO 27001 sürecini erken başlat (kurumsal satış ön koşulu)

### Faz 9 — Deploy & altyapı (EN SON — bilinçli olarak sona bırakıldı)
> Bu faz büyük ölçüde **dış hesap** işidir — hangi hesabın ne zaman açılacağı: **[docs/accounts.md](docs/accounts.md)** ("A) şu an" + "B) gelecekte").
- [ ] Supabase bulut projesi + Cloudflare Worker deploy + statik hosting/CDN *(hesaplar A1-A3)*
- [ ] **URL / domain edinimi** *(hesap A4)*
- [ ] OAuth/SSO canlıya alma (Google/Microsoft/Apple) *(hesaplar B2)*
- [ ] CI/CD (otomatik deploy) + staging/production ortam ayrımı
- [ ] Ölçek altyapısı: Redis cache, connection pool/read replica, çok bölge (multi-region)/edge, DDoS koruması
- [ ] Monitoring/uptime/alerting canlıya alma + durum sayfası
- [ ] Yedekleme/PITR (altyapı tarafı)

### Faz 10 — Çoklu platform paketleme (uygulama bittiğinde)
- [ ] Mobil: PWA (✅ mevcut) → daha yerel his için Capacitor / React Native
- [ ] Masaüstü: Electron veya Tauri (mevcut web kodunu sarar)
- [ ] Diğer Office uygulamalarının muadilleri
