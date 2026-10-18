-- =============================================================================
-- UniTEAM — Faz 1: Çok-kiracılık (multi-tenancy) & yetki (RBAC)
-- -----------------------------------------------------------------------------
-- Amaç: Tek tek kullanıcıların ötesine geçip ORGANİZASYON (kiracı / tenant)
-- kavramını eklemek. Bir organizasyon = bir şirket/ekip; üyeleri ve rolleri olur,
-- belgeler bir organizasyona bağlanabilir ve organizasyon yöneticileri (admin)
-- yönetişim (governance) yetkisine sahip olur: üye davet/askıya al, belge
-- sahipliğini devret (ayrılan çalışandan erişim devri), denetim (audit) gör.
--
-- Öğrenme notu (DB dersi): Bu göç (migration) çok-kiracılık için klasik desenleri
-- gösterir: TENANT tablosu, üyeliği çözen N:M BAĞLANTI tablosu (öznitelikli:
-- rol+durum), e-posta ile DAVET (henüz hesabı olmayan kişi için), append-only
-- DENETİM KAYDI ve tüm bunları satır seviyesinde koruyan RLS politikaları.
-- =============================================================================


-- =============================================================================
-- 0) ENUM TÜRLERİ
-- -----------------------------------------------------------------------------
-- org_role: organizasyon İÇİ rol. (Belge içi rol = doc_role, ayrıdır.)
--   admin  → üye yönetir, belge devreder, denetim görür.
--   member → sıradan üye (belgelere normal paylaşımla erişir).
-- member_status: üyeliğin durumu. suspended = askıya alınmış (erişim dondurulur,
--   kayıt silinmez → geri alınabilir + denetim izi korunur).
-- invite_status: e-posta davetinin durumu.
-- =============================================================================

create type org_role      as enum ('admin', 'member');
create type member_status as enum ('active', 'suspended');
create type invite_status as enum ('pending', 'accepted', 'revoked');


-- =============================================================================
-- 1) organizations — KİRACI (tenant) tablosu
-- -----------------------------------------------------------------------------
-- ANAHTAR SEÇİMİ:
--   • id: surrogate UUID PK (dağıtık üretim + tahmin edilemezlik — diğer tablolarla
--     aynı gerekçe).
--   • slug: unique DOĞAL ANAHTAR — insan-okur, URL dostu kimlik ("acme-5f3a").
--     Benzersiz olmalı; create_organization() üretir (ad → kebab + kısa rastgele ek).
--   • created_by: provenance (kim kurdu). FK → profiles; "on delete set null" →
--     kurucu hesabını silse bile ORGANİZASYON (ve üyeleri) yaşar. Sahiplik
--     created_by ile DEĞİL, admin ÜYELİĞİ ile tanımlanır (daha dayanıklı).
-- =============================================================================

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);


-- =============================================================================
-- 2) organization_members — ÜYELİK (N:M bağlantı tablosu, öznitelikli)
-- -----------------------------------------------------------------------------
-- organizations ↔ profiles arasındaki ÇOKTAN-ÇOĞA ilişkiyi çözer:
--   • Bir organizasyonun birçok üyesi olur.  • Bir kullanıcı birçok organizasyona
--   üye olabilir.  İlişkinin KENDİ öznitelikleri var (org_role, status) →
--   "öznitelikli bağlantı tablosu" (document_shares / comment_mentions ile aynı fikir).
-- ANAHTAR SEÇİMİ:
--   • BİLEŞİK DOĞAL PK (org_id, user_id): bir kullanıcının bir organizasyonda EN
--     FAZLA BİR üyeliği olur → çift kayıt imkânsız. Ayrı surrogate id'ye gerek yok.
--   • invited_by: kim davet etti (provenance); kullanıcı silinince set null.
--   • İki FK de cascade: organizasyon ya da kullanıcı silinince üyelik kaydı gider.
-- =============================================================================

