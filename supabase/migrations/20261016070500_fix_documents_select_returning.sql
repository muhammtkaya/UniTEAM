-- =============================================================================
-- Düzeltme: documents_select politikası INSERT ... RETURNING ile çalışmıyordu.
-- -----------------------------------------------------------------------------
-- Sorun: eski politika `user_doc_role(id) is not null` kullanıyordu; bu fonksiyon
-- documents tablosunu KENDİ İÇİNDE sorgular. INSERT ... RETURNING sırasında yeni
-- satır, aynı komuttaki bu alt-sorguya henüz görünmez (PostgreSQL komut görünürlük
-- kuralı) → rol NULL → satır SELECT politikasından geçemez → "RLS ihlali".
--
-- Çözüm: sahip kontrolünü, satırın KENDİ owner_id sütunuyla doğrudan yap (self-query
-- yok; owner_id yeni satırda anında mevcut). Paylaşım kontrolü FARKLI tablodan
-- (document_shares) geldiği için sorun çıkarmaz. Anlam aynı: sahip veya aktif
-- paylaşım görebilir.
-- =============================================================================

drop policy if exists documents_select on public.documents;

create policy documents_select on public.documents
  for select using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.document_shares s
      where s.document_id = id
        and s.user_id = auth.uid()
        and s.status = 'active'
    )
  );
