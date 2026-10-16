-- =============================================================================
-- UniTEAM — Veritabanı Şeması (v1, MVP)  ·  PostgreSQL / Supabase
-- =============================================================================
-- Bu dosya API sözleşmesindeki (docs/api-contract.md) varlıkların GERÇEK tablo
-- karşılığıdır. BYOS ilkesi gereği burada belge BYTE'ları YOKTUR; yalnızca
-- meta veri + izinler + referanslar tutulur.
--
-- Öğrenme notu: Her tablo ve anahtar seçimi yorumlarda gerekçesiyle açıklanmıştır.
-- PK = Primary Key (birincil anahtar), FK = Foreign Key (yabancı anahtar).
-- =============================================================================

-- UUID üretimi için (Supabase'de genelde zaten açık).
create extension if not exists "pgcrypto";


-- =============================================================================
-- 0) ENUM TÜRLERİ — sınırlı/sabit değer kümeleri
-- -----------------------------------------------------------------------------
-- Neden enum? "type" gibi alanlar yalnızca birkaç sabit değeri alabilir. Enum,
-- veritabanı seviyesinde yanlış değer girilmesini engeller (bütünlük/integrity)
-- ve serbest metne (ör. 'xlsx' yanlışlıkla 'xslx' yazılması) göre güvenlidir.
-- =============================================================================

create type document_type   as enum ('xlsx', 'docx', 'pptx');
create type doc_role        as enum ('owner', 'editor', 'commenter', 'viewer');
create type storage_provider as enum ('gdrive', 'onedrive', 'relay');
create type share_status     as enum ('active', 'pending');


-- =============================================================================
-- 1) profiles — kullanıcı profili
-- -----------------------------------------------------------------------------
-- Supabase, kimlik/parola/OAuth'u kendi "auth.users" tablosunda yönetir; biz ona
-- dokunmayız. Kendi uygulama verimizi (görünen ad, avatar, dil) burada tutarız.
--
-- ANAHTAR SEÇİMİ (önemli desen): id hem PK hem de auth.users'a FK.
--   - Bu "1:1 genişletme" desenidir: her auth kullanıcısının TAM BİR profili olur.
--   - Ayrı bir surrogate id ÜRETMİYORUZ; auth.users.id'yi paylaşıyoruz. Böylece
--     iki tablo daima aynı kimlikte hizalı kalır (tutarlılık bedava gelir).
--   - on delete cascade: auth kullanıcısı silinirse profili de otomatik silinir.
-- =============================================================================

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text,
  avatar_url   text,
  locale       text not null default 'tr',
  created_at   timestamptz not null default now()
);

-- Yeni kullanıcı auth.users'a eklenince otomatik profil oluştur (Supabase deseni).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =============================================================================
-- 2) folders — belgeleri düzenlemek için klasörler (ağaç yapısı)
-- -----------------------------------------------------------------------------
-- ANAHTAR SEÇİMİ:
--   - id: surrogate UUID PK (aşağıda "neden UUID" açıklandı).
--   - parent_id: AYNI tabloya FK (self-reference / öz-ilişki) → klasör ağacı
--     (klasör içinde klasör). Kök klasörlerde parent_id = NULL.
--   - owner_id: profiles'e FK → klasörün sahibi.
-- =============================================================================

