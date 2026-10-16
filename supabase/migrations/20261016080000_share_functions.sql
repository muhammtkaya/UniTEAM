-- =============================================================================
-- Paylaşım fonksiyonları (SECURITY DEFINER)
-- -----------------------------------------------------------------------------
-- Sorun: profiles RLS herkesin yalnız KENDİ profilini görmesine izin verir, bu
-- yüzden "e-posta ile paylaş" için karşı kullanıcının id'si doğrudan bulunamaz.
-- Çözüm: SECURITY DEFINER fonksiyon — fonksiyonun SAHİBİ (postgres) yetkisiyle
-- çalışır, RLS'i atlar; ama içeride AÇIK kontroller yaparız:
--   • Çağıran gerçekten belgenin SAHİBİ mi? (auth.uid() ile)
--   • Hedef e-posta kayıtlı mı?
-- Böylece ayrıcalık kontrollü ve güvenli şekilde yükseltilir.
-- (set search_path = public → fonksiyon ele geçirme/şema karışması önlenir.)
-- =============================================================================

-- 1) Belgeyi e-posta ile paylaş (yeni ise ekle, varsa rolü güncelle).
create or replace function public.share_document(
  p_document_id uuid, p_email text, p_role public.doc_role
)
returns public.document_shares
language plpgsql security definer set search_path = public as $$
declare
  v_target uuid;
  v_share  public.document_shares;
begin
  if not exists (select 1 from documents where id = p_document_id and owner_id = auth.uid()) then
    raise exception 'Yalnızca belge sahibi paylaşabilir' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'owner rolü paylaşımla verilemez' using errcode = '22023';
  end if;

  select id into v_target from profiles where lower(email) = lower(trim(p_email));
  if v_target is null then
    raise exception 'Bu e-posta ile kayıtlı kullanıcı yok: %', p_email using errcode = 'P0002';
  end if;
  if v_target = auth.uid() then
    raise exception 'Kendinizle paylaşamazsınız' using errcode = '22023';
  end if;

  insert into document_shares (document_id, user_id, role, status)
  values (p_document_id, v_target, p_role, 'active')
  on conflict (document_id, user_id)
    do update set role = excluded.role, status = 'active'
  returning * into v_share;
  return v_share;
end;
$$;

grant execute on function public.share_document(uuid, text, public.doc_role) to authenticated;

-- 2) Bir belgenin paylaşımlarını (e-posta + rol) listele — yalnız sahibi.
create or replace function public.list_document_shares(p_document_id uuid)
returns table (user_id uuid, email text, role public.doc_role, status public.share_status)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from documents where id = p_document_id and owner_id = auth.uid()) then
    raise exception 'Yalnızca belge sahibi paylaşımları görebilir' using errcode = '42501';
  end if;
  return query
    select s.user_id, p.email, s.role, s.status
    from document_shares s
    join profiles p on p.id = s.user_id
    where s.document_id = p_document_id
    order by p.email;
end;
$$;

grant execute on function public.list_document_shares(uuid) to authenticated;
