# UniTEAM — API Sözleşmesi (v1)

> **Amaç:** İstemci (web / mobil / PC) ile backend arasındaki **tek, kararlı kontrat**.
> Üç istemci de bu aynı API'ye konuşur — "tek mutfak, çok salon". Backend'in içi
> değişse bile (Supabase → kendi servisin) bu yüzey aynı kalır.
>
> **Durum:** Taslak v1 (MVP kapsamı). Henüz kod YOK — bu belge önce yazıldı, uygulama buna uyacak.
> İlgili kararlar: Supabase (durağan metadata+auth) + Cloudflare Durable Objects & Yjs (gerçek zamanlı), BYOS.

---

## 0. Temel İlkeler

| Konu | Karar |
|------|-------|
| Taban URL | `https://api.uniteam.app/v1` (prod) · `http://localhost:8787/v1` (yerel) |
| Sürümleme | Yol tabanlı: `/v1`. Kırıcı değişiklik → `/v2`. |
| Biçim | İstek ve yanıt gövdesi **JSON**, UTF-8. |
| Kimlik | `Authorization: Bearer <access_token>` — token Supabase Auth'tan gelir (JWT). |
| Kimlikler (ID) | **UUID** (string). |
| Zaman | ISO 8601 UTC, ör. `2026-10-15T09:30:00Z`. |
| Sayfalama | `?limit=50&cursor=<opak>` → yanıtta `next_cursor`. |
| Hata | Standart zarf (bkz. §6). |
| İsimlendirme | Alanlar `snake_case`. |

### Rol modeli (RBAC)
Her belge paylaşımında bir rol: `owner` > `editor` > `commenter` > `viewer`.
Yetkiler Supabase **Row Level Security (RLS)** ile veritabanı seviyesinde de zorlanır (çift güvenlik).

---

## 1. Kimlik Doğrulama (Auth)

Auth'u **Supabase Auth** yürütür; kendi API'miz sadece gelen JWT'yi **doğrular**.

