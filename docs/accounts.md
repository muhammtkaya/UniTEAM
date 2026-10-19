# UniTEAM — Hesaplar / Servisler Yol Haritası

Bu belge, UniTEAM'i **canlıya almak** ve ileride **büyütmek / şirketlere satmak**
için açılması veya yükseltilmesi (upgrade) gereken dış servis hesaplarını listeler.

Yol haritası iki bölüme ayrılır:

- **A) ŞU AN açılması gereken hesaplar** — ilk canlı (production) sürüm için zorunlu.
- **B) GELECEKTE açılması veya upgrade edilmesi gereken hesaplar** — uygulama
  büyüdükçe veya kurumsal (şirket) müşterilere satılırken gerekir.

Her hesabın **kod karşılığı** [js/config.js](../js/config.js) içindeki
`XL.config.services` kayıt defterindedir: hangi env anahtarını istediği,
yapılandırılmış olup olmadığı (`configured()`), ne zaman gerekli (`when`) ve
hangi faz (`phase`). Env anahtarları [.env.example](../.env.example) içinde.

> **Gizlilik ilkesi:** İstemciye (tarayıcıya) yalnızca **public** tanımlayıcılar
> gömülür — anon anahtar, yayımlanabilir (publishable) anahtar, OAuth client id.
> **Gizli** anahtarlar (Stripe secret key, Supabase `service_role`) **asla**
> `.env`'ye/istemciye konmaz; Cloudflare Worker secret'ında durur
> (`wrangler secret put ...`). Güvenlik, veritabanındaki RLS + Worker'dadır.

---

## A) ŞU AN açılması gereken hesaplar (ilk canlı sürüm)

Bunlar olmadan uygulama "yerel demo"dan çıkamaz. Hepsi Faz 9 (deploy) ile devreye girer.

| # | Hesap / Servis | Niçin | Maliyet (başlangıç) | Env / kod | Not |
|---|---|---|---|---|---|
| 1 | **Supabase** (bulut projesi) | Postgres + Auth + Storage (hesaplar, metadata, paylaşım, byte relay) | Ücretsiz katman → $25/ay (Pro) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Yerel migration'lar aynen uygulanır. 7 gün inaktivitede ücretsiz proje uyur. |
| 2 | **Cloudflare** (Workers + Durable Objects) | Gerçek zamanlı eş düzenleme (DocRoom), JWT doğrulama, rate-limit | **~$5/ay** (DO, ücretli Workers planı ister) | `VITE_WORKER_URL` + Worker secret'ları | Durable Objects ücretsiz planda yok → Workers Paid şart. |
| 3 | **Statik hosting / CDN** | Ön yüzü (dist/) global dağıtmak | Ücretsiz | — (build + yayın) | Cloudflare **Pages** (aynı hesap), Vercel veya Netlify. |
| 4 | **Alan adı (domain)** | Kullanıcıya adres + OAuth/çerez için gerçek origin | ~$10-15/yıl | — | Cloudflare Registrar veya Namecheap. OAuth ve güvenli çerezler domain ister. |
| 5 | **GitHub** | Kod deposu + CI/CD (Actions) + otomatik deploy | Ücretsiz | — | Zaten kullanılıyor. `.github/workflows/test.yml` genişletilir. |

**Özet (A):** MVP'yi ~$0-5/ay + ~$12/yıl domain ile canlıya almak mümkün
(Supabase+hosting+GitHub ücretsiz; tek zorunlu ücret Cloudflare DO ~$5/ay).

---

## B) GELECEKTE açılacak / upgrade edilecek hesaplar (büyüme / kurumsal satış)

Tetikleyici olayına göre gruplandı. Hepsi kodda `when: "future"` olarak işaretli
ve ilgili env anahtarı girilene kadar özellik **zarifçe devre dışı** kalır.

### B1 — Para kazanmaya başlayınca (gerçek ödeme)
| Hesap | Tetikleyici | Env / kod | Not |
|---|---|---|---|
| **Stripe** | Ücretli planı gerçekten tahsil edeceğin an | `VITE_STRIPE_PUBLISHABLE_KEY` (public) + Worker secret (gizli) | Faz 3 modeli hazır; `change_plan` şimdilik SİMÜLE. Canlıda checkout + webhook → `subscriptions.stripe_*` dolar, `past_due/canceled` durumları gelir. |

