-- =============================================================================
-- UniTEAM — Faz 2: Hesap güvenliği (giriş geçmişi + şüpheli giriş uyarısı)
-- -----------------------------------------------------------------------------
-- 2FA/MFA'nın kendisi Supabase Auth'ta YERLEŞİKTİR (auth.mfa.* — TOTP); şema
-- gerektirmez (config.toml'da etkinleştirildi). Bu göç, Supabase'in sağlamadığı
-- iki parçayı ekler:
--   1) login_events — kullanıcının GİRİŞ GEÇMİŞİ (cihaz/oturum görünürlüğü).
--   2) Yeni cihazdan giriş → ŞÜPHELİ GİRİŞ bildirimi (mevcut notifications tablosu).
--
-- Öğrenme notu (DB dersi): Burada "olay tablosu" (event table) deseni var —
-- her satır değişmez bir OLAYDIR (login), güncellenmez; zaman serisi gibi okunur.
-- Ayrıca mevcut notifications tablosunu jsonb bir "data" sütunuyla GENİŞLETİYORUZ:
-- yorum-dışı bildirim türleri (güvenlik) için esnek yük taşır — şema değişmeden
-- yeni bildirim türleri eklenebilir (açık/kapalı prensibi).
-- =============================================================================

-- notifications: yorum-dışı bildirimler için esnek yük (ör. {"device":"Chrome · Windows"}).
alter table public.notifications add column if not exists data jsonb;

-- login_events: her satır bir giriş OLAYI (değişmez). device_label = kabaca
-- tarayıcı+OS ("Chrome · Windows"); user_agent = tam UA (teşhis için). ip null
-- bırakıldı (istemciden güvenilir alınamaz; Faz 9'da edge/Worker doldurabilir).
create table public.login_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  device_label  text,
  user_agent    text,
  ip            text,
  is_new_device boolean not null default false,
  created_at    timestamptz not null default now()
);

create index idx_login_events_user on public.login_events (user_id, created_at desc);

alter table public.login_events enable row level security;

-- Kullanıcı yalnız KENDİ giriş geçmişini görür. (Yazma yalnız RPC ile → INSERT
--  policy YOK; record_login_event definer ekler.)
create policy login_events_self_select on public.login_events
  for select using (user_id = auth.uid());


-- =============================================================================
-- RPC: record_login_event — girişte çağrılır; yeni cihazı tespit eder, kaydeder,
-- gerekirse ŞÜPHELİ GİRİŞ bildirimi atar. Dönüş: {is_new_device, is_first}.
-- -----------------------------------------------------------------------------
-- İş kuralı: Kullanıcının İLK girişinde (geçmiş boş) uyarı ATILMAZ (her ilk giriş
-- "yeni cihaz"dır; gürültü olmasın). Sonraki girişlerde daha önce görülmemiş bir
-- device_label gelirse → is_new_device=true + notifications'a 'security_new_device'.
-- =============================================================================
create or replace function public.record_login_event(p_device_label text, p_user_agent text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_count int;
  v_seen  boolean;
  v_new   boolean;
begin
  if v_uid is null then
    raise exception 'Giriş gerekli' using errcode = '42501';
  end if;

  select count(*) into v_count from login_events where user_id = v_uid;
  v_seen := exists (
    select 1 from login_events
    where user_id = v_uid and device_label is not distinct from p_device_label
  );
  v_new := (not v_seen);

  insert into login_events (user_id, device_label, user_agent, is_new_device)
  values (v_uid, p_device_label, left(coalesce(p_user_agent, ''), 400), v_new);

  -- İlk giriş değilse VE yeni cihazsa → şüpheli giriş bildirimi (kendine).
  if v_new and v_count > 0 then
    insert into notifications (user_id, actor_id, type, data)
    values (v_uid, null, 'security_new_device',
            jsonb_build_object('device', coalesce(p_device_label, 'bilinmeyen cihaz')));
  end if;

  return jsonb_build_object('is_new_device', v_new, 'is_first', v_count = 0);
end;
$$;

grant execute on function public.record_login_event(text, text) to authenticated;


-- =============================================================================
-- list_notifications GÜNCELLENDİ: jsonb "data" sütununu da döndürür (güvenlik
-- bildirimlerinin cihaz bilgisi için). İmza değiştiği için önce DROP gerekir.
-- =============================================================================
drop function if exists public.list_notifications();
create or replace function public.list_notifications()
returns table (
  id uuid, type text, document_id uuid, document_name text,
  comment_id uuid, actor_email text, excerpt text, data jsonb,
  read boolean, created_at timestamptz
)
language sql security definer set search_path = public as $$
  select n.id, n.type, n.document_id, d.name, n.comment_id,
         ap.email, left(coalesce(c.body, ''), 80), n.data, n.read, n.created_at
  from notifications n
  left join documents d on d.id = n.document_id
  left join document_comments c on c.id = n.comment_id
  left join profiles ap on ap.id = n.actor_id
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit 50;
$$;

grant execute on function public.list_notifications() to authenticated;
