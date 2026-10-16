/* index.js — UniTEAM ince backend (Cloudflare Worker)
 *
 * Görevi: işin çoğunu Supabase (PostgREST + RLS) yaparken, yalnızca gizli/özel
 * işleri üstlenen küçük bir güvenli ara katman olmak:
 *   - Supabase JWT (kullanıcı oturum token'ı) doğrulama
 *   - (B2) realtime-token üretimi
 *   - (B3) paylaşım linki token'ı + BYOS upload/download referansları
 *
 * Worker nedir? İstek geldiğinde çalışan, sunucu yönetmediğin (serverless) küçük
 * bir fonksiyon. Girişi bir `Request`, çıkışı bir `Response`. Cloudflare'in edge
 * ağında, kullanıcıya en yakın noktada çalışır.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";

// JWKS (Supabase'in public imza anahtarları) — modül düzeyinde bir kez kurulur,
// jose bunu önbelleğe alır (her istekte yeniden indirmez).
let _jwks = null;
function getJWKS(env) {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(
      new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
    );
  }
  return _jwks;
}

/* --- CORS: tarayıcıdaki frontend'in bu Worker'ı çağırabilmesi için --- */
// Geliştirmede her kökene izin veriyoruz; canlıda yalnız kendi alan adımız olacak.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

// JSON yanıt yardımcısı (CORS başlıklarıyla).
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// Standart hata zarfı (docs/api-contract.md ile uyumlu).
function fail(code, message, status) {
  return json({ error: { code, message } }, status);
}

/* --- Kimlik doğrulama: Authorization: Bearer <token> başlığını doğrular --- */
// Başarılıysa token "payload"ını (içinde sub = kullanıcı id'si) döndürür.
async function authenticate(request, env) {
  const header = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return { error: fail("unauthorized", "Authorization başlığı gerekli.", 401) };

  try {
    const { payload } = await jwtVerify(m[1], getJWKS(env), {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
    return { user: { id: payload.sub, email: payload.email, role: payload.role } };
  } catch (e) {
    return { error: fail("invalid_token", "Geçersiz veya süresi dolmuş oturum.", 401) };
  }
}

/* --- Yönlendirme (router) --- */
export default {
  async fetch(request, env) {
    // Tarayıcı asıl istekten önce bir OPTIONS "ön kontrol" isteği yollar (CORS).
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const path = url.pathname;

    // Sağlık kontrolü — kimlik gerektirmez.
    if (path === "/health" && request.method === "GET") {
      return json({ ok: true, service: "uniteam-worker", time: new Date().toISOString() });
    }

    // Kim olduğumu söyle — geçerli oturum token'ı gerektirir (JWT doğrulama testi).
    if (path === "/whoami" && request.method === "GET") {
      const auth = await authenticate(request, env);
      if (auth.error) return auth.error;
      return json({ user: auth.user });
    }

    return fail("not_found", "Böyle bir uç yok: " + path, 404);
  },
};