### B2 — Kullanıcı girişi kolaylaşsın / BYOS gelsin (OAuth sağlayıcıları)
| Hesap | Tetikleyici | Env / kod | Not |
|---|---|---|---|
| **Google Cloud Console** | "Google ile giriş" veya Drive BYOS isteyince | `VITE_GOOGLE_OAUTH_CLIENT_ID` (public) | Ücretsiz. `js/byos.js` gdrive adaptörü hazır iskelet; `available()` bu hesaba bağlı. |
| **Microsoft Entra/Azure** | "Microsoft ile giriş", OneDrive BYOS veya kurumsal **SAML/SCIM** isteyince | `VITE_MS_OAUTH_CLIENT_ID` (public) | Ücretsiz başlar. Kurumsal SSO (SAML) + SCIM kullanıcı sağlama kurumsal satışta neredeyse zorunlu. |
| **Apple Developer** | "Apple ile giriş" veya iOS App Store (mobil, Faz 10) | — | **$99/yıl**. Yalnız Apple ekosistemi/mobil gerekince. |

### B3 — Ölçek ve güvenilirlik artınca
| Hesap | Tetikleyici | Env / kod | Not |
|---|---|---|---|
| **Sentry** (veya muadili) | Canlı hata/metriğin tek yerde toplanması gerekince | `VITE_OBSERVABILITY_DSN` (public DSN) | Faz 7 katmanı (`XL.obs`) hazır; DSN boşken ağ yok. Ücretsiz katman → ölçekte upgrade. |
| **İşlemsel e-posta** (Resend / Postmark / SES) | Davet/bildirim/şifre sıfırlama e-postaları hacim yapınca | — + Worker/Supabase SMTP ayarı | Supabase yerleşik e-postası düşük hacim içindir; ölçekte ayrı sağlayıcı. |
| **Redis / KV cache** (Upstash vb.) | Oturum/metadata cache + **gerçek** dağıtık rate-limit gerekince | — | Worker rate-limit şu an isolate-yerel (yaklaşık); global doğruluk için KV/DO/Redis. |

### B4 — Upgrade'ler (mevcut hesaplar büyüyünce)
| Hesap | Ne zaman upgrade | Not |
|---|---|---|
| **Supabase** Free → **Pro ($25/ay)** | İnaktivite uykusu kabul edilemez olunca / kota/PITR gerekince | PITR (yedekleme), daha yüksek kota, destek. |
| **Cloudflare** Workers → daha yüksek plan | İstek/DO kullanımı ücretsiz sınırı aşınca | Kullanımla orantılı; 100k ölçekte bile aylık yüzlerce $. |
| **Çok bölge / edge / DDoS** | Küresel düşük gecikme + saldırı koruması gerekince | Cloudflare katmanları + multi-region DB. |

### B5 — Kurumsal (şirketlere) satış ön koşulları
| Hesap / Süreç | Tetikleyici | Not |
|---|---|---|
| **SOC 2 / ISO 27001 denetçisi** | Kurumsal müşteri güvenlik uyumu isteyince | Denetim firması + süreç (aylar sürer, erken başlat). Faz 8. |
| **İmzalı DPA / hukuki inceleme** | İlk kurumsal sözleşmede | `js/privacy.js` TASLAK iskeletleri avukat onayından geçer. |
| **Microsoft SAML/SCIM** (B2) | Kurumsal SSO/kullanıcı sağlama | Büyük müşteriler kendi kimlik sağlayıcılarıyla girişi ister. |

---

## Özet sıralama (öneri)

1. **Şimdi (A):** Supabase → Cloudflare (Workers Paid + DO) → domain → hosting → GitHub CI/CD. = canlı MVP.
2. **İlk gelir (B1):** Stripe.
3. **Benimsenme (B2):** Google + Microsoft OAuth (giriş + BYOS).
4. **Ölçek (B3/B4):** Sentry → e-posta sağlayıcı → Redis → Supabase Pro → çok bölge.
5. **Kurumsal (B5):** SAML/SCIM + SOC 2/ISO + imzalı DPA.

> Strateji (bkz. backend kararı): **"Önce kirala → çaprazlama noktasında kendin
> yaz."** Hazır servislerle başla; kullanım büyüyüp maliyet eğrisi döndüğünde
> (ör. realtime'ı self-host Hocuspocus+Redis'e almak) kendi altyapına geç.
> Standartlar (Postgres, Yjs) sayesinde sağlayıcı değişimi veri modelini bozmaz.
