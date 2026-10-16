-- =============================================================================
-- Düzeltme: documents_select alt-sorgusunda sütun adı belirsizliği (ambiguity)
-- -----------------------------------------------------------------------------
-- Hata: `exists (select 1 from document_shares s where s.document_id = id ...)`
-- içindeki niteliksiz `id`, dış documents.id yerine İÇ tablonun (document_shares)
-- id sütununa bağlanıyordu (iç kapsam gölgeler) → s.document_id = s.id → hiç
-- eşleşmez → paylaşılan kullanıcı belgeyi göremiyordu.
-- Çözüm: dış sütunu niteleyerek yaz: documents.id.
-- Ders: korelasyonlu alt-sorguda dış sütunları DAİMA tablo adıyla nitele.
-- =============================================================================

drop policy if exists documents_select on public.documents;

create policy documents_select on public.documents
  for select using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.document_shares s
      where s.document_id = documents.id
        and s.user_id = auth.uid()
        and s.status = 'active'
    )
  );
