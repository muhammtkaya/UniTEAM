/* config.js — ortam ayarları (tek kaynak)
 *
 * Supabase bağlantı bilgileri burada tutulur. İstemci (tarayıcı) yalnızca
 * PUBLIC/anon anahtarı kullanır — bu anahtar gizli DEĞİLDİR, tarayıcıya açılması
 * normaldir. Gerçek güvenlik "service_role" anahtarında (yalnız sunucu) ve
 * veritabanındaki RLS politikalarındadır; anon anahtar RLS'in izin verdiğinden
 * fazlasını yapamaz.
 *
 * ⚠️ Şu anki değerler YEREL geliştirme içindir (supabase start çıktısı). Bunlar
 * her yerel Supabase kurulumunda AYNI olan standart demo anahtarlarıdır → git'e
 * konması sakıncasızdır. Buluta geçince bu değerler gerçek proje değerleriyle
 * değişecek (ve o anon anahtar da public olduğu için yine istemciye gömülebilir).
 */
// Değerler önce .env'den (window.__ENV__, src/vendor.js tarafından doldurulur),
// yoksa YEREL geliştirme varsayılanına düşer. Böylece anahtarlar koda sabitlenmez;
// buluta geçince yalnız .env değişir, kod aynı kalır.
const ENV = (typeof window !== "undefined" && window.__ENV__) || {};

// Yerel standart "anon" (public) anahtarı — her yerel Supabase'de aynıdır.
const LOCAL_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

XL.config = {
  supabase: {
    url: ENV.SUPABASE_URL || "http://127.0.0.1:54321",
    anonKey: ENV.SUPABASE_ANON_KEY || LOCAL_ANON,
  },
  // Gerçek zamanlı backend (Cloudflare Worker + Durable Objects).
  worker: {
    url: ENV.WORKER_URL || "http://127.0.0.1:8787",
  },
  // Gözlemlenebilirlik (Faz 7). dsn BOŞSA hiçbir ağ isteği yapılmaz — olaylar
  // yalnız konsola/yerel tampona gider (hesap/servis gerekmez). Buluta geçince
  // (Faz 9) .env'ye bir toplayıcı DSN'i konur; kod aynı kalır.
  observability: {
    dsn: ENV.OBSERVABILITY_DSN || ENV.SENTRY_DSN || "",
    env: ENV.APP_ENV || "local",
    release: (typeof XL !== "undefined" && XL.APP_VERSION) || "0.0.0",
    sampleRate: ENV.OBS_SAMPLE_RATE != null ? Number(ENV.OBS_SAMPLE_RATE) : 1,
  },

  // Gelecek hesaplar (yayımlanabilir/public tanımlayıcılar; gizli anahtarlar Worker'da).
  stripe:    { publishableKey: ENV.STRIPE_PUBLISHABLE_KEY || "" },
  oauth:     { googleClientId: ENV.GOOGLE_OAUTH_CLIENT_ID || "", msClientId: ENV.MS_OAUTH_CLIENT_ID || "" },
};

/* ===========================================================================
 * SERVİS / HESAP KAYIT DEFTERİ — "hangi dış hesap, ne zaman, yapılandırıldı mı?"
 * ---------------------------------------------------------------------------
 * Yol haritasının (docs/accounts.md) KOD KARŞILIĞI. Her dış servis hesabı tek
 * yerde tanımlanır: hangi env anahtarlarını ister, ŞU AN yapılandırılmış mı,
 * NE ZAMAN gerekli ("now" = ilk canlı sürüm / "future" = büyüme/kurumsal), ve
 * hangi faz. Böylece uygulama özellikleri hesabın varlığına göre ZARİFÇE
 * geçitlenir (yoksa yerel/devre-dışı davranır) ve "neyin açılması/upgrade
 * edilmesi gerektiği" koddan okunabilir.
 *
 * configured(): ilgili hesabın GERÇEKTEN bağlı olup olmadığının en iyi tahmini
 * (env dolu + yerel adres değil). Tam "canlı doğrulama" Faz 9'dadır.
 * =========================================================================== */
const isCloudUrl = (u) => !!u && !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(u);

