-- =============================================================================
-- UniTEAM — Faz 3: Faturalandırma modeli (plan / koltuk / kota) + ENFORCEMENT
-- -----------------------------------------------------------------------------
-- Amaç: Freemium/abonelik iş modelinin VERİ KATMANI ve iş kuralları. Bir özne
-- (kişisel hesap VEYA organizasyon) bir PLANA aboneliktir; plan koltuk (seat),
-- depolama ve belge sayısı KOTALARINI belirler; bu kotalar sunucuda ZORLANIR.
--
-- ⚠️ GERÇEK ÖDEME = Faz 9. Burada Stripe YOK; `change_plan()` ödeme sonrası
-- durumu SİMÜLE eder (stripe_* alanları ileride webhook ile dolacak). Yani kod
-- tarafı plan/koltuk/kota modeli + enforcement + UI bu migration'da; canlı
-- checkout/fatura/webhook Faz 9'da üstüne takılır (model değişmeden).
--
-- Öğrenme notu (DB dersi): Bu göç iki güzel deseni gösterir:
--   1) KATALOG tablosu (plans) — kurallar veride, kodda sabit değil (yeni plan =
--      yeni satır, deploy gerekmez).
--   2) ÇİFT-ÖZNELİ abonelik (org VEYA kullanıcı) — "tam olarak biri dolu" kuralı
--      CHECK + KISMİ (partial) UNIQUE indekslerle zorlanır.
--   3) ENFORCEMENT = TETİKLEYİCİ (trigger) + RPC içi kontrol: kota aşımı
--      uygulamadan DEĞİL veritabanından reddedilir (hangi istemci olursa olsun).
-- =============================================================================


-- =============================================================================
-- 0) ENUM TÜRLERİ
-- -----------------------------------------------------------------------------
-- plan_tier: plan basamağı (katalogdaki satırların doğal anahtarı).
-- subscription_status: aboneliğin yaşam döngüsü (canlıda Stripe webhook günceller).
-- =============================================================================

create type plan_tier           as enum ('free', 'pro', 'team', 'enterprise');
create type subscription_status as enum ('active', 'trialing', 'past_due', 'canceled');


-- =============================================================================
-- 1) plans — PLAN KATALOĞU (kurallar veride)
-- -----------------------------------------------------------------------------
-- ANAHTAR SEÇİMİ:
--   • tier: DOĞAL birincil anahtar (enum; sabit, az sayıda, anlamlı). Surrogate
--     id'ye gerek yok — basamak adının kendisi kararlı kimlik.
-- KOTA ALANLARI: -1 = SINIRSIZ (enterprise). price_cents null = "bize ulaşın".
--   • per_seat: fiyat koltuk başına mı (team) yoksa sabit mi (free/pro)?
--   • features jsonb: pazarlama/yetenek bayrakları (esnek; şema değişmeden büyür).
-- =============================================================================

create table public.plans (
  tier             plan_tier primary key,
  name             text not null,
  price_cents      integer,                 -- aylık; null = özel fiyat (enterprise)
  currency         text not null default 'usd',
  per_seat         boolean not null default false,
  max_seats        integer not null,        -- -1 = sınırsız
  storage_quota_mb integer not null,        -- -1 = sınırsız
  max_documents    integer not null,        -- -1 = sınırsız
  features         jsonb   not null default '{}'::jsonb,
  sort_order       integer not null default 0
);

-- Katalog tohumu (seed). Kotalar bilinçli olarak mütevazı; canlıda ayarlanır.
insert into public.plans (tier, name, price_cents, per_seat, max_seats, storage_quota_mb, max_documents, features, sort_order) values
  ('free',       'Free',         0,   false,  3,    100,    25, '{"realtime":true,"support":"community"}'::jsonb,            0),
  ('pro',        'Pro',          900, false,  5,   5120,   500, '{"realtime":true,"versions":true,"support":"email"}'::jsonb, 1),
  ('team',       'Team',        1200, true,  25, 102400,    -1, '{"realtime":true,"versions":true,"audit":true,"sso":true,"support":"priority"}'::jsonb, 2),
  ('enterprise', 'Enterprise', null,  true,  -1,     -1,    -1, '{"realtime":true,"versions":true,"audit":true,"sso":true,"scim":true,"support":"dedicated","dpa":true}'::jsonb, 3);


