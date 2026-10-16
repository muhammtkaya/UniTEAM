-- =============================================================================
-- YORUMLAR & @BAHSETMELER & BİLDİRİMLER (işbirliği — Bölüm 3)
-- -----------------------------------------------------------------------------
-- Üç yeni varlık + ilişkileri. DB tasarım notları (ders amaçlı) her tablonun
-- üstünde. Byte'lar yine BYOS/relay'de; burada yalnız işbirliği meta verisi.
-- =============================================================================

-- =============================================================================
-- 8) document_comments — bir belgeye yapılan yorumlar (başlıklı iş parçacığı)
-- -----------------------------------------------------------------------------
-- İLİŞKİLER:
--   • document_id → documents : bir belge 1—N yorum alır.
--   • author_id   → profiles  : yorumu yazan.
--   • parent_id   → document_comments : AYNI tabloya FK (ÖZ-İLİŞKİ / self-ref).
--     Üst yorum = null ise kök yorum; dolu ise bir yoruma verilen YANIT. Böylece
--     tek tabloda iş parçacığı (thread) kurulur — folders ağacıyla aynı fikir.
-- ÖZNİTELİKLER:
--   • body: yorum metni.  • anchor: jsonb ( opsiyonel) — ileride hücre/blok/slayt
--     bağlama (şimdilik belge geneli; null). jsonb seçildi çünkü bağlama şekli
--     uygulamaya göre değişir (Excel {sheet,r,c} vs Word {bid}) — esnek şema.
--   • resolved: çözüldü mü (gösterimde gri/gizli).
-- =============================================================================

create table public.document_comments (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  parent_id   uuid references public.document_comments (id) on delete cascade,
  body        text not null,
  anchor      jsonb,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_comments_document on public.document_comments (document_id);
create index idx_comments_parent   on public.document_comments (parent_id);

-- updated_at'i her güncellemede tazele (mevcut touch_updated_at() fonksiyonunu kullan).
create trigger trg_comments_touch
  before update on public.document_comments
  for each row execute function public.touch_updated_at();


-- =============================================================================
-- 9) comment_mentions — bir yorumda @bahsedilen kullanıcılar (N:M bağlantı)
-- -----------------------------------------------------------------------------
-- document_shares gibi ASSOCIATIVE (junction) tablo: comments ile profiles
-- arasındaki ÇOKTAN-ÇOĞA ilişkiyi çözer (bir yorum birçok kişiyi bahsedebilir;
-- bir kişi birçok yorumda bahsedilebilir).
-- ANAHTAR: (comment_id, user_id) BİLEŞİK DOĞAL PK — aynı kişi bir yorumda en
-- fazla bir kez bahsedilir; ayrı surrogate id'ye gerek yok (ilişkinin kendine
-- ait başka özniteliği yok).
-- =============================================================================

create table public.comment_mentions (
  comment_id uuid not null references public.document_comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  primary key (comment_id, user_id)
);

create index idx_mentions_user on public.comment_mentions (user_id);


-- =============================================================================
-- 10) notifications — kullanıcıya bildirimler (1—N: profile ← notifications)
-- -----------------------------------------------------------------------------
-- user_id = ALICI (bildirimi görecek). actor_id = olayı yapan (bahseden).
-- type: 'mention' (ileride 'comment_reply', 'share' eklenebilir — bu yüzden
--   enum değil text; az sayıda ama büyümeye açık, esnek bıraktık).
-- read: okundu mu. comment_id silinirse bildirim de gider (cascade).
-- =============================================================================

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  type        text not null,
  document_id uuid references public.documents (id) on delete cascade,
  comment_id  uuid references public.document_comments (id) on delete cascade,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index idx_notif_user on public.notifications (user_id, read);


-- =============================================================================
-- RLS — satır seviyesi güvenlik
-- -----------------------------------------------------------------------------
-- Yorum OLUŞTURMA yalnız add_comment() RPC'si ile yapılır (bahsetme+bildirimi
-- atomik kurmak için) → bilinçli olarak INSERT policy YOK; doğrudan insert
-- reddedilir. Okuma/güncelleme/silme doğrudan policy'lerle.
-- =============================================================================

alter table public.document_comments enable row level security;
alter table public.comment_mentions  enable row level security;
alter table public.notifications      enable row level security;

-- Yorumlar: belgeyi görebilen tüm katılımcılar görür.
create policy comments_select on public.document_comments
  for select using (public.user_doc_role(document_id) is not null);
-- Düzenleme/çözme ve silme: yorumun yazarı VEYA belge sahibi (moderasyon).
create policy comments_update on public.document_comments
  for update using (author_id = auth.uid() or public.user_doc_role(document_id) = 'owner')
          with check (author_id = auth.uid() or public.user_doc_role(document_id) = 'owner');
create policy comments_delete on public.document_comments
  for delete using (author_id = auth.uid() or public.user_doc_role(document_id) = 'owner');

-- Bahsetmeler: yorumun belgesini görebilen görür (yazma RPC/cascade ile).
create policy mentions_select on public.comment_mentions
  for select using (exists (
    select 1 from public.document_comments c
    where c.id = comment_id and public.user_doc_role(c.document_id) is not null
  ));

