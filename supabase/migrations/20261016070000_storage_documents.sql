-- =============================================================================
-- UniTEAM — Belge içeriği (byte) deposu: Supabase Storage "relay" sağlayıcısı
-- -----------------------------------------------------------------------------
-- BYOS (Drive/OneDrive) henüz yok. Ara çözüm olarak belge BYTE'larını Supabase
-- Storage'da tutuyoruz; bu, şemadaki storage_provider='relay' seçeneğine karşılık
-- gelir. Gerçek BYOS gelince 'gdrive'/'onedrive' eklenir, bu 'relay' fallback kalır.
--
-- Nesne adı sözleşmesi:  "<document_id>.json"   (bucket: documents)
-- Böylece Storage erişimini, mevcut documents RLS'ine BAĞLAYABİLİRİZ: nesnenin
-- adından document_id'yi çıkarıp public.user_doc_role(...) ile yetkiyi sorarız.
-- (Tek doğruluk kaynağı: belgeye erişimi olan, byte'ına da erişir.)
-- =============================================================================

-- Özel (public olmayan) bucket oluştur.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Nesne adından document_id'yi güvenle çıkaran yardımcı: "<uuid>.json" → uuid.
-- Hatalı adlarda NULL döner (politika da reddeder).
create or replace function public.doc_id_from_object_name(obj_name text)
returns uuid
language sql immutable as $$
  select nullif(split_part(obj_name, '.', 1), '')::uuid;
$$;

-- RLS, storage.objects üzerinde zaten açıktır; sadece politikaları ekliyoruz.

-- GÖRÜNTÜLEME/İNDİRME: belgeyi görebilen (owner veya paylaşılan) byte'ı indirir.
create policy documents_bytes_select on storage.objects
  for select using (
    bucket_id = 'documents'
    and public.user_doc_role(public.doc_id_from_object_name(name)) is not null
  );

-- YÜKLEME (yeni byte): en az editor rolü gerekir.
-- NOT: Yeni belgede önce documents satırı oluşturulmalı (owner olunmalı), sonra
-- byte yüklenir — cloud.js bu sırayı izler.
create policy documents_bytes_insert on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and public.doc_role_rank(public.user_doc_role(public.doc_id_from_object_name(name))) >= 3
  );

-- GÜNCELLEME (byte üzerine yazma): en az editor.
create policy documents_bytes_update on storage.objects
  for update using (
    bucket_id = 'documents'
    and public.doc_role_rank(public.user_doc_role(public.doc_id_from_object_name(name))) >= 3
  );

-- SİLME: yalnızca belge sahibi.
create policy documents_bytes_delete on storage.objects
  for delete using (
    bucket_id = 'documents'
    and public.user_doc_role(public.doc_id_from_object_name(name)) = 'owner'
  );
