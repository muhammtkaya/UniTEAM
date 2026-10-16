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
      -- ⚠️ dış sütunu NİTELE (documents.id): document_shares'in de "id" sütunu var,
      -- niteliksiz "id" iç tabloya bağlanıp s.document_id = s.id olurdu → hiç eşleşmez.
      select 1 from public.document_shares s
      where s.document_id = documents.id and s.user_id = auth.uid() and s.status = 'active'
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


-- =============================================================================
-- 8) document_comments — bir belgeye yapılan yorumlar (başlıklı iş parçacığı)
-- -----------------------------------------------------------------------------
-- İLİŞKİLER:
--   • document_id → documents : bir belge 1—N yorum alır.
--   • author_id   → profiles  : yorumu yazan.
--   • parent_id   → document_comments : AYNI tabloya FK (ÖZ-İLİŞKİ / self-ref).
--     Üst yorum = null ise kök yorum; dolu ise bir yoruma verilen YANIT. Böylece
--     tek tabloda iş parçacığı (thread) kurulur — folders ağacıyla aynı fikir.
-- ÖZNİTELİKLER:
--   • body: yorum metni.  • anchor: jsonb ( opsiyonel) — ileride hücre/blok/slayt
--     bağlama (şimdilik belge geneli; null). jsonb seçildi çünkü bağlama şekli
--     uygulamaya göre değişir (Excel {sheet,r,c} vs Word {bid}) — esnek şema.
--   • resolved: çözüldü mü (gösterimde gri/gizli).
-- =============================================================================

create table public.document_comments (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  parent_id   uuid references public.document_comments (id) on delete cascade,
  body        text not null,
  anchor      jsonb,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_comments_document on public.document_comments (document_id);
create index idx_comments_parent   on public.document_comments (parent_id);

-- updated_at'i her güncellemede tazele (mevcut touch_updated_at() fonksiyonunu kullan).
create trigger trg_comments_touch
  before update on public.document_comments
  for each row execute function public.touch_updated_at();


-- =============================================================================
-- 9) comment_mentions — bir yorumda @bahsedilen kullanıcılar (N:M bağlantı)
-- -----------------------------------------------------------------------------
-- document_shares gibi ASSOCIATIVE (junction) tablo: comments ile profiles
-- arasındaki ÇOKTAN-ÇOĞA ilişkiyi çözer (bir yorum birçok kişiyi bahsedebilir;
-- bir kişi birçok yorumda bahsedilebilir).
-- ANAHTAR: (comment_id, user_id) BİLEŞİK DOĞAL PK — aynı kişi bir yorumda en
-- fazla bir kez bahsedilir; ayrı surrogate id'ye gerek yok (ilişkinin kendine
-- ait başka özniteliği yok).
-- =============================================================================

create table public.comment_mentions (
  comment_id uuid not null references public.document_comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  primary key (comment_id, user_id)
);

create index idx_mentions_user on public.comment_mentions (user_id);


-- =============================================================================
-- 10) notifications — kullanıcıya bildirimler (1—N: profile ← notifications)
-- -----------------------------------------------------------------------------
-- user_id = ALICI (bildirimi görecek). actor_id = olayı yapan (bahseden).
-- type: 'mention' (ileride 'comment_reply', 'share' eklenebilir — bu yüzden
--   enum değil text; az sayıda ama büyümeye açık, esnek bıraktık).
-- read: okundu mu. comment_id silinirse bildirim de gider (cascade).
-- =============================================================================

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  type        text not null,
  document_id uuid references public.documents (id) on delete cascade,
  comment_id  uuid references public.document_comments (id) on delete cascade,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index idx_notif_user on public.notifications (user_id, read);


-- =============================================================================
-- RLS — satır seviyesi güvenlik
-- -----------------------------------------------------------------------------
-- Yorum OLUŞTURMA yalnız add_comment() RPC'si ile yapılır (bahsetme+bildirimi
-- atomik kurmak için) → bilinçli olarak INSERT policy YOK; doğrudan insert
-- reddedilir. Okuma/güncelleme/silme doğrudan policy'lerle.
-- =============================================================================

alter table public.document_comments enable row level security;
alter table public.comment_mentions  enable row level security;
alter table public.notifications      enable row level security;

-- Yorumlar: belgeyi görebilen tüm katılımcılar görür.
create policy comments_select on public.document_comments
  for select using (public.user_doc_role(document_id) is not null);