create table public.organization_members (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  org_role   org_role not null default 'member',
  status     member_status not null default 'active',
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index idx_org_members_user on public.organization_members (user_id);


-- =============================================================================
-- 3) organization_invites — e-posta ile DAVET (henüz hesabı olmayana da)
-- -----------------------------------------------------------------------------
-- Neden ayrı tablo? organization_members yalnız GERÇEK profile'lara (hesabı olan)
-- FK tutar. Oysa ekibe daha hesabı olmayan birini davet edebilmeliyiz. Davet bu
-- "bekleyen" durumu temsil eder; kişi kaydolup token'ı kabul edince üyeliğe dönüşür.
-- ANAHTAR SEÇİMİ:
--   • id: surrogate UUID PK.
--   • token: unique doğal anahtar — davet bağlantısı token ile çözülür (tahmin
--     edilemez). • unique(org_id, email): aynı kişiye aynı org için çift bekleyen
--     davet olmasın (upsert ile tazelenir).
-- =============================================================================

create table public.organization_invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  email      text not null,
  org_role   org_role not null default 'member',
  token      text not null unique,
  status     invite_status not null default 'pending',
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (org_id, email)
);

create index idx_org_invites_email on public.organization_invites (lower(email));


-- =============================================================================
-- 4) audit_log — DENETİM KAYDI (append-only / yalnız-ekleme)
-- -----------------------------------------------------------------------------
-- "Kim, ne zaman, neyi yaptı?" sorusunun kalıcı cevabı (uyumluluk + güvenlik).
-- Yalnızca EKLENİR (güncelleme/silme politikası YOK → kayıtlar değiştirilemez;
-- organizasyon silinince cascade ile gider). metadata jsonb: olaya özel esnek
-- ayrıntı (ör. {"email": "...", "old_role": "member"}). actor silinince set null
-- (olayın "kim" bilgisi kaybolur ama kayıt durur — tarihçe bozulmaz).
-- =============================================================================

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references public.organizations (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  target_type text,
  target_id   uuid,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

create index idx_audit_org on public.audit_log (org_id, created_at desc);


-- =============================================================================
-- 5) documents.org_id — belgeyi bir organizasyona bağla
-- -----------------------------------------------------------------------------
-- NULL ise belge "kişisel" (eski davranış, aynen korunur). Dolu ise belge
-- organizasyona aittir → org adminleri yönetişim erişimi kazanır (aşağıda
-- user_doc_role genişletildi). "on delete set null": organizasyon silinse bile
-- belge YOK OLMAZ, yeniden kişiselleşir (güvenilirlik / veri kaybı yok ilkesi).
-- =============================================================================

alter table public.documents
  add column org_id uuid references public.organizations (id) on delete set null;

create index idx_documents_org on public.documents (org_id);


-- =============================================================================
-- 6) RBAC yardımcı fonksiyonları (SECURITY DEFINER → RLS döngüsünü keser)
-- -----------------------------------------------------------------------------
-- organization_members RLS'i user_org_role'ü çağırır; bu fonksiyon da
-- organization_members'ı sorgular. DEFINER olduğu için RLS'i atlar → sonsuz
-- döngü olmaz (user_doc_role ile aynı desen).
-- =============================================================================

-- Kullanıcının bir organizasyondaki EFEKTİF rolü (yalnız aktif üyelik).
create or replace function public.user_org_role(p_org uuid)
returns org_role
language sql stable security definer set search_path = public as $$
  select m.org_role from organization_members m
  where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'
  limit 1;
$$;

-- Kullanıcı bu organizasyonun AKTİF ADMİN'i mi?
create or replace function public.is_org_admin(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members m
    where m.org_id = p_org and m.user_id = auth.uid()
      and m.org_role = 'admin' and m.status = 'active'
  );
$$;

grant execute on function public.user_org_role(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid)  to authenticated;


