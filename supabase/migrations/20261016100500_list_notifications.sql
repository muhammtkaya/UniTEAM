-- =============================================================================
-- list_notifications() — kullanıcının bildirimleri (bahseden + belge adı ile)
-- -----------------------------------------------------------------------------
-- Neden RPC: bildirim panelinde "kim bahsetti" (actor e-postası) gösterilmek
-- istenir; ama profiles RLS başkasının e-postasını vermez. Definer, YALNIZ
-- çağıranın KENDİ bildirimlerini (user_id = auth.uid()) döndürürken bahseden
-- e-postasını + belge adını + yorum özetini güvenle birleştirir.
-- =============================================================================

create or replace function public.list_notifications()
returns table (
  id uuid, type text, document_id uuid, document_name text,
  comment_id uuid, actor_email text, excerpt text, read boolean, created_at timestamptz
)
language sql security definer set search_path = public as $$
  select n.id, n.type, n.document_id, d.name, n.comment_id,
         ap.email, left(coalesce(c.body, ''), 80), n.read, n.created_at
  from notifications n
  left join documents d on d.id = n.document_id
  left join document_comments c on c.id = n.comment_id
  left join profiles ap on ap.id = n.actor_id
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit 50;
$$;

grant execute on function public.list_notifications() to authenticated;