create table public.folders (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  parent_id  uuid references public.folders (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create index idx_folders_owner  on public.folders (owner_id);
create index idx_folders_parent on public.folders (parent_id);


-- =============================================================================
-- 3) documents — belge META verisi (byte'lar DEĞİL)
-- -----------------------------------------------------------------------------
-- NEDEN SURROGATE UUID PK (serial/artan sayı yerine)?
--   1) Dağıtık/ölçek dostu: birden çok sunucu/istemci çakışmadan id üretebilir
--      (gelecekte "belge = oda" modelinde oda id'si = belge id'si).
--   2) Tahmin edilemez: ardışık sayılar (1,2,3) URL'de güvenlik/sızıntı riski
--      taşır (kullanıcı /documents/2 deyip başkasının sayısını tahmin edemesin).
--   3) İstemci id'yi önceden üretip çevrimdışı oluşturabilir, sonra senkronlar.
--
-- storage_* alanları = BYOS referansı (byte'lar nerede?). İçeriğin kendisi yok.
--   - storage_etag: sağlayıcıdaki sürüm imzası → çakışma tespiti (409 conflict).
-- trashed_at NULL değilse belge "çöp kutusunda" (yumuşak silme / soft delete).
-- =============================================================================

create table public.documents (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references public.profiles (id) on delete cascade,
  folder_id          uuid references public.folders (id) on delete set null,
  name               text not null,
  type               document_type not null,
  storage_provider   storage_provider,
  storage_external_id text,
  storage_etag       text,
  trashed_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index idx_documents_owner  on public.documents (owner_id);
create index idx_documents_folder on public.documents (folder_id);

-- updated_at'i her güncellemede otomatik tazele.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_documents_touch
  before update on public.documents
  for each row execute function public.touch_updated_at();


-- =============================================================================
-- 4) document_shares — kim, hangi belgeye, hangi rolle erişebilir
-- -----------------------------------------------------------------------------
-- Bu bir ASSOCIATIVE (bağlantı / junction) tablodur: documents ile profiles
-- arasındaki ÇOKTAN-ÇOĞA (N:M) ilişkiyi çözer.
--   - Bir belge birçok kullanıcıyla paylaşılabilir.
--   - Bir kullanıcı birçok belgeye erişebilir.
--   - İlişkinin KENDİSİNE ait bir öznitelik var: role (editor/viewer...). Bu
--     yüzden sade bir bağlantı değil, "öznitelikli" bağlantı tablosu.
--
-- ANAHTAR SEÇİMİ:
--   - id: surrogate UUID PK (API'de share id ile tek tek işlem yapılabilsin).
--   - unique(document_id, user_id): BİLEŞİK ADAY ANAHTAR (composite candidate
--     key). Bir kullanıcının aynı belgede EN FAZLA BİR rolü olur — çift kayıt
--     engellenir. (Surrogate PK'yi pratiklik için, bu unique'i doğruluk için
--     kullanıyoruz: ikisi birlikte.)
--   - FK'ler cascade: belge ya da kullanıcı silinince paylaşım kaydı da gider.
-- =============================================================================

create table public.document_shares (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        doc_role not null default 'viewer',
  status      share_status not null default 'active',
  created_at  timestamptz not null default now(),
  unique (document_id, user_id)
);

create index idx_shares_document on public.document_shares (document_id);
create index idx_shares_user     on public.document_shares (user_id);


-- =============================================================================
-- 5) share_links — belirteçle (token) paylaşım bağlantıları
-- -----------------------------------------------------------------------------
-- "Linki olan görüntüleyebilsin" senaryosu. Belge 1 — N bağlantı.
-- ANAHTAR SEÇİMİ:
--   - id: surrogate UUID PK.
--   - token: unique DOĞAL ANAHTAR (natural key). Link çözümü token ile yapılır
--     (GET /v1/links/{token}); benzersiz olmalı. URL'de göründüğü için uzun ve
--     tahmin edilemez üretilir.
-- =============================================================================

create table public.share_links (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  token       text not null unique,
  role        doc_role not null default 'viewer',
  is_public   boolean not null default true,
  expires_at  timestamptz,
  created_by  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index idx_links_document on public.share_links (document_id);


-- =============================================================================
-- 6) document_versions — sürüm geçmişi (anlık görüntüler)
-- -----------------------------------------------------------------------------
-- Belge 1 — N sürüm. Byte'lar yine BYOS'ta; burada her sürümün referansı durur.
-- =============================================================================

create table public.document_versions (
  id                 uuid primary key default gen_random_uuid(),
  document_id        uuid not null references public.documents (id) on delete cascade,
  label              text,
  created_by         uuid references public.profiles (id) on delete set null,
  storage_provider   storage_provider,
  storage_external_id text,
  created_at         timestamptz not null default now()
);

create index idx_versions_document on public.document_versions (document_id);


-- =============================================================================
-- 7) GÜVENLİK: Row Level Security (RLS)
-- -----------------------------------------------------------------------------
-- RLS, SATIR seviyesinde "bu kullanıcı bu satırı görebilir/değiştirebilir mi?"
-- kuralıdır. API katmanı atlanıp DB'ye doğrudan erişilse bile yetki korunur
-- (çift güvenlik). auth.uid() = o an giriş yapmış kullanıcının id'si.
--
-- Döngü (recursion) sorununu önlemek için erişim rolünü hesaplayan bir
-- SECURITY DEFINER fonksiyon kullanıyoruz: fonksiyon RLS'i atlayarak rolü bulur,
-- policy'ler de bu fonksiyonu çağırır.
-- =============================================================================

