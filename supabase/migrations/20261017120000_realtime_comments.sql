-- =============================================================================
-- CANLI YORUM / BİLDİRİM YENİLEMESİ — Supabase Realtime (Postgres Changes)
-- -----------------------------------------------------------------------------
-- Amaç: yorum paneli ve bildirim zili, karşı taraf yazınca ANLIK yenilensin
-- (şimdiye kadar yalnız açılışta + 45 sn poll vardı).
--
-- Nasıl çalışır: Supabase Realtime, bir tabloya abone olan istemciye satır
-- INSERT/UPDATE/DELETE olunca WebSocket ile ileti yollar. "supabase_realtime"
-- adlı publication'da (yayın listesi) bulunan tablolar yayınlanır.
--
-- GÜVENLİK: Postgres Changes aboneliğinde RLS AYNEN geçerlidir — abone, yalnız
-- SELECT policy'siyle GÖREBİLDİĞİ satırların değişikliğini alır. Yani:
--   • document_comments → yalnız belgeye erişimi olanlar (user_doc_role) alır.
--   • notifications      → yalnız alıcısı (user_id = auth.uid()) alır.
-- Bu yüzden ayrıca bir filtre güvenlik için şart değil; istemci yine de
-- document_id / user_id filtresi verir (gereksiz trafik almamak için).
--
-- REPLICA IDENTITY FULL: DELETE/UPDATE iletilerinde RLS'in ve istemci
-- filtresinin değerlendirebilmesi için ESKİ satırın tüm sütunları gerekir
-- (varsayılan yalnız PK'yi gönderir; o zaman document_id ile filtreleme
-- silmelerde çalışmaz). Bu yüzden tam replica identity açıyoruz.
-- =============================================================================

alter table public.document_comments replica identity full;
alter table public.notifications      replica identity full;

alter publication supabase_realtime add table public.document_comments;
alter publication supabase_realtime add table public.notifications;
