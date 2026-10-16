-- =============================================================================
-- Anonim (giriş gerektirmeyen) herkese açık paylaşım bağlantısı
-- -----------------------------------------------------------------------------
-- D3.2'de link redeem GİRİŞ gerektiriyordu (çağıranı document_shares'e ekler →
-- profiles'e bağlı user_id lazım). Bu adım "linki olan HERKES (giriş yapmadan)
-- GÖRÜNTÜLER" senaryosunu ekler: share_links.is_public = true olan bağlantılar.
--
-- Güvenlik modeli = "gizli URL": belge id'si tahmin edilemez bir UUID; erişim
-- yalnız is_public + süresi dolmamış bir link varken açılır. Anon kullanıcı
-- token'ı resolve_public_link ile çözer (document_id/ad/tür alır), byte'ı da
-- Storage'dan indirir (aşağıdaki anon politikası). Giriş yok, yalnız okuma.
--
-- Not: metadata'yı RLS yerine RPC ile veriyoruz ki anon kör kör "tüm public
-- belgeleri" listeleyemesin (token'sız numaralandırma engeli); token zorunlu.
-- =============================================================================

-- 1) Token'ı çöz: public + süresi geçerliyse belgeyi döndür (GİRİŞ GEREKMEZ).
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