-- -----------------------------------------------------------------------------
-- user_doc_role GENİŞLETİLDİ: org admini, organizasyona bağlı belgede 'owner'
-- yetkisi kazanır (yönetişim — ayrılan çalışanın belgesine erişim/devir).
-- Sıra: gerçek sahip → org admini → paylaşım rolü.
-- -----------------------------------------------------------------------------
create or replace function public.user_doc_role(doc uuid)
returns doc_role
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from documents d where d.id = doc and d.owner_id = auth.uid())
      then 'owner'::doc_role
    when exists (
      select 1 from documents d
      join organization_members m on m.org_id = d.org_id
      where d.id = doc and m.user_id = auth.uid()
        and m.org_role = 'admin' and m.status = 'active'
    ) then 'owner'::doc_role
    else (select s.role from document_shares s
          where s.document_id = doc and s.user_id = auth.uid() and s.status = 'active'
          limit 1)
  end;
$$;


-- -----------------------------------------------------------------------------
-- documents_select RLS GÜNCELLENDİ: org adminine görünürlük eklendi.
-- (Bu politika user_doc_role'ü ÇAĞIRMAZ — INSERT..RETURNING döngüsünü önlemek
--  için koşulları satır-içi tutar; org kontrolü farklı tablodan geldiği için güvenli.)
-- -----------------------------------------------------------------------------
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
  for select using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.document_shares s
      where s.document_id = documents.id and s.user_id = auth.uid() and s.status = 'active'
    )
    or exists (
      select 1 from public.organization_members m
      where m.org_id = documents.org_id and m.user_id = auth.uid()
        and m.org_role = 'admin' and m.status = 'active'
    )
  );


-- =============================================================================
-- 7) RLS — yeni tablolar
-- =============================================================================

alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invites enable row level security;
alter table public.audit_log            enable row level security;

-- organizations: üyesi görebilir; adminleri yeniden adlandırabilir/silebilir.
-- (Oluşturma yalnız create_organization() RPC'si ile → INSERT policy YOK.)
create policy orgs_member_select on public.organizations
  for select using (
    exists (select 1 from public.organization_members m
            where m.org_id = organizations.id and m.user_id = auth.uid())
  );
create policy orgs_admin_update on public.organizations
  for update using (public.is_org_admin(id)) with check (public.is_org_admin(id));
create policy orgs_admin_delete on public.organizations
  for delete using (public.is_org_admin(id));

-- organization_members: aynı org üyeleri birbirini görür.
-- (Yazma yalnız RPC'lerle → son-admin koruması + audit atomik olsun; INSERT/
--  UPDATE/DELETE policy'si YOK.)
create policy members_select on public.organization_members
  for select using (public.user_org_role(org_id) is not null);

-- organization_invites: yalnız org adminleri görür/yönetir (kabul RPC ile).
create policy invites_admin_select on public.organization_invites
  for select using (public.is_org_admin(org_id));

-- audit_log: yalnız org adminleri okur. (Yazma yalnız definer fonksiyonlarla.)
create policy audit_admin_select on public.audit_log
  for select using (public.is_org_admin(org_id));


-- =============================================================================
-- 8) İç yardımcı: denetim kaydı ekle (append-only)
-- =============================================================================
create or replace function public._audit(
  p_org uuid, p_action text, p_target_type text, p_target_id uuid, p_meta jsonb
) returns void
language sql security definer set search_path = public as $$
  insert into audit_log (org_id, actor_id, action, target_type, target_id, metadata)
  values (p_org, auth.uid(), p_action, p_target_type, p_target_id, p_meta);
$$;


-- =============================================================================
-- 9) RPC'ler — SECURITY DEFINER + AÇIK yetki kontrolleri
-- -----------------------------------------------------------------------------
-- Neden RPC? Üye yönetimi başka kullanıcıların satırlarını yazar (RLS'e takılır),
-- çok adımlı + atomik olmalı (üyelik + davet + audit), ve "son admini çıkarma"
-- gibi iş kurallarını tek yerde zorlar. Definer kontrollü ayrıcalık yükseltmesidir;
-- her fonksiyon İLK İŞ olarak çağıranın yetkisini doğrular.
-- =============================================================================

-- 9.1) Organizasyon oluştur (+ kurucuyu admin üye yap) — ATOMİK.
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
  -- slug: ad → küçük harf, alfanümerik dışını '-' yap, kısa rastgele ek (benzersizlik).
  v_slug := left(regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'), 32);
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then v_slug := 'org'; end if;
  v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into organizations (name, slug, created_by)
  values (trim(p_name), v_slug, auth.uid())
  returning * into v_org;

  insert into organization_members (org_id, user_id, org_role, status, invited_by)
  values (v_org.id, auth.uid(), 'admin', 'active', auth.uid());

  perform public._audit(v_org.id, 'org.create', 'organization', v_org.id,
                        jsonb_build_object('name', v_org.name));
  return v_org;
end;
$$;

-- 9.2) Üye olduğum organizasyonlar (rol + durum + aktif üye sayısı).
create or replace function public.list_my_organizations()
returns table (
  id uuid, name text, slug text, org_role public.org_role,
  status public.member_status, member_count bigint, created_at timestamptz
)
language sql security definer set search_path = public as $$
  select o.id, o.name, o.slug, m.org_role, m.status,
         (select count(*) from organization_members mm
            where mm.org_id = o.id and mm.status = 'active'),
         o.created_at
  from organizations o
  join organization_members m on m.org_id = o.id
  where m.user_id = auth.uid()
  order by o.created_at;