-- =============================================================================
-- 2) subscriptions — ABONELİK (çift özneli: org VEYA kullanıcı)
-- -----------------------------------------------------------------------------
-- Bir abonelik ya bir ORGANİZASYONA (takım faturalandırması — koltuklar burada
-- anlamlı) ya da bir KULLANICIYA (kişisel plan) aittir. "Tam olarak biri dolu"
-- kuralı:
--   • CHECK (org_id ve owner_id birbirini dışlar — XOR).
--   • KISMİ UNIQUE indeks: her org'un EN FAZLA bir, her kullanıcının EN FAZLA bir
--     aboneliği. (Tam tablo UNIQUE olsaydı NULL'lar çok kez tekrar edebilirdi;
--     partial index tam da "dolu olan sütun benzersiz" der.)
-- seats: SATIN ALINAN koltuk (team'de artırılabilir); null → plan.max_seats.
-- stripe_*: canlıda webhook doldurur (şimdilik null — ödeme Faz 9).
-- =============================================================================

create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid references public.organizations (id) on delete cascade,
  owner_id               uuid references public.profiles (id)      on delete cascade,
  tier                   plan_tier not null default 'free' references public.plans (tier),
  status                 subscription_status not null default 'active',
  seats                  integer,              -- null → plandan türetilir
  current_period_end     timestamptz,
  stripe_customer_id     text,
  stripe_subscription_id text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- XOR: tam olarak bir özne dolu olmalı.
  constraint subscriptions_one_subject check ((org_id is null) <> (owner_id is null))
);

-- Her özne için en fazla BİR abonelik (kısmi/partial unique).
create unique index uq_subscription_org   on public.subscriptions (org_id)   where org_id   is not null;
create unique index uq_subscription_owner on public.subscriptions (owner_id) where owner_id is not null;


-- =============================================================================
-- 3) Yardımcı fonksiyonlar (SECURITY DEFINER → enforcement RLS'e takılmaz)
-- -----------------------------------------------------------------------------
-- Enforcement'ın çağırdığı bu fonksiyonlar subscriptions/plans okur; definer
-- olduklarından RLS döngüsü/engeli olmaz (user_doc_role ile aynı desen).
-- =============================================================================

-- Bir öznenin EFEKTİF plan basamağı (abonelik yoksa 'free').
create or replace function public._effective_tier(p_org uuid, p_owner uuid)
returns plan_tier
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.tier from subscriptions s
       where (p_org is not null and s.org_id = p_org)
          or (p_org is null and s.owner_id = p_owner)
       limit 1),
    'free'::plan_tier);
$$;

-- Öznenin efektif KOLTUK limiti (-1 = sınırsız).
create or replace function public._seat_limit(p_org uuid, p_owner uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.seats from subscriptions s
       where (p_org is not null and s.org_id = p_org)
          or (p_org is null and s.owner_id = p_owner)
       limit 1),
    (select pl.max_seats from plans pl where pl.tier = public._effective_tier(p_org, p_owner)));
$$;