-- Düzenleme/çözme ve silme: yorumun yazarı VEYA belge sahibi (moderasyon).
create policy comments_update on public.document_comments
  for update using (author_id = auth.uid() or public.user_doc_role(document_id) = 'owner')
          with check (author_id = auth.uid() or public.user_doc_role(document_id) = 'owner');
create policy comments_delete on public.document_comments
  for delete using (author_id = auth.uid() or public.user_doc_role(document_id) = 'owner');

-- Bahsetmeler: yorumun belgesini görebilen görür (yazma RPC/cascade ile).
create policy mentions_select on public.comment_mentions
  for select using (exists (
    select 1 from public.document_comments c
    where c.id = comment_id and public.user_doc_role(c.document_id) is not null
  ));

-- Bildirimler: yalnız ALICISI görür / okundu işaretler / siler.
create policy notif_select on public.notifications
  for select using (user_id = auth.uid());
create policy notif_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_delete on public.notifications
  for delete using (user_id = auth.uid());


-- =============================================================================
-- FONKSİYONLAR (SECURITY DEFINER — kontrollü ayrıcalık yükseltme)
-- =============================================================================

-- 1) Belgenin katılımcıları (sahip + aktif paylaşımlar). list_document_shares
--    SADECE sahibe açıktı (yönetim); bu ise erişimi olan HERKESE açık (yorumcu
--    da @bahsetmek için katılımcı listesine ihtiyaç duyar).
create or replace function public.list_document_collaborators(p_document_id uuid)
returns table (user_id uuid, email text, name text, role public.doc_role)
language plpgsql security definer set search_path = public as $$
begin
  if public.user_doc_role(p_document_id) is null then
    raise exception 'Bu belgeye erişiminiz yok' using errcode = '42501';
  end if;
  return query
    select d.owner_id, p.email, coalesce(p.display_name, p.email), 'owner'::public.doc_role
      from documents d join profiles p on p.id = d.owner_id
      where d.id = p_document_id
    union
    select s.user_id, p.email, coalesce(p.display_name, p.email), s.role
      from document_shares s join profiles p on p.id = s.user_id
      where s.document_id = p_document_id and s.status = 'active';
end;
$$;

grant execute on function public.list_document_collaborators(uuid) to authenticated;

-- 2) Yorum ekle (+ @bahsetmeler + bildirimler) — ATOMİK.
--    Neden RPC: başka kullanıcıların notifications satırını yazmak RLS'e takılır;
--    definer bunu güvenle yapar, içeride AÇIK kontrollerle:
--      • Çağıran en az 'commenter' yetkisine sahip mi?
--      • Bahsedilen kullanıcı gerçekten belgeye erişebiliyor mu? (rastgele kişi
--        bahsedilip bildirim sıkışturması engellenir)
create or replace function public.add_comment(
  p_document_id uuid,
  p_body        text,
  p_parent_id   uuid default null,
  p_anchor      jsonb default null,
  p_mentions    uuid[] default '{}'
)
returns public.document_comments
language plpgsql security definer set search_path = public as $$
declare
  v_comment public.document_comments;
  m_uid uuid;
begin
  if coalesce(public.doc_role_rank(public.user_doc_role(p_document_id)), 0) < 2 then
    raise exception 'Yorum yapmak için en az yorumcu yetkisi gerekir' using errcode = '42501';
  end if;
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'Boş yorum olamaz' using errcode = '22023';
  end if;
  if p_parent_id is not null and not exists (
    select 1 from document_comments c where c.id = p_parent_id and c.document_id = p_document_id
  ) then
    raise exception 'Geçersiz üst yorum' using errcode = '22023';
  end if;

  insert into document_comments (document_id, author_id, parent_id, body, anchor)
  values (p_document_id, auth.uid(), p_parent_id, trim(p_body), p_anchor)
  returning * into v_comment;

  if p_mentions is not null then
    foreach m_uid in array p_mentions loop
      -- yalnız kendisi olmayan + belgeye erişimi olan kullanıcı bahsedilebilir
      if m_uid <> auth.uid() and (
           exists (select 1 from documents d where d.id = p_document_id and d.owner_id = m_uid)
        or exists (select 1 from document_shares s
                   where s.document_id = p_document_id and s.user_id = m_uid and s.status = 'active')
      ) then
        insert into comment_mentions (comment_id, user_id) values (v_comment.id, m_uid)
          on conflict do nothing;
        insert into notifications (user_id, actor_id, type, document_id, comment_id)
          values (m_uid, auth.uid(), 'mention', p_document_id, v_comment.id);
      end if;
    end loop;
  end if;

  return v_comment;