$$;

-- 9.3) Bir organizasyonun üyeleri (e-posta + ad + rol + durum). Her üye görebilir.
create or replace function public.list_org_members(p_org uuid)
returns table (
  user_id uuid, email text, name text, org_role public.org_role,
  status public.member_status, created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if public.user_org_role(p_org) is null then
    raise exception 'Bu organizasyona erişiminiz yok' using errcode = '42501';
  end if;
  return query
    select m.user_id, p.email, coalesce(p.display_name, p.email),
           m.org_role, m.status, m.created_at
    from organization_members m
    join profiles p on p.id = m.user_id
    where m.org_id = p_org
    order by (m.org_role = 'admin') desc, p.email;
end;
$$;

-- 9.4) Bekleyen davetler (yalnız admin).
create or replace function public.list_org_invites(p_org uuid)
returns table (id uuid, email text, org_role public.org_role, token text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_admin(p_org) then
    raise exception 'Yalnızca yöneticiler görebilir' using errcode = '42501';
  end if;
  return query
    select i.id, i.email, i.org_role, i.token, i.created_at
    from organization_invites i
    where i.org_id = p_org and i.status = 'pending'
    order by i.created_at desc;
end;
$$;

-- 9.5) Davet et: hesabı varsa doğrudan üye yap; yoksa bekleyen davet oluştur.
--      Dönüş: {kind:'member'|'invite', email, token?}
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
    insert into organization_members (org_id, user_id, org_role, status, invited_by)
    values (p_org, v_uid, p_role, 'active', auth.uid());
    perform public._audit(p_org, 'member.add', 'member', v_uid,
                          jsonb_build_object('email', v_email, 'role', p_role));
    return jsonb_build_object('kind', 'member', 'email', v_email);
  end if;

  -- Hesabı yok → bekleyen davet (varsa rol/token tazele).
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

-- 9.6) Daveti kabul et (token ile) — çağıranın e-postası davetle eşleşmeli.
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

