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

// WebSocket ikili mesajını Uint8Array'e çevirir (ArrayBuffer | Blob | TypedArray).
async function toBytes(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data && typeof data.arrayBuffer === "function") return new Uint8Array(await data.arrayBuffer()); // Blob
  return null; // string vb.
}

/* --- Token doğrulama çekirdeği (jose/JWKS, ES256) --- */
// Geçerliyse kullanıcıyı döndürür; değilse null.
async function verifyToken(token, env) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJWKS(env), {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
    return { id: payload.sub, email: payload.email, role: payload.role };
  } catch (e) {
    return null;
  }
}

/* --- Kimlik doğrulama: Authorization: Bearer <token> başlığını doğrular --- */
async function authenticate(request, env) {
  const header = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return { error: fail("unauthorized", "Authorization başlığı gerekli.", 401) };
  const user = await verifyToken(m[1], env);
  if (!user) return { error: fail("invalid_token", "Geçersiz veya süresi dolmuş oturum.", 401) };
  return { user };
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

    // Gerçek zamanlı oda WebSocket'i: /rooms/<docId>/ws?token=<jwt>
    // Belge başına bir DocRoom (Durable Object) örneğine yönlendirir.
    const room = /^\/rooms\/([^/]+)\/ws$/.exec(path);
    if (room) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return fail("bad_request", "WebSocket bağlantısı bekleniyor.", 426);
      }
      // Tarayıcı WebSocket başlık gönderemediği için token query'den gelir.
      const token = url.searchParams.get("token");
      const user = await verifyToken(token, env);
      if (!user) return fail("invalid_token", "Geçersiz oturum (token).", 401);
      // TODO(güvenlik): belge erişim yetkisini (owner/shared) de doğrula
      // (service_role ile user_doc_role sorgusu) — şimdilik yalnız kimlik.
      const docId = decodeURIComponent(room[1]);
      const id = env.DOCROOM.idFromName(docId);
      return env.DOCROOM.get(id).fetch(request);
    }

    return fail("not_found", "Böyle bir uç yok: " + path, 404);
  },
};

/* =============================================================================
 * DocRoom — belge başına gerçek zamanlı oda (Durable Object)
 * -----------------------------------------------------------------------------
 * Basit ve doğru bir Yjs relay'i:
 *   - Bağlı tüm WebSocket'leri (oturumları) tutar.
 *   - Bir istemciden gelen ikili mesaj = Yjs güncellemesi → saklar + DİĞER
 *     oturumlara yayınlar (gönderene geri yollamaz).
 *   - Yeni bağlanan istemciye saklı tüm güncellemeler gönderilir (geç gelen
 *     senkron olur). Yjs güncellemeleri birikimli/değişmeli olduğu için bu yeterli.
 * Not: Sunucuda Yjs çalıştırmıyoruz (DO sadece relay + depo). Awareness/imleç
 * (RT3) ve snapshot sıkıştırma (ölçek) sonraki adımlar.
 * ========================================================================== */
export class DocRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
    this.updates = null; // tembel yüklenir (DO storage'dan)
  }

  async _loadUpdates() {
    if (this.updates) return this.updates;
    const stored = (await this.state.storage.get("updates")) || [];
    // storage'da sayı dizisi olarak tutulur → Uint8Array'e çevir
    this.updates = stored.map((arr) => new Uint8Array(arr));
    return this.updates;
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();
    this.sessions.add(server);

    // Yeni istemciye saklı tüm güncellemeleri gönder (ilk senkron).
    const updates = await this._loadUpdates();
    for (const u of updates) {
      try { server.send(u); } catch (e) {}
    }

    server.addEventListener("message", async (evt) => {
      // İkili mesaj Workers'a ArrayBuffer, Blob veya TypedArray olarak gelebilir.
      const update = await toBytes(evt.data);
      if (!update) return; // metin vb. yoksay
      // Sakla (kalıcılaştır)
      const list = await this._loadUpdates();
      list.push(update);
      await this.state.storage.put("updates", list.map((u) => Array.from(u)));
      // Diğer oturumlara yayınla (gönderen hariç)
      for (const s of this.sessions) {
        if (s !== server) { try { s.send(update); } catch (e) {} }
      }
    });

    const close = () => this.sessions.delete(server);
    server.addEventListener("close", close);
    server.addEventListener("error", close);

    return new Response(null, { status: 101, webSocket: client });
  }
}