XL.config.services = {
  // ——— ŞU AN açılması gereken hesaplar (ilk canlı sürüm için zorunlu) ———
  supabase:   { label: "Supabase — Postgres + Auth + Storage", when: "now", phase: 9, free: true,
                keys: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"],
                configured: () => isCloudUrl(XL.config.supabase.url) },
  cloudflare: { label: "Cloudflare — Workers + Durable Objects (gerçek zamanlı eş düzenleme)", when: "now", phase: 9, free: false,
                note: "Durable Objects, ücretli Workers planını gerektirir (~$5/ay).",
                keys: ["VITE_WORKER_URL"],
                configured: () => isCloudUrl(XL.config.worker.url) },
  hosting:    { label: "Statik hosting/CDN — Cloudflare Pages / Vercel / Netlify", when: "now", phase: 9, free: true,
                note: "Cloudflare hesabıyla aynı olabilir (Pages).", keys: [], configured: () => false },
  domain:     { label: "Alan adı (domain) — kayıt firması", when: "now", phase: 9, free: false,
                note: "~$10-15/yıl. Cloudflare Registrar veya Namecheap.", keys: [], configured: () => false },
  github:     { label: "GitHub — repo + CI/CD (Actions)", when: "now", phase: 9, free: true,
                note: "Zaten kullanılıyor; CI/CD ve otomatik deploy buradan.", keys: [], configured: () => true },

  // ——— GELECEKTE (uygulama büyüyünce / şirketlere satılınca) ———
  stripe:     { label: "Stripe — gerçek ödeme/abonelik (Faz 3 canlı)", when: "future", phase: 9, free: true,
                note: "Gizli anahtar Worker secret'ında; webhook ile abonelik durumu.",
                keys: ["VITE_STRIPE_PUBLISHABLE_KEY"],
                configured: () => !!XL.config.stripe.publishableKey },
  googleCloud:{ label: "Google Cloud Console — 'Google ile giriş' + Drive BYOS", when: "future", phase: 9, free: true,
                keys: ["VITE_GOOGLE_OAUTH_CLIENT_ID"],
                configured: () => !!XL.config.oauth.googleClientId },
  microsoft:  { label: "Microsoft Entra/Azure — 'Microsoft ile giriş' + OneDrive BYOS + kurumsal SAML/SCIM", when: "future", phase: 9, free: true,
                keys: ["VITE_MS_OAUTH_CLIENT_ID"],
                configured: () => !!XL.config.oauth.msClientId },
  apple:      { label: "Apple Developer — 'Apple ile giriş' + App Store (mobil)", when: "future", phase: 10, free: false,
                note: "$99/yıl; iOS App Store + Apple ile giriş için.", keys: [], configured: () => false },
  sentry:     { label: "Hata takibi — Sentry vb. (Faz 7 canlı toplayıcı)", when: "future", phase: 7, free: true,
                note: "Ücretsiz katman yeter; ölçekte upgrade.",
                keys: ["VITE_OBSERVABILITY_DSN"],
                configured: () => !!XL.config.observability.dsn },
  email:      { label: "İşlemsel e-posta — Resend / Postmark / SES (davet, bildirim, sıfırlama)", when: "future", phase: 9, free: true,
                note: "Supabase yerleşik e-postası düşük hacim; ölçekte ayrı sağlayıcı.", keys: [], configured: () => false },
  redis:      { label: "Redis/KV cache — Upstash vb. (ölçek: oturum/metadata, gerçek rate-limit)", when: "future", phase: 9, free: true,
                keys: [], configured: () => false },
  compliance: { label: "SOC 2 / ISO 27001 denetçisi — kurumsal satış ön koşulu", when: "future", phase: 8, free: false,
                note: "Denetim firması + süreç; kurumsal müşteriler ister.", keys: [], configured: () => false },
};

// Yardımcılar: "now"/"future" listeleri + bir servisin yapılandırma durumu.
XL.config.servicesWhen = (when) =>
  Object.entries(XL.config.services).filter(([, s]) => s.when === when).map(([id, s]) => ({ id, ...s }));
XL.config.serviceConfigured = (id) => {
  const s = XL.config.services[id];
  try { return !!(s && s.configured()); } catch (e) { return false; }
};