-- 9.7) Üye rolünü değiştir (son admini üyeye düşürme koruması).
create or replace function public.set_member_role(p_org uuid, p_user uuid, p_role public.org_role)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_admin(p_org) then
    raise exception 'Yalnızca yöneticiler rol değiştirebilir' using errcode = '42501';
  end if;
  if p_role = 'member'
     and exists (select 1 from organization_members
                 where org_id = p_org and user_id = p_user and org_role = 'admin')
     and (select count(*) from organization_members
          where org_id = p_org and org_role = 'admin' and status = 'active') <= 1 then
    raise exception 'Son yöneticiyi üyeye düşüremezsiniz' using errcode = '23514';
  end if;
  update organization_members set org_role = p_role
    where org_id = p_org and user_id = p_user;
  perform public._audit(p_org, 'member.role', 'member', p_user,
                        jsonb_build_object('role', p_role));
end;
$$;

-- 9.8) Üyeyi askıya al / yeniden etkinleştir (son aktif admin koruması).
create or replace function public.set_member_status(p_org uuid, p_user uuid, p_status public.member_status)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_admin(p_org) then
    raise exception 'Yalnızca yöneticiler yapabilir' using errcode = '42501';
  end if;
  if p_status = 'suspended'
     and exists (select 1 from organization_members
                 where org_id = p_org and user_id = p_user and org_role = 'admin')
     and (select count(*) from organization_members
          where org_id = p_org and org_role = 'admin' and status = 'active') <= 1 then
    raise exception 'Son aktif yöneticiyi askıya alamazsınız' using errcode = '23514';
  end if;
  update organization_members set status = p_status
    where org_id = p_org and user_id = p_user;
  perform public._audit(p_org, 'member.status', 'member', p_user,
                        jsonb_build_object('status', p_status));
end;
$$;

-- 9.9) Üyeyi çıkar + BELGE ERİŞİM DEVRİ (ayrılan çalışanın org belgeleri admine geçer).
--      Admin başkasını çıkarır; herkes kendi üyeliğinden ayrılabilir (self-leave).
create or replace function public.remove_member(p_org uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_is_admin boolean := public.is_org_admin(p_org);
  v_heir     uuid;
begin
  if not v_is_admin and p_user <> auth.uid() then
    raise exception 'Yalnızca yöneticiler üye çıkarabilir' using errcode = '42501';
  end if;
  -- Son admin ayrılamaz/çıkarılamaz (organizasyon sahipsiz kalmasın).
  if exists (select 1 from organization_members
             where org_id = p_org and user_id = p_user and org_role = 'admin')
     and (select count(*) from organization_members
          where org_id = p_org and org_role = 'admin' and status = 'active') <= 1 then
    raise exception 'Son yöneticiyi çıkaramazsınız — önce başka yönetici atayın' using errcode = '23514';
  end if;

  -- ERİŞİM DEVRİ: çıkarılan kişinin bu org'a ait belgeleri bir admine devredilir.
  -- Vâris (heir): işlemi yapan admin (kendisi de org adminiyse), değilse kalan bir admin.
  select user_id into v_heir from organization_members
    where org_id = p_org and org_role = 'admin' and status = 'active' and user_id <> p_user
    order by (user_id = auth.uid()) desc
    limit 1;
  if v_heir is not null then
    update documents set owner_id = v_heir
      where org_id = p_org and owner_id = p_user;
  end if;

  delete from organization_members where org_id = p_org and user_id = p_user;
  perform public._audit(p_org, 'member.remove', 'member', p_user,
                        jsonb_build_object('heir', v_heir));
end;
$$;

-- 9.10) Belge sahipliğini devret (mevcut sahip VEYA org admini; yeni sahip org üyesi olmalı).
create or replace function public.transfer_document_ownership(p_doc uuid, p_new_owner uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  select org_id into v_org from documents where id = p_doc;
  if not (
    exists (select 1 from documents d where d.id = p_doc and d.owner_id = auth.uid())
    or (v_org is not null and public.is_org_admin(v_org))
  ) then
    raise exception 'Yalnızca belge sahibi veya org yöneticisi devredebilir' using errcode = '42501';
  end if;
  if v_org is not null and not exists (
    select 1 from organization_members where org_id = v_org and user_id = p_new_owner and status = 'active'
  ) then
    raise exception 'Yeni sahip bu organizasyonun aktif üyesi olmalı' using errcode = '23514';
  end if;
  update documents set owner_id = p_new_owner where id = p_doc;
  perform public._audit(v_org, 'doc.transfer', 'document', p_doc,
                        jsonb_build_object('new_owner', p_new_owner));
end;
$$;

-- 9.11) Belgeyi bir organizasyona taşı / organizasyondan çıkar (yalnız belge sahibi).
--       p_org null → kişiselleştir. Dolu → sahibi o org'un üyesi olmalı.
create or replace function public.move_document_to_org(p_doc uuid, p_org uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from documents d where d.id = p_doc and d.owner_id = auth.uid()) then
    raise exception 'Yalnızca belge sahibi taşıyabilir' using errcode = '42501';
  end if;
  if p_org is not null and public.user_org_role(p_org) is null then
    raise exception 'Bu organizasyonun üyesi değilsiniz' using errcode = '42501';
  end if;
  update documents set org_id = p_org where id = p_doc;
  perform public._audit(p_org, 'doc.move', 'document', p_doc,
                        jsonb_build_object('org', p_org));