end;
$$;

grant execute on function public.add_comment(uuid, text, uuid, jsonb, uuid[]) to authenticated;

-- 3) Bir belgenin yorumlarını yazar e-postası/adı + bahsedilenlerle listele.
--    Neden RPC: profiles RLS başkasının e-postasını/adını göstermez; definer
--    yetkili bağlamda (belgeye erişim) bunları açar (list_document_shares gibi).
create or replace function public.list_comments(p_document_id uuid)
returns table (
  id uuid, parent_id uuid, author_id uuid, author_email text, author_name text,
  body text, anchor jsonb, resolved boolean,
  created_at timestamptz, updated_at timestamptz, mentions text[]
)
language plpgsql security definer set search_path = public as $$
begin
  if public.user_doc_role(p_document_id) is null then
    raise exception 'Bu belgeye erişiminiz yok' using errcode = '42501';
  end if;
  return query
    select c.id, c.parent_id, c.author_id, p.email, coalesce(p.display_name, p.email),
           c.body, c.anchor, c.resolved, c.created_at, c.updated_at,
           coalesce((
             select array_agg(mp.email order by mp.email)
             from comment_mentions cm join profiles mp on mp.id = cm.user_id
             where cm.comment_id = c.id
           ), '{}'::text[])
    from document_comments c
    join profiles p on p.id = c.author_id
    where c.document_id = p_document_id
    order by c.created_at asc;
end;
$$;

grant execute on function public.list_comments(uuid) to authenticated;

-- =============================================================================

create or replace function public.list_notifications()
returns table (
  id uuid, type text, document_id uuid, document_name text,
  comment_id uuid, actor_email text, excerpt text, read boolean, created_at timestamptz
)
language sql security definer set search_path = public as $$
  select n.id, n.type, n.document_id, d.name, n.comment_id,
         ap.email, left(coalesce(c.body, ''), 80), n.read, n.created_at
  from notifications n
  left join documents d on d.id = n.document_id
  left join document_comments c on c.id = n.comment_id
  left join profiles ap on ap.id = n.actor_id
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit 50;
$$;

grant execute on function public.list_notifications() to authenticated;

create or replace function public.resolve_public_link(p_token text)
returns table (document_id uuid, name text, type public.document_type, role public.doc_role)
language plpgsql security definer set search_path = public as $$
declare
  v_link public.share_links;
begin
  select * into v_link from share_links where token = p_token;
  if v_link.id is null then
    raise exception 'Geçersiz bağlantı' using errcode = 'P0002';
  end if;
  if not v_link.is_public then
    raise exception 'Bu bağlantı herkese açık değil (giriş gerekli)' using errcode = '42501';
  end if;
  if v_link.expires_at is not null and v_link.expires_at < now() then
    raise exception 'Bağlantının süresi dolmuş' using errcode = '22023';
  end if;
  return query
    select d.id, d.name, d.type, v_link.role
    from documents d where d.id = v_link.document_id;
end;
$$;

-- anon = giriş yapmamış ziyaretçi rolü; authenticated = giriş yapmış.
grant execute on function public.resolve_public_link(text) to anon, authenticated;

-- 2) Storage: public link'i olan belgenin BYTE'ını herkes (anon dahil) indirebilir.
--    Çoklu permissive politika OR'lanır: mevcut (owner/paylaşılan) politikaya
--    EK olarak bu çalışır. Yazma/silme politikaları DEĞİŞMEZ (anon yazamaz).
create policy documents_bytes_public_select on storage.objects
  for select using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.share_links l
      where l.document_id = public.doc_id_from_object_name(name)
        and l.is_public and (l.expires_at is null or l.expires_at > now())
    )
  );

create or replace function public.doc_has_public_link(doc uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from share_links l
    where l.document_id = doc and l.is_public
      and (l.expires_at is null or l.expires_at > now())
  );
$$;

grant execute on function public.doc_has_public_link(uuid) to anon, authenticated;

drop policy if exists documents_bytes_public_select on storage.objects;
create policy documents_bytes_public_select on storage.objects
  for select using (
    bucket_id = 'documents'
    and public.doc_has_public_link(public.doc_id_from_object_name(name))
  );
