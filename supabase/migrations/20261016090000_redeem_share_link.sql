-- =============================================================================
-- Link ile paylaşım: bağlantıyı "bozdurma" (redeem)
-- -----------------------------------------------------------------------------
-- Akış: sahip share_links'te token'lı bir satır oluşturur. Biri linki açınca bu
-- fonksiyon çağrılır: token geçerli + süresi dolmamışsa, çağıran kullanıcıyı
-- belgeye link'teki rolle EKLER (document_shares). Sonra normal RLS iş görür.
--
-- Neden SECURITY DEFINER: çağıran kişi share_links satırını (links_owner RLS)
-- göremez ve kendini document_shares'e ekleyemez (shares_write yalnız owner).
-- Bu fonksiyon, token doğrulamasını yaparak bu iki işlemi kontrollü yapar.
-- MVP: giriş gerekli (document_shares.user_id → profiles). Anonim public erişim
-- (is_public, token'lı anon RLS) sonraki aşama.
-- =============================================================================

create or replace function public.redeem_share_link(p_token text)
returns uuid   -- erişim verilen document_id
language plpgsql security definer set search_path = public as $$
declare
  v_link public.share_links;
  v_uid  uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Bağlantıyı açmak için giriş yapın' using errcode = '42501';
  end if;

  select * into v_link from share_links where token = p_token;
  if v_link.id is null then
    raise exception 'Geçersiz bağlantı' using errcode = 'P0002';
  end if;
  if v_link.expires_at is not null and v_link.expires_at < now() then
    raise exception 'Bağlantının süresi dolmuş' using errcode = '22023';
  end if;

  -- Sahip zaten erişebilir; paylaşım eklemeye gerek yok.
  if exists (select 1 from documents where id = v_link.document_id and owner_id = v_uid) then
    return v_link.document_id;
  end if;

  -- Çağıranı belgeye ekle. Zaten paylaşımı varsa mevcut rolü KORU (düşürme).
  insert into document_shares (document_id, user_id, role, status)
  values (v_link.document_id, v_uid, v_link.role, 'active')
  on conflict (document_id, user_id) do nothing;

  return v_link.document_id;
end;
$$;

grant execute on function public.redeem_share_link(text) to authenticated;