end;
$$;

-- 9.12) Organizasyonun belgeleri (admin yönetişim görünümü — kota/sahiplik).
create or replace function public.list_org_documents(p_org uuid)
returns table (
  id uuid, name text, type public.document_type, owner_id uuid,
  owner_email text, updated_at timestamptz, trashed boolean
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_admin(p_org) then
    raise exception 'Yalnızca yöneticiler görebilir' using errcode = '42501';
  end if;
  return query
    select d.id, d.name, d.type, d.owner_id, p.email, d.updated_at, (d.trashed_at is not null)
    from documents d
    join profiles p on p.id = d.owner_id
    where d.org_id = p_org
    order by d.updated_at desc;
end;
$$;

-- 9.13) Denetim kaydı (admin; aktör e-postasıyla, son 100).
create or replace function public.list_audit_log(p_org uuid)
returns table (
  id uuid, actor_email text, action text, target_type text,
  target_id uuid, metadata jsonb, created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_admin(p_org) then
    raise exception 'Yalnızca yöneticiler görebilir' using errcode = '42501';
  end if;
  return query
    select a.id, ap.email, a.action, a.target_type, a.target_id, a.metadata, a.created_at
    from audit_log a
    left join profiles ap on ap.id = a.actor_id
    where a.org_id = p_org
    order by a.created_at desc
    limit 100;
end;
$$;

grant execute on function public.create_organization(text)                      to authenticated;
grant execute on function public.list_my_organizations()                        to authenticated;
grant execute on function public.list_org_members(uuid)                         to authenticated;
grant execute on function public.list_org_invites(uuid)                         to authenticated;
grant execute on function public.invite_to_org(uuid, text, public.org_role)     to authenticated;
grant execute on function public.accept_org_invite(text)                        to authenticated;
grant execute on function public.set_member_role(uuid, uuid, public.org_role)   to authenticated;
grant execute on function public.set_member_status(uuid, uuid, public.member_status) to authenticated;
grant execute on function public.remove_member(uuid, uuid)                      to authenticated;
grant execute on function public.transfer_document_ownership(uuid, uuid)        to authenticated;
grant execute on function public.move_document_to_org(uuid, uuid)               to authenticated;
grant execute on function public.list_org_documents(uuid)                       to authenticated;
grant execute on function public.list_audit_log(uuid)                           to authenticated;

-- =============================================================================
-- v1 KAPSAM NOTU: Org üyeliği TEK BAŞINA belge erişimi vermez — adminler
-- yönetişim (görünürlük + devir) için erişir; sıradan üyeler belgelere normal
-- paylaşımla erişir. "Tüm üyeler tüm org belgelerini görür" (takım sürücüsü)
-- ileride bir org ayarı olarak eklenebilir.
-- =============================================================================