-- Öznenin efektif BELGE limiti (-1 = sınırsız).
create or replace function public._doc_limit(p_org uuid, p_owner uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select pl.max_documents from plans pl where pl.tier = public._effective_tier(p_org, p_owner);
$$;

-- Bir org'da aktif üye sayısı.
create or replace function public._active_member_count(p_org uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from organization_members
    where org_id = p_org and status = 'active';
$$;

-- KOLTUK KONTROLÜ: org'a BİR aktif üye daha eklenebilir mi? Eklenemezse hata fırlatır.
-- (invite_to_org / accept_org_invite buradan geçer → plan koltuğu dolmuşsa reddedilir.)
create or replace function public._assert_seat_available(p_org uuid)
returns void
language plpgsql stable security definer set search_path = public as $$
declare
  v_limit integer := public._seat_limit(p_org, null);
  v_used  integer := public._active_member_count(p_org);
begin
  if v_limit >= 0 and v_used >= v_limit then
    raise exception 'Koltuk kotası doldu (plan sınırı: % koltuk). Daha fazla üye için planı yükseltin.', v_limit
      using errcode = '53400';
  end if;
end;
$$;

grant execute on function public._effective_tier(uuid, uuid)   to authenticated;
grant execute on function public._seat_limit(uuid, uuid)       to authenticated;
grant execute on function public._doc_limit(uuid, uuid)        to authenticated;
grant execute on function public._active_member_count(uuid)    to authenticated;


-- =============================================================================
-- 4) BELGE KOTASI — TETİKLEYİCİ (trigger)
-- -----------------------------------------------------------------------------
-- Enforcement neden tetikleyici? Belge INSERT'i doğrudan tablodadır (RLS insert
-- policy ile; RPC değil). Kotayı istemciye bırakamayız → BEFORE INSERT trigger
-- her yolu (web/mobil/API) kapsar. org_id ekleme anında NULL (createMeta) →
-- KİŞİSEL kota uygulanır; belge org'a sonradan move_document_to_org ile taşınır
-- (org kotası orada kontrol edilir — bkz. §6).
-- =============================================================================

create or replace function public._enforce_document_quota()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_limit integer;
  v_used  integer;
begin
  if new.org_id is not null then
    v_limit := public._doc_limit(new.org_id, null);
    select count(*) into v_used from documents
      where org_id = new.org_id and trashed_at is null;
  else
    v_limit := public._doc_limit(null, new.owner_id);
    select count(*) into v_used from documents
      where owner_id = new.owner_id and org_id is null and trashed_at is null;
  end if;

  if v_limit >= 0 and v_used >= v_limit then
    raise exception 'Belge kotası doldu (plan sınırı: % belge). Yeni belge için planı yükseltin veya belge silin.', v_limit
      using errcode = '53400';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_document_quota
  before insert on public.documents
  for each row execute function public._enforce_document_quota();


-- =============================================================================
-- 5) create_organization GENİŞLETİLDİ: yeni org'a ücretsiz abonelik tohumla
-- -----------------------------------------------------------------------------
-- (20261018130000'deki sürümle aynı; SADECE subscriptions INSERT eklendi.)
-- =============================================================================

create or replace function public.create_organization(p_name text)
returns public.organizations
language plpgsql security definer set search_path = public as $$
declare
  v_org  public.organizations;
  v_slug text;
begin
  if auth.uid() is null then
    raise exception 'Giriş gerekli' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Organizasyon adı boş olamaz' using errcode = '22023';
  end if;
  v_slug := left(regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'), 32);
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then v_slug := 'org'; end if;
  v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into organizations (name, slug, created_by)
  values (trim(p_name), v_slug, auth.uid())
  returning * into v_org;

  insert into organization_members (org_id, user_id, org_role, status, invited_by)
  values (v_org.id, auth.uid(), 'admin', 'active', auth.uid());

  -- YENİ: her org varsayılan olarak Free planında başlar (abonelik satırı).
  insert into subscriptions (org_id, tier, status)
  values (v_org.id, 'free', 'active');

  perform public._audit(v_org.id, 'org.create', 'organization', v_org.id,
                        jsonb_build_object('name', v_org.name));
  return v_org;
end;
$$;


-- =============================================================================
-- 6) invite_to_org / accept_org_invite / move_document_to_org — KOLTUK & KOTA
--    ENFORCEMENT eklendi. (Gövdeler 20261018130000 ile aynı; yalnız kontrol
--    satırları eklendi — altı yorumla işaretli.)
-- =============================================================================

-- 6.1) Davet et — hesabı varsa AKTİF üye yapmadan ÖNCE koltuk kontrolü.
create or replace function public.invite_to_org(p_org uuid, p_email text, p_role public.org_role default 'member')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_uid   uuid;
  v_token text;
