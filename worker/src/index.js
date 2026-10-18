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

/* --- Rate limiting (abuse önleme) — IP başına kayan pencere sayacı --------- *
 * NOT: Bu isolate-yerel (bellekte) bir sayaçtır → "kod hazırlığı" seviyesidir;
 * Worker isolate'leri geçici ve colo başına ayrı olduğundan YAKLAŞIKTIR. Üretimde
 * global doğruluk için Durable Object / KV / Cloudflare Rate Limiting kullanılmalı.
 * Yine de tek isolate'e gelen kaba sel/brute-force'u ucuzca frenler.
 */
const _rl = new Map(); // key -> { count, resetAt }
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  let e = _rl.get(key);
  if (!e || now >= e.resetAt) { e = { count: 0, resetAt: now + windowMs }; _rl.set(key, e); }
  e.count++;
  if (_rl.size > 20000) { for (const [k, v] of _rl) if (now >= v.resetAt) _rl.delete(k); } // ara temizlik
  return e.count <= limit;
}

// WebSocket ikili mesajını Uint8Array'e çevirir (ArrayBuffer | Blob | TypedArray).
async function toBytes(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data && typeof data.arrayBuffer === "function") return new Uint8Array(await data.arrayBuffer()); // Blob
  return null; // string vb.
}

// [type baytı][payload] çerçevesi (0 = Yjs doc update, 1 = awareness).
function framed(type, bytes) {
  const out = new Uint8Array(bytes.length + 1);
  out[0] = type;
  out.set(bytes, 1);
  return out;
}

// Kullanıcının belgeye erişimi var mı? Kendi token'ıyla Supabase'e sorar; RLS
// bir satır döndürürse (sahip veya paylaşılan) erişim vardır. service_role GEREKMEZ.
async function checkDocAccess(docId, token, env) {
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/documents?id=eq.${encodeURIComponent(docId)}&select=id`,
      { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return false;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    return false;
  }
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

    // Genel IP rate limit (sağlık kontrolü hariç): 120 istek / 60 sn.
    const ip = request.headers.get("CF-Connecting-IP") || "anon";
    if (path !== "/health" && !rateLimit("g:" + ip, 120, 60000)) {
      return fail("rate_limited", "Çok fazla istek. Lütfen biraz sonra tekrar deneyin.", 429);
    }

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
      // WS bağlantı kurma denemeleri için daha sıkı limit: 30 / 60 sn.
      if (!rateLimit("ws:" + ip, 30, 60000)) {
        return fail("rate_limited", "Çok fazla bağlantı denemesi.", 429);
      }
      // Tarayıcı WebSocket başlık gönderemediği için token query'den gelir.
      const token = url.searchParams.get("token");
      const user = await verifyToken(token, env);
      if (!user) return fail("invalid_token", "Geçersiz oturum (token).", 401);
      const docId = decodeURIComponent(room[1]);
      // Belge erişim yetkisi (owner/shared) — RLS üzerinden doğrula.
      if (!(await checkDocAccess(docId, token, env))) {
        return fail("forbidden", "Bu belgeye erişiminiz yok.", 403);
      }
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

  _broadcast(exceptSession, msg) {
    for (const s of this.sessions) {
      if (s !== exceptSession) { try { s.ws.send(msg); } catch (e) {} }
    }
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();
    // aw = son awareness; rl* = mesaj sel koruması (oturum başına kayan pencere).
    const session = { ws: server, aw: null, rlCount: 0, rlReset: Date.now() + 10000 };
    this.sessions.add(session);

    // 1) Saklı doc güncellemelerini gönder ([0]=doc). 2) Diğerlerinin awareness'ı ([1]).
    const updates = await this._loadUpdates();
    for (const u of updates) { try { server.send(framed(0, u)); } catch (e) {} }
    for (const s of this.sessions) {
      if (s !== session && s.aw) { try { server.send(framed(1, s.aw)); } catch (e) {} }
    }

    const MAX_MSG = 1 << 20;   // 1 MB — tek mesaj boyut tavanı (zip-bomb/abuse)
    const MAX_RATE = 400;       // 10 sn'de en çok 400 mesaj (sel koruması)

    server.addEventListener("message", async (evt) => {
      // Mesaj sel koruması: pencere dolduysa oturumu kapat.
      const now = Date.now();
      if (now >= session.rlReset) { session.rlReset = now + 10000; session.rlCount = 0; }
      if (++session.rlCount > MAX_RATE) {
        try { server.close(1008, "rate limit"); } catch (e) {}
        this.sessions.delete(session);
        return;
      }
      const bytes = await toBytes(evt.data);
      if (!bytes || bytes.length < 1) return;
      if (bytes.length > MAX_MSG) return; // aşırı büyük mesajı sessizce yoksay
      const type = bytes[0];
      const payload = bytes.subarray(1);
      if (type === 0) {
        // Yjs doc güncellemesi → sakla + yayınla
        const copy = payload.slice();
        const list = await this._loadUpdates();
        list.push(copy);
        await this.state.storage.put("updates", list.map((u) => Array.from(u)));
        this._broadcast(session, framed(0, copy));
      } else if (type === 1) {
        // Awareness (presence/imleç) → saklanmaz, yalnız yayınlanır
        session.aw = payload.slice();
        this._broadcast(session, framed(1, session.aw));
      }
    });

    const close = () => this.sessions.delete(session);
    server.addEventListener("close", close);
    server.addEventListener("error", close);

    return new Response(null, { status: 101, webSocket: client });
  }
}