-- Rolleri sayısal sıraya çevirir (owner=4 ... viewer=1) → "en az şu rol" kıyası.
create or replace function public.doc_role_rank(r doc_role)
returns int language sql immutable as $$
  select case r
    when 'owner' then 4 when 'editor' then 3
    when 'commenter' then 2 when 'viewer' then 1 end;
$$;

-- Kullanıcının bir belgedeki EFEKTİF rolü (owner ise owner; değilse paylaşım rolü).
create or replace function public.user_doc_role(doc uuid)
returns doc_role
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from documents d where d.id = doc and d.owner_id = auth.uid())
      then 'owner'::doc_role
    else (select s.role from document_shares s
          where s.document_id = doc and s.user_id = auth.uid() and s.status = 'active'
          limit 1)
  end;
$$;

-- RLS'i tüm tablolarda aç.
alter table public.profiles          enable row level security;
alter table public.folders           enable row level security;
alter table public.documents         enable row level security;
alter table public.document_shares   enable row level security;
alter table public.share_links       enable row level security;
alter table public.document_versions enable row level security;

-- profiles: herkes kendi profilini görür/günceller.
create policy profiles_self_select on public.profiles
  for select using (id = auth.uid());
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid());

-- folders: yalnızca sahibi.
create policy folders_owner_all on public.folders
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- documents: sahibi VEYA paylaşılan görür; değiştirmek için ≥ editor; silmek owner.
-- NOT: Sahip kontrolü doğrudan owner_id ile yapılır (user_doc_role çağrılmaz).
-- Neden: user_doc_role documents'ı KENDİ İÇİNDE sorgular; INSERT ... RETURNING
-- sırasında yeni satır o alt-sorguya görünmez → yanlış RLS reddi. owner_id ise
-- satırda anında mevcut. (Paylaşım kontrolü farklı tablodan geldiği için sorunsuz.)
create policy documents_select on public.documents
  for select using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.document_shares s
      where s.document_id = id and s.user_id = auth.uid() and s.status = 'active'
    )
  );
create policy documents_insert on public.documents
  for insert with check (owner_id = auth.uid());
create policy documents_update on public.documents
  for update using (public.doc_role_rank(public.user_doc_role(id)) >= 3);  -- editor+
create policy documents_delete on public.documents
  for delete using (owner_id = auth.uid());

-- document_shares: belgeyi görebilen paylaşımları görür; yönetmek owner'a ait.
create policy shares_select on public.document_shares
  for select using (public.user_doc_role(document_id) is not null);
create policy shares_write on public.document_shares
  for all using (public.user_doc_role(document_id) = 'owner')
          with check (public.user_doc_role(document_id) = 'owner');

-- share_links: sahibi yönetir.
create policy links_owner on public.share_links
  for all using (public.user_doc_role(document_id) = 'owner')
          with check (public.user_doc_role(document_id) = 'owner');

-- document_versions: belgeyi görebilen görür; eklemek için ≥ editor.
create policy versions_select on public.document_versions
  for select using (public.user_doc_role(document_id) is not null);
create policy versions_insert on public.document_versions
  for insert with check (public.doc_role_rank(public.user_doc_role(document_id)) >= 3);

-- =============================================================================
-- Not: Bu şema 3NF'e (üçüncü normal form) uygundur — her tablo tek bir varlığı
-- temsil eder, tekrarlı grup yoktur, öznitelikler yalnızca PK'ye bağlıdır.
-- =============================================================================
