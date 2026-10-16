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
XL.config = {
  supabase: {
    url: "http://127.0.0.1:54321",
    // Yerel standart "anon" (public) anahtarı — supabase start çıktısındaki ANON_KEY
    anonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  },
};
