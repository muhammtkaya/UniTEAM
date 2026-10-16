-- =============================================================================
-- Düzeltme: public-link storage politikası SECURITY DEFINER fonksiyon kullansın
-- -----------------------------------------------------------------------------
-- İlk politika share_links'i doğrudan alt-sorguyla okuyordu; ama anon rolünün
-- share_links üzerinde ne tablo yetkisi ne de RLS izni var (links_owner) → alt
-- sorgu hep false → anon byte'ı indiremiyordu ("Object not found").
-- Mevcut politikalar (user_doc_role) bu yüzden DEFINER fonksiyon kullanır: RLS'i
-- atlayıp sahibi yetkisiyle kontrol eder. Aynı deseni uyguluyoruz.
-- =============================================================================

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