- Kayıt / giriş / OAuth / parola sıfırlama → istemci **Supabase SDK** ile yapar (bizim endpoint'imiz değil).
  - E-posta + parola, ve OAuth: Google, Microsoft, Apple.
- Supabase bir **access_token (JWT, ~1 saat)** + **refresh_token** verir.
- İstemci her API isteğine `Authorization: Bearer <access_token>` ekler.
- Backend token'ı Supabase'in açık anahtarıyla (JWKS) doğrular; `sub` claim'i = kullanıcı ID.
- Token süresi dolunca istemci Supabase SDK ile sessizce yeniler.

> Bu yüzden aşağıda `/auth/*` endpoint'i yoktur — o iş Supabase tarafında. Bizim API `me` ile başlar.

### `GET /v1/me`
Oturum açmış kullanıcının profili.
```json
200 OK
{
  "id": "u_8f3...",
  "email": "muhammet@example.com",
  "display_name": "Muhammet",
  "avatar_url": null,
  "locale": "tr",
  "created_at": "2026-10-15T09:00:00Z"
}
```

---

## 2. Belgeler (Documents) — yalnızca META VERİ

⚠️ **BYOS ilkesi:** Belgenin **byte'larını biz saklamayız.** Burada tutulan şey yalnızca
meta veridir (ad, tür, sahip, izinler, byte'ların NEREDE olduğunun referansı). Gerçek dosya
kullanıcının bulutunda (Drive/OneDrive) veya geçici relay'de; canlı düzenleme durumu ise
Cloudflare DO'daki Yjs belgesinde.

### Belge nesnesi (şema)
```json
{
  "id": "d_1a2b...",
  "name": "Bütçe 2026",
  "type": "xlsx",                      // "xlsx" | "docx" | "pptx"
  "owner_id": "u_8f3...",
  "folder_id": null,
  "storage": {                          // byte'lar nerede? (BYOS)
    "provider": "gdrive",               // "gdrive" | "onedrive" | "relay"
    "external_id": "1AbC...",           // sağlayıcıdaki dosya kimliği
    "etag": "W/\"abc\""                 // sürüm/çakışma tespiti
  },
  "realtime": {
    "room_id": "d_1a2b...",             // DO oda kimliği (genelde = belge id)
    "has_live_state": true
  },
  "my_role": "owner",                   // istekte bulunan kullanıcının rolü
  "updated_at": "2026-10-15T09:30:00Z",
  "created_at": "2026-10-14T12:00:00Z",
  "trashed_at": null
}
```

### `GET /v1/documents`
Kullanıcının erişebildiği belgeleri listeler (kendi + paylaşılanlar).
Sorgu: `?type=xlsx&folder_id=...&trashed=false&limit=50&cursor=...`
```json
200 OK
{ "items": [ { /* belge */ } ], "next_cursor": null }
```

### `POST /v1/documents`
Yeni belge **meta verisi** oluşturur. (Byte'lar ayrıca §3 ile bağlanır.)
```json
// istek
{ "name": "Bütçe 2026", "type": "xlsx", "folder_id": null,
  "storage": { "provider": "gdrive", "external_id": "1AbC..." } }
// yanıt
201 Created
{ /* belge nesnesi */ }
```

### `GET /v1/documents/{id}`
Tek belgenin meta verisi + benim rolüm. (403 yetkisizse, 404 yoksa.)

### `PATCH /v1/documents/{id}`
Yeniden adlandırma / klasör taşıma. Rol ≥ editor.
```json
{ "name": "Bütçe 2026 - final", "folder_id": "f_..." }
```

### `DELETE /v1/documents/{id}`
**Çöp kutusuna** taşır (yumuşak silme). Rol = owner. `trashed_at` dolar.

### `POST /v1/documents/{id}/restore`
Çöp kutusundan geri alır. Rol = owner.

---

## 3. Depolama Bağlama (BYOS) — byte'lar için referans

Server byte'ları **taşımaz**; istemciye "byte'ları nereye koy / nereden al" bilgisini verir.

### `POST /v1/documents/{id}/upload-ref`
Kaydet-at: istemcinin byte'ları nereye yazacağını döndürür.
- `provider=relay` ise: kısa ömürlü **imzalı yükleme URL'si** (geçici depolama).
- `provider=gdrive|onedrive` ise: istemci zaten kullanıcının OAuth'uyla kendi bulutuna yazar;
  bu uç sadece `external_id`'yi doğrular/kaydeder.
```json
200 OK
{ "method": "PUT", "url": "https://relay.uniteam.app/...signed...", "expires_at": "..." }
```

### `GET /v1/documents/{id}/download-ref`
Byte'ları okumak için referans/URL döndürür (aynı mantık, indirme yönünde). Rol ≥ viewer.

> Neden böyle: Bu dolaylama sayesinde en büyük değişken gider (depolama/trafik) baştan **sıfırlanır** —
> byte'lar kullanıcının bulutunda. Biz yalnızca küçük meta veriyi tutarız.

---

## 4. Gerçek Zamanlı Oturum (Realtime) — Cloudflare DO + Yjs köprüsü

Canlı eş düzenleme HTTP ile değil, **WebSocket** ile olur. Ama WebSocket'e bağlanmak için
önce bu REST ucundan kısa ömürlü bir **oda bileti** alınır.

### `POST /v1/documents/{id}/realtime-token`
Rol ≥ commenter (viewer sadece okur — presence'a göre karar). Döndürür:
```json
200 OK
{
  "ws_url": "wss://rt.uniteam.app/room/d_1a2b...",
  "room_id": "d_1a2b...",
  "token": "<kısa ömürlü imzalı bilet, ~60 sn geçerli>",
  "role": "editor"
}
```
**Akış:**
1. İstemci bu bileti alır.
2. `ws_url`'e `?token=...` ile WebSocket açar → Cloudflare **Durable Object** (belge = tek DO = tek oda).
3. Üstünde **Yjs senkron protokolü** konuşulur (CRDT): ilk durum senkronu + sonrası artımlı güncelleme + presence (canlı imleç/seçim).
4. DO belge CRDT durumunu tutar; periyodik **snapshot** alır (ileride object storage/Postgres'e kalıcı).
5. Bilet süresi WebSocket açıldıktan sonra önemsiz; bağlantı yaşadıkça geçerli.

> Not: Çevrimdışı düzenleme Yjs'de yereldir; yeniden bağlanınca otomatik birleşir (CRDT bedavaya getirir).

---

## 5. Paylaşım & İzinler

### Paylaşım (share) nesnesi
```json
{ "id": "s_...", "document_id": "d_...", "user_id": "u_...",
  "email": "ayse@example.com", "role": "editor",
  "status": "active", "created_at": "..." }
```

| Uç | Açıklama | Gerekli rol |
|----|----------|-------------|
| `GET /v1/documents/{id}/shares` | Belgedeki tüm işbirlikçiler | ≥ viewer |
| `POST /v1/documents/{id}/shares` | E-posta/kullanıcı davet et (`{ "email": "...", "role": "editor" }`) | owner |
| `PATCH /v1/documents/{id}/shares/{shareId}` | Rol değiştir (`{ "role": "viewer" }`) | owner |
| `DELETE /v1/documents/{id}/shares/{shareId}` | Erişimi kaldır | owner |

### Paylaşım bağlantısı (link)
```json
{ "id": "l_...", "token": "k7Xy...", "role": "viewer",
  "expires_at": "2026-11-01T00:00:00Z", "is_public": true }
```
| Uç | Açıklama |
|----|----------|
| `POST /v1/documents/{id}/links` | Link üret (`{ "role": "viewer", "expires_at": "...", "is_public": true }`) · owner |
| `DELETE /v1/documents/{id}/links/{linkId}` | Linki iptal et · owner |
| `GET /v1/links/{token}` | Linki çöz → belge özeti + verilen rol (giriş gerektirebilir) |

---

## 6. Sürümler (Versions)

| Uç | Açıklama |
|----|----------|
| `GET /v1/documents/{id}/versions` | Sürüm geçmişi listesi |
| `POST /v1/documents/{id}/versions` | O anki durumdan anlık görüntü (snapshot) al · rol ≥ editor |
| `GET /v1/documents/{id}/versions/{versionId}` | Belirli sürümün referansı (byte'lar yine BYOS) |

Sürüm nesnesi: `{ "id": "v_...", "label": "otomatik" , "created_by": "u_...", "created_at": "...", "storage": { ... } }`

---

## 7. Hata Zarfı (tüm uçlarda ortak)

```json
4xx / 5xx
{ "error": { "code": "forbidden", "message": "Bu belgeye erişim yetkiniz yok.", "details": {} } }
```

| HTTP | code örnekleri | Anlamı |
|------|----------------|--------|
| 400 | `invalid_request` | Gövde/parametre hatalı |
| 401 | `unauthenticated` | Token yok/geçersiz/süresi dolmuş |
| 403 | `forbidden` | Yetki yetersiz (rol) |
| 404 | `not_found` | Kayıt yok ya da görme hakkın yok |
| 409 | `conflict` | Çakışma (ör. `etag` uyuşmazlığı) |
| 429 | `rate_limited` | Hız sınırı |
| 500 | `internal` | Sunucu hatası |

---

## 8. MVP Uygulama Notu (sözleşme ≠ uygulama)

Bu sözleşme **istemcinin gördüğü kararlı yüzey.** MVP'de içi şöyle kurulabilir:
- `GET /me`, basit belge/paylaşım CRUD → büyük ölçüde **Supabase** (Postgres + RLS) ile; gerekirse ince bir Cloudflare **Worker** önüne konur.
- `realtime-token`, `upload-ref/download-ref`, link token üretimi → **Worker** (imzalama/yetki gerektiren sunucu mantığı).
- Gerçek zamanlı kanal → Cloudflare **Durable Objects** + **Yjs**.

İleride backend'i kendi servisine taşısan da **istemci kodu değişmez**, çünkü kontrat budur.

## 9. Henüz kapsam dışı (sonraki sürümler)
Klasör CRUD ayrıntıları, yorum/@mention uçları, bildirimler, arama, organizasyon/takım hesapları,
admin, abonelik/faturalandırma. v1'de iskelet; sonra eklenecek.