begin
  if not public.is_org_admin(p_org) then
    raise exception 'Yalnızca yöneticiler davet edebilir' using errcode = '42501';
  end if;
  if v_email = '' then
    raise exception 'E-posta boş olamaz' using errcode = '22023';
  end if;

  select id into v_uid from profiles where lower(email) = v_email limit 1;

  if v_uid is not null then
    if exists (select 1 from organization_members where org_id = p_org and user_id = v_uid) then
      raise exception 'Bu kişi zaten üye' using errcode = '23505';
    end if;
    perform public._assert_seat_available(p_org);   -- YENİ: koltuk kotası
    insert into organization_members (org_id, user_id, org_role, status, invited_by)
    values (p_org, v_uid, p_role, 'active', auth.uid());
    perform public._audit(p_org, 'member.add', 'member', v_uid,
                          jsonb_build_object('email', v_email, 'role', p_role));
    return jsonb_build_object('kind', 'member', 'email', v_email);
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into organization_invites (org_id, email, org_role, token, invited_by, status)
  values (p_org, v_email, p_role, v_token, auth.uid(), 'pending')
  on conflict (org_id, email) do update
    set org_role = excluded.org_role, token = excluded.token,
        invited_by = excluded.invited_by, status = 'pending', created_at = now()
  returning token into v_token;

  perform public._audit(p_org, 'invite.create', 'invite', null,
                        jsonb_build_object('email', v_email, 'role', p_role));
  return jsonb_build_object('kind', 'invite', 'email', v_email, 'token', v_token);
end;
$$;

-- 6.2) Daveti kabul et — üyeliğe dönüşmeden ÖNCE koltuk kontrolü.
create or replace function public.accept_org_invite(p_token text)
returns public.organizations
language plpgsql security definer set search_path = public as $$
declare
  v_inv  public.organization_invites;
  v_org  public.organizations;
  v_mail text;
begin
  if auth.uid() is null then
    raise exception 'Giriş gerekli' using errcode = '42501';
  end if;
  select * into v_inv from organization_invites where token = p_token;
  if v_inv.id is null or v_inv.status <> 'pending' then
    raise exception 'Geçersiz veya kullanılmış davet' using errcode = 'P0002';
  end if;
  if v_inv.expires_at is not null and v_inv.expires_at < now() then
    raise exception 'Davetin süresi dolmuş' using errcode = '22023';
  end if;
  select lower(email) into v_mail from profiles where id = auth.uid();
  if v_mail is distinct from lower(v_inv.email) then
    raise exception 'Bu davet başka bir e-postaya ait' using errcode = '42501';
  end if;

  -- YENİ: zaten üye değilse koltuk kotası (tekrar kabul koltuk tüketmez).
  if not exists (select 1 from organization_members where org_id = v_inv.org_id and user_id = auth.uid()) then
    perform public._assert_seat_available(v_inv.org_id);
  end if;

  insert into organization_members (org_id, user_id, org_role, status, invited_by)
  values (v_inv.org_id, auth.uid(), v_inv.org_role, 'active', v_inv.invited_by)
  on conflict (org_id, user_id) do nothing;

  update organization_invites set status = 'accepted' where id = v_inv.id;
  perform public._audit(v_inv.org_id, 'invite.accept', 'member', auth.uid(),
                        jsonb_build_object('email', v_mail));
  select * into v_org from organizations where id = v_inv.org_id;
  return v_org;
end;
$$;

-- 6.3) Belgeyi org'a taşırken ORG belge kotası kontrolü (+ eski gövde korundu).
create or replace function public.move_document_to_org(p_doc uuid, p_org uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_limit integer;
  v_used  integer;
begin
  if not exists (select 1 from documents d where d.id = p_doc and d.owner_id = auth.uid()) then
    raise exception 'Yalnızca belge sahibi taşıyabilir' using errcode = '42501';
  end if;
  if p_org is not null and public.user_org_role(p_org) is null then
    raise exception 'Bu organizasyonun üyesi değilsiniz' using errcode = '42501';
  end if;

  -- YENİ: org'a TAŞIRKEN (zaten o org'da değilse) org belge kotasını kontrol et.
  if p_org is not null and not exists (select 1 from documents where id = p_doc and org_id = p_org) then
    v_limit := public._doc_limit(p_org, null);
    select count(*) into v_used from documents where org_id = p_org and trashed_at is null;
    if v_limit >= 0 and v_used >= v_limit then
      raise exception 'Organizasyonun belge kotası doldu (plan sınırı: % belge).', v_limit
        using errcode = '53400';
    end if;
  end if;

  update documents set org_id = p_org where id = p_doc;
  perform public._audit(p_org, 'doc.move', 'document', p_doc,
                        jsonb_build_object('org', p_org));
