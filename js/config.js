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
};
