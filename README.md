# UniTEAM

Excel, Word ve PowerPoint'e muadil üç uygulamayı **tek bir tarayıcı arayüzünde** birleştiren web uygulaması.

Uygulama Excel arayüzüyle açılır. Alt soldaki **＋** düğmesiyle yeni bir belge eklenir ve türü seçilir: Excel çalışma kitabı (`.xlsx`), Word belgesi (`.docx`) ya da PowerPoint sunusu (`.pptx`). Alt çubuktaki her sekme bir belgedir; bir sekmeye geçildiğinde üstteki şerit ve çalışma alanı o uygulamanın arayüzüne dönüşür.

Uygulama **testler kolaylaşsın diye önce tarayıda** geliştirilmiştir (hızlı yineleme, derleme/sertifika derdi yok). Bu geçici bir tercihtir: **uygulama bittiğinde masaüstü (Electron/Tauri) ve mobil sürümleri de üretilecektir.** İstemci (frontend) ile sunucu (backend) net ayrıldığı ve üçü de aynı API'ye bağlandığı için web, masaüstü ve mobil istemciler aynı çekirdeği paylaşır — platform paketlemesi en sona bırakılır.

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
  auth.js             Kimlik (Supabase Auth): kayıt/giriş/çıkış, hesap menüsü
  cloud.js            Bulut belge katmanı + paylaşım (e-posta/link/herkese açık)
  org.js              Organizasyonlar & admin paneli (çok-kiracılık, RBAC, davet, denetim)
  security.js         Hesap güvenliği (2FA/MFA, giriş geçmişi, oturum yönetimi)
  byos.js             Belge byte deposu sağlayıcı soyutlaması (relay + Drive/OneDrive iskeleti)
  comments.js         Yorumlar + @bahsetmeler + bildirimler
  realtime.js         Gerçek zamanlı eş düzenleme (Yjs CRDT + Durable Object)
  excel/
    mode.js           Excel modu: şerit, formül çubuğu, sayfa sekmeleri, komutlar
    formula.js        Kendi formül/hesap motorumuz (HyperFormula yerine, bağımlılıksız)
    engine.js         Hesap motoru sarmalayıcısı (formula.js'i kullanır)
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
| [SheetJS](https://sheetjs.com/) | 0.20.3 | `.xlsx` / `.csv` okuma-yazma | Apache-2.0 |
| [Chart.js](https://www.chartjs.org/) | 4.4.1 | Grafikler | MIT |
| [docx](https://docx.js.org/) | 8.5.0 | `.docx` yazma | MIT |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | 1.8.0 | Yedek `.docx` okuma | BSD-2-Clause |
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | `.docx` / `.pptx` paketlerini açma | MIT / GPL-3.0 |
| [PptxGenJS](https://gitbrent.github.io/PptxGenJS/) | 3.12.0 | `.pptx` yazma | MIT |

> **Lisans notu:** Excel formül motoru GPL-3.0 lisanslı HyperFormula'dan **kendi bağımsız, bağımlılıksız motorumuza** (`js/excel/formula.js`) taşındı; bu yüzden ürünü GPL'e zorlayan engel kalktı. Kalan kütüphaneler (SheetJS Apache-2.0, Chart.js/docx/JSZip/PptxGenJS MIT, mammoth BSD-2) ticari dağıtıma uygundur. JSZip'in MIT sürümü kullanılır. Projenin kendi lisansı `LICENSE` dosyasında tescilli (proprietary) olarak tanımlıdır; üçüncü taraf atıfları `THIRD-PARTY-NOTICES.md`'dedir.

---

## Bilinen sınırlamalar

- **Otomatik kayıt kotası:** tarayıcı belleği yaklaşık 5 MB'tır. Çok resimli belgelerde otomatik kayıt başarısız olabilir; durum çubuğunda uyarı çıkar. Bu durumda **Kaydet** ile dosyayı indirin.
- **Belgeler tarayıcıya özeldir:** otomatik kaydedilen veriler yalnızca o tarayıcıda durur; başka bir cihaza veya tarayıcıya taşınmaz.
- **Excel:** koşullu biçimlendirme, veri doğrulama ve Türkçe fonksiyon adları (`=TOPLA`) henüz yok (hücre birleştirme, sütun genişliği ve satır yüksekliği eklendi). Fonksiyonlar İngilizce adlarıyla yazılır (gerçek `.xlsx` dosyaları da böyle saklar).
- **Word:** üst/alt bilgi, dipnot, yorum ve değişiklik izleme yok. Sayfa sınırları çizgiyle gösterilir; metin henüz gerçek sayfalara bölünmez.
- **PowerPoint:** öğe animasyonları, döndürme ve slayta grafik ekleme yok. Slayt geçişleri `.pptx` dosyasına aktarılmaz.
- **Dokunmatik ekranlar** için ayrıca bir uyarlama yapılmadı.

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

### Faz 3 — Faturalandırma & plan/kota (kod)
- [ ] Stripe entegrasyonu (abonelik/seat)
- [ ] Plan / seat / depolama kotası modeli + enforcement
- [ ] İş modeli: freemium / abonelik / kurumsal fiyatlandırma

### Faz 4 — Güvenilirlik & veri sahipliği (kod) ✅ (yerelde; BYOS canlı kısmı Faz 9)
- [x] **Sürüm geçmişi + çöp kutusu:** `js/cloud.js` — bulut belgelerinde "🕘 Sürümler" (anlık görüntü oluştur/listele/geri yükle; sunucu-içi kopya, mevcut `document_versions` tablosu) ve "🗑 Çöp kutusu" (soft-delete `trashed_at` → çöpe taşı / geri yükle / kalıcı sil). **Yeni şema/migration gerekmedi** (tablolar/sütunlar zaten vardı).
- [x] **Çevrimdışı kuyruk:** IndexedDB `outbox` store'u (`js/storage.js`, DB sürümü 1→2); çevrimdışıyken/ağ hatasında bulut kaydı kuyruğa alınır, yeniden çevrimiçi olunca (`online` olayı + giriş) otomatik eşitlenir. Çakışma: bulut byte'ında son-yazan-kazanır; canlı eş düzenleme yolu zaten Yjs CRDT ile birleştirir.
- [x] **BYOS soyutlaması:** `js/byos.js` — sağlayıcı arayüzü (`putBytes/getBytes/copy/remove`); bugün etkin tek sağlayıcı `relay` (Supabase Storage), `gdrive`/`onedrive` **iskelet** (OAuth + domain gerektirdiği için çağrıldığında net "Faz 9" hatası). `cloud.js` artık byte'lara tek bir arayüzden konuşur.
- [ ] **BYOS canlı (Google Drive / OneDrive):** OAuth client kaydı (Google Cloud Console / Azure) + domain gerektirir → **Faz 9** (deploy/OAuth go-live) ile adaptörlerin içi doldurulur.

### Faz 5 — Erişim genişliği (kod)
- [ ] Mobil / responsive / dokunmatik arayüz
- [ ] i18n derinleştirme: RTL (Arapça/İbranice), yerel tarih/sayı/para biçimleri, daha fazla dil, Türkçe fonksiyon adları (`=TOPLA`), CJK/Unicode font kapsamı
- [ ] Erişilebilirlik (a11y): klavye navigasyonu, ARIA, kontrast
- [ ] Onboarding, uygulama içi yardım, şablon galerisi

### Faz 6 — Dosya sadakati & eş düzenleme olgunluğu (kod)
- [ ] Excel: koşullu biçim, veri doğrulama, font/dolgu stili `.xlsx` yazımı
- [ ] Word: üst/alt bilgi, dipnot, değişiklik izleme, gerçek sayfalama
- [ ] PowerPoint: animasyon, döndürme, slayta grafik, geçişlerin `.pptx`'e aktarımı
- [ ] Biçim sadakati testleri (yalnız metin değil) + geniş gerçek-dünya regresyon korpusu + bozuk dosyada zarif hata
- [ ] Canlı hücre/öğe seçim göstergeleri (Excel+PPT), büyük sayfada artımlı render

### Faz 7 — Gözlemlenebilirlik (kod entegrasyonu)
- [ ] Hata takibi (Sentry), yapılandırılmış log, metrik SDK'leri (servise bağlama Faz 9)

### Faz 8 — Hukuk & uyumluluk
- [ ] Gizlilik politikası, kullanım şartları (ToS), veri işleme sözleşmesi (DPA), çerez onayı
- [ ] GDPR/KVKK/CCPA: veri silme/indirme (export) uçları (kod)
- [ ] SOC 2 / ISO 27001 sürecini erken başlat (kurumsal satış ön koşulu)

### Faz 9 — Deploy & altyapı (EN SON — bilinçli olarak sona bırakıldı)
- [ ] Supabase bulut projesi + Cloudflare Worker deploy + statik hosting/CDN
- [ ] **URL / domain edinimi**
- [ ] OAuth/SSO canlıya alma (Google/Microsoft/Apple)
- [ ] CI/CD (otomatik deploy) + staging/production ortam ayrımı
- [ ] Ölçek altyapısı: Redis cache, connection pool/read replica, çok bölge (multi-region)/edge, DDoS koruması
- [ ] Monitoring/uptime/alerting canlıya alma + durum sayfası
- [ ] Yedekleme/PITR (altyapı tarafı)

### Faz 10 — Çoklu platform paketleme (uygulama bittiğinde)
- [ ] Mobil: PWA (✅ mevcut) → daha yerel his için Capacitor / React Native
- [ ] Masaüstü: Electron veya Tauri (mevcut web kodunu sarar)
- [ ] Diğer Office uygulamalarının muadilleri
