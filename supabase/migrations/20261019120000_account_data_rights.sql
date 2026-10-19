-- =====================================================================
--  KVKK / GDPR / CCPA veri hakları — sunucu tarafı (Faz 8 / A4)
--
--  İKİ SECURITY DEFINER RPC (yazma/okuma yalnız bunlarla; RLS'i kontrollü aşar):
--    • export_my_account_data()  — çağıranın TÜM hesap verisini tek JSON döndürür
--      (erişim + taşınabilirlik hakkı). Salt-okunur.
--    • request_account_deletion() — çağıranın hesabını ve verisini KALICI siler
--      (silme/unutulma hakkı). Son-yönetici koruması vardır.
--
--  ⚠️ CANLI doğrulama Faz 9 ile (yerel yığın kapalıyken giriş yapılmıyor). Migration
--     doğrulanmış desenleri (SECURITY DEFINER + auth.uid() + açık yetki) izler.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Veri dışa aktarımı: çağıranın kendi verisini toplayıp JSON döndürür.
--    Yalnız KENDİ verisi (auth.uid()); başka kullanıcının verisine erişemez.
-- ---------------------------------------------------------------------
create or replace function public.export_my_account_data()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'user_id',      auth.uid(),
    'profile',      (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    -- Sahip olunan belgeler (yalnız meta veri — belge byte'ları burada değil)
    'documents',    coalesce((select jsonb_agg(to_jsonb(d))
                                from public.documents d where d.owner_id = auth.uid()), '[]'::jsonb),
    -- Bana paylaşılan belgeler (alıcı olarak)
    'shared_with_me', coalesce((select jsonb_agg(to_jsonb(s))
                                  from public.document_shares s where s.user_id = auth.uid()), '[]'::jsonb),
    -- Organizasyon üyelikleri
    'org_memberships', coalesce((select jsonb_agg(to_jsonb(m))
                                   from public.organization_members m where m.user_id = auth.uid()), '[]'::jsonb),
    -- Son giriş kayıtları (güvenlik şeffaflığı)
    'login_events',  coalesce((select jsonb_agg(to_jsonb(e))
                                 from public.login_events e where e.user_id = auth.uid()), '[]'::jsonb),
    -- Bildirimler
    'notifications', coalesce((select jsonb_agg(to_jsonb(n))
                                 from public.notifications n where n.user_id = auth.uid()), '[]'::jsonb)
  );
$$;

grant execute on function public.export_my_account_data() to authenticated;

-- ---------------------------------------------------------------------
-- 2) Hesap silme: çağıranın hesabını ve ilişkili verisini kalıcı siler.
--
--    Son-yönetici koruması: çağıran bir organizasyonun TEK aktif yöneticisiyse
--    ve o organizasyonda BAŞKA aktif üye varsa, silme engellenir (önce sahiplik/
--    yöneticilik devredilmelidir — aksi halde org sahipsiz kalır).
--
--    Silme sırası: önce FK'lerin takılabileceği satırları temizle, sonra
--    auth.users satırını sil (profiles → documents/folders zincirleme CASCADE
--    ile gider). Not: canlıda çoğu FK zaten on delete cascade; bu açık temizlik
--    güvenlik marjıdır (set null/restrict ihtimaline karşı).
-- ---------------------------------------------------------------------
create or replace function public.request_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  blocking_org uuid;
begin
  if uid is null then
    raise exception 'Kimlik doğrulanmadı';
  end if;

  -- Son-yönetici engeli: çağıran bir org'un tek aktif admini + org'da başka aktif üye var.
  select m.org_id into blocking_org
  from public.organization_members m
  where m.user_id = uid and m.org_role = 'admin' and m.status = 'active'
    and (select count(*) from public.organization_members a
           where a.org_id = m.org_id and a.org_role = 'admin' and a.status = 'active') = 1
    and (select count(*) from public.organization_members o
           where o.org_id = m.org_id and o.user_id <> uid and o.status = 'active') > 0
  limit 1;

  if blocking_org is not null then
    raise exception 'Önce organizasyon yöneticiliğini/belgelerini devredin (son yönetici silinemez).';
  end if;

  -- İlişkili veriyi temizle (açık; CASCADE varsa da zararsız).
  delete from public.document_shares    where user_id = uid;
  delete from public.organization_members where user_id = uid;
  delete from public.login_events        where user_id = uid;
  delete from public.notifications       where user_id = uid or actor_id = uid;
  delete from public.documents           where owner_id = uid;   -- shares/versions CASCADE
  delete from public.folders             where owner_id = uid;
  delete from public.profiles            where id = uid;

  -- Kimlik kaydını sil (oturumu de facto sonlandırır). SECURITY DEFINER sahibi
  -- (postgres) auth.users üzerinde yetkilidir. Canlıda alternatif: admin API.
  delete from auth.users where id = uid;
end;
$$;

grant execute on function public.request_account_deletion() to authenticated;