-- Bildirimler: yalnız ALICISI görür / okundu işaretler / siler.
create policy notif_select on public.notifications
  for select using (user_id = auth.uid());
create policy notif_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_delete on public.notifications
  for delete using (user_id = auth.uid());


-- =============================================================================
-- FONKSİYONLAR (SECURITY DEFINER — kontrollü ayrıcalık yükseltme)
-- =============================================================================

-- 1) Belgenin katılımcıları (sahip + aktif paylaşımlar). list_document_shares
--    SADECE sahibe açıktı (yönetim); bu ise erişimi olan HERKESE açık (yorumcu
--    da @bahsetmek için katılımcı listesine ihtiyaç duyar).
create or replace function public.list_document_collaborators(p_document_id uuid)
returns table (user_id uuid, email text, name text, role public.doc_role)
language plpgsql security definer set search_path = public as $$
begin
  if public.user_doc_role(p_document_id) is null then
    raise exception 'Bu belgeye erişiminiz yok' using errcode = '42501';
  end if;
  return query
    select d.owner_id, p.email, coalesce(p.display_name, p.email), 'owner'::public.doc_role
      from documents d join profiles p on p.id = d.owner_id
      where d.id = p_document_id
    union
    select s.user_id, p.email, coalesce(p.display_name, p.email), s.role
      from document_shares s join profiles p on p.id = s.user_id
      where s.document_id = p_document_id and s.status = 'active';
end;
$$;

grant execute on function public.list_document_collaborators(uuid) to authenticated;

-- 2) Yorum ekle (+ @bahsetmeler + bildirimler) — ATOMİK.
--    Neden RPC: başka kullanıcıların notifications satırını yazmak RLS'e takılır;
--    definer bunu güvenle yapar, içeride AÇIK kontrollerle:
--      • Çağıran en az 'commenter' yetkisine sahip mi?
--      • Bahsedilen kullanıcı gerçekten belgeye erişebiliyor mu? (rastgele kişi
--        bahsedilip bildirim sıkışturması engellenir)
create or replace function public.add_comment(
  p_document_id uuid,
  p_body        text,
  p_parent_id   uuid default null,
  p_anchor      jsonb default null,
  p_mentions    uuid[] default '{}'
)
returns public.document_comments
language plpgsql security definer set search_path = public as $$
declare
  v_comment public.document_comments;
  m_uid uuid;
begin
  if coalesce(public.doc_role_rank(public.user_doc_role(p_document_id)), 0) < 2 then
    raise exception 'Yorum yapmak için en az yorumcu yetkisi gerekir' using errcode = '42501';
  end if;
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'Boş yorum olamaz' using errcode = '22023';
  end if;
  if p_parent_id is not null and not exists (
    select 1 from document_comments c where c.id = p_parent_id and c.document_id = p_document_id
  ) then
    raise exception 'Geçersiz üst yorum' using errcode = '22023';
  end if;

  insert into document_comments (document_id, author_id, parent_id, body, anchor)
  values (p_document_id, auth.uid(), p_parent_id, trim(p_body), p_anchor)
  returning * into v_comment;

  if p_mentions is not null then
    foreach m_uid in array p_mentions loop
      -- yalnız kendisi olmayan + belgeye erişimi olan kullanıcı bahsedilebilir
      if m_uid <> auth.uid() and (
           exists (select 1 from documents d where d.id = p_document_id and d.owner_id = m_uid)
        or exists (select 1 from document_shares s
                   where s.document_id = p_document_id and s.user_id = m_uid and s.status = 'active')
      ) then
        insert into comment_mentions (comment_id, user_id) values (v_comment.id, m_uid)
          on conflict do nothing;
        insert into notifications (user_id, actor_id, type, document_id, comment_id)
          values (m_uid, auth.uid(), 'mention', p_document_id, v_comment.id);
      end if;
    end loop;
  end if;

  return v_comment;
end;
$$;

grant execute on function public.add_comment(uuid, text, uuid, jsonb, uuid[]) to authenticated;

-- 3) Bir belgenin yorumlarını yazar e-postası/adı + bahsedilenlerle listele.
--    Neden RPC: profiles RLS başkasının e-postasını/adını göstermez; definer
--    yetkili bağlamda (belgeye erişim) bunları açar (list_document_shares gibi).
create or replace function public.list_comments(p_document_id uuid)
returns table (
  id uuid, parent_id uuid, author_id uuid, author_email text, author_name text,
  body text, anchor jsonb, resolved boolean,
  created_at timestamptz, updated_at timestamptz, mentions text[]
)
language plpgsql security definer set search_path = public as $$
begin
  if public.user_doc_role(p_document_id) is null then
    raise exception 'Bu belgeye erişiminiz yok' using errcode = '42501';
  end if;
  return query
    select c.id, c.parent_id, c.author_id, p.email, coalesce(p.display_name, p.email),
           c.body, c.anchor, c.resolved, c.created_at, c.updated_at,
           coalesce((
             select array_agg(mp.email order by mp.email)
             from comment_mentions cm join profiles mp on mp.id = cm.user_id
             where cm.comment_id = c.id
           ), '{}'::text[])
    from document_comments c
    join profiles p on p.id = c.author_id
    where c.document_id = p_document_id
    order by c.created_at asc;
end;
$$;

grant execute on function public.list_comments(uuid) to authenticated;