end;
$$;


-- =============================================================================
-- 7) RLS — plans (herkese açık katalog, okuma) + subscriptions (özneye görünür)
-- =============================================================================

alter table public.plans         enable row level security;
alter table public.subscriptions enable row level security;

-- plans: giriş yapan herkes KATALOĞU okuyabilir (fiyat/kota şeffaf). Yazma yok.
create policy plans_read on public.plans
  for select to authenticated using (true);

-- subscriptions: org aboneliğini o org'un ÜYELERİ görür; kişisel aboneliği SAHİBİ.
-- (Yazma yalnız change_plan() RPC'siyle → INSERT/UPDATE/DELETE policy YOK.)
create policy subscriptions_select on public.subscriptions
  for select using (
    (owner_id = auth.uid())
    or (org_id is not null and public.user_org_role(org_id) is not null)
  );


-- =============================================================================
-- 8) RPC'ler — katalog / durum+kullanım / plan değiştir (SİMÜLE — ödeme Faz 9)
-- =============================================================================

-- 8.1) Plan kataloğu (pazarlama/karşılaştırma için).
create or replace function public.list_plans()
returns setof public.plans
language sql stable security definer set search_path = public as $$
  select * from plans order by sort_order;
$$;

-- 8.2) Bir öznenin aboneliği + plan limitleri + GÜNCEL KULLANIM (tek JSON).
--      p_org null → KİŞİSEL (owner = auth.uid()). Dolu → org (üye olmalı).
--      Abonelik satırı yoksa 'free' türetilir (yazma yapmaz — salt okunur).
create or replace function public.get_subscription(p_org uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tier    plan_tier;
  v_plan    public.plans;
  v_sub     public.subscriptions;
  v_seatlim integer;
  v_members integer := 0;
  v_docs    integer;
  v_bytes   bigint;
begin
  if auth.uid() is null then
    raise exception 'Giriş gerekli' using errcode = '42501';
  end if;
  if p_org is not null and public.user_org_role(p_org) is null then
    raise exception 'Bu organizasyona erişiminiz yok' using errcode = '42501';
  end if;

  select * into v_sub from subscriptions
    where (p_org is not null and org_id = p_org)
       or (p_org is null and owner_id = auth.uid())
    limit 1;

  v_tier := coalesce(v_sub.tier, 'free'::plan_tier);
  select * into v_plan from plans where tier = v_tier;
  v_seatlim := coalesce(v_sub.seats, v_plan.max_seats);

  -- Kullanım: belge sayısı + (org ise) aktif üye + depolama byte'ları.
  if p_org is not null then
    v_members := public._active_member_count(p_org);
    select count(*) into v_docs from documents where org_id = p_org and trashed_at is null;
    select coalesce(sum((o.metadata->>'size')::bigint), 0) into v_bytes
      from storage.objects o
      join documents d on d.id = public.doc_id_from_object_name(o.name)
      where o.bucket_id = 'documents' and d.org_id = p_org;
  else
    select count(*) into v_docs from documents
      where owner_id = auth.uid() and org_id is null and trashed_at is null;
    select coalesce(sum((o.metadata->>'size')::bigint), 0) into v_bytes
      from storage.objects o
      join documents d on d.id = public.doc_id_from_object_name(o.name)
      where o.bucket_id = 'documents' and d.owner_id = auth.uid() and d.org_id is null;
  end if;

  return jsonb_build_object(
    'subject',        case when p_org is not null then 'org' else 'personal' end,
    'org_id',         p_org,
    'tier',           v_tier,
    'plan_name',      v_plan.name,
    'status',         coalesce(v_sub.status, 'active'),
    'current_period_end', v_sub.current_period_end,
    'limits', jsonb_build_object(
      'seats',            v_seatlim,
      'storage_quota_mb', v_plan.storage_quota_mb,
      'max_documents',    v_plan.max_documents),
    'usage', jsonb_build_object(
      'members',       v_members,
      'documents',     v_docs,
      'storage_bytes', v_bytes),
    'features',       v_plan.features
  );
end;
$$;

-- 8.3) Plan değiştir — SİMÜLASYON (gerçek ödeme = Faz 9 / Stripe checkout+webhook).
--      Kişisel: owner = auth.uid(). Org: yalnız org admini. Abonelik yoksa oluşturur
--      (upsert). seats = planın varsayılanına ayarlanır. Downgrade'de mevcut kullanım
--      yeni kotayı aşıyorsa reddedilir (veri bütünlüğü).
create or replace function public.change_plan(p_tier public.plan_tier, p_org uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_plan  public.plans;
  v_used_docs integer;
  v_used_mem  integer;
begin
  if auth.uid() is null then
    raise exception 'Giriş gerekli' using errcode = '42501';
  end if;
  if p_org is not null and not public.is_org_admin(p_org) then
    raise exception 'Planı yalnızca org yöneticisi değiştirebilir' using errcode = '42501';
  end if;
  select * into v_plan from plans where tier = p_tier;
  if v_plan.tier is null then
    raise exception 'Geçersiz plan' using errcode = '22023';
  end if;

  -- Downgrade bütünlüğü: mevcut kullanım yeni kotayı aşmasın.
  if p_org is not null then
    select count(*) into v_used_docs from documents where org_id = p_org and trashed_at is null;
    v_used_mem := public._active_member_count(p_org);
    if v_plan.max_seats >= 0 and v_used_mem > v_plan.max_seats then
      raise exception 'Bu plan % koltuk sunar ama % aktif üyeniz var — önce üye çıkarın.', v_plan.max_seats, v_used_mem
        using errcode = '53400';
    end if;
  else
    select count(*) into v_used_docs from documents where owner_id = auth.uid() and org_id is null and trashed_at is null;
  end if;
  if v_plan.max_documents >= 0 and v_used_docs > v_plan.max_documents then
    raise exception 'Bu plan % belge sunar ama % belgeniz var — önce belge silin.', v_plan.max_documents, v_used_docs
      using errcode = '53400';
  end if;

  -- Upsert (özneye göre kısmi unique indeks çakışmayı çözer).
  if p_org is not null then
    insert into subscriptions (org_id, tier, status, seats, current_period_end, updated_at)
    values (p_org, p_tier, 'active', nullif(v_plan.max_seats, -1), now() + interval '30 days', now())
    on conflict (org_id) where org_id is not null
      do update set tier = excluded.tier, status = 'active',
                    seats = excluded.seats, current_period_end = excluded.current_period_end,
                    updated_at = now();
    perform public._audit(p_org, 'billing.change_plan', 'subscription', p_org,
                          jsonb_build_object('tier', p_tier));
  else
    insert into subscriptions (owner_id, tier, status, seats, current_period_end, updated_at)
    values (auth.uid(), p_tier, 'active', nullif(v_plan.max_seats, -1), now() + interval '30 days', now())
    on conflict (owner_id) where owner_id is not null
      do update set tier = excluded.tier, status = 'active',
                    seats = excluded.seats, current_period_end = excluded.current_period_end,
                    updated_at = now();
  end if;

  return public.get_subscription(p_org);
end;
$$;

grant execute on function public.list_plans()                                  to authenticated;
grant execute on function public.get_subscription(uuid)                        to authenticated;
grant execute on function public.change_plan(public.plan_tier, uuid)           to authenticated;


-- =============================================================================
-- v1 KAPSAM NOTU:
--   • Belge sayısı + koltuk kotaları SUNUCUDA sert zorlanır (trigger + RPC).
--   • Depolama byte'ı RAPORLANIR (get_subscription); yükleme anında sert
--     reddi gerçek Storage kancası ister → Faz 9 (canlı).
--   • change_plan() ÖDEME ALMAZ — ödeme sonrası aboneliği SİMÜLE eder. Canlı
--     Stripe checkout + webkancası (stripe_customer_id/subscription_id dolumu,
--     past_due/canceled durum geçişleri) Faz 9'da üstüne eklenir.
-- =============================================================================
