-- PullScope MVP schema
create extension if not exists pgcrypto;

-- ============================================================
-- Tables
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique,
  plan text not null default 'free' check (plan in ('free','pro')),
  created_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  event_name text,
  left_puller text not null,
  right_puller text not null,
  source_type text not null check (source_type in ('youtube','upload')),
  youtube_id text,
  video_path text,
  duration_sec double precision,
  fps double precision,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now()
);
create index on public.matches (user_id, created_at desc);

create table public.rubric_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Great Technique Framework',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.rubric_attributes (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.rubric_templates(id) on delete cascade,
  name text not null,
  description text,
  display_order int not null,
  is_active boolean not null default true
);
create index on public.rubric_attributes (template_id, display_order);

create table public.user_rubrics (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  template_id uuid not null references public.rubric_templates(id)
);

create table public.annotations (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  attribute_id uuid not null references public.rubric_attributes(id),
  puller_side text not null check (puller_side in ('left','right')),
  round_number int not null default 1, -- 0 = "Overall"
  timestamp_sec double precision not null,
  rating text not null check (rating in ('green','red','black')),
  note text,
  frame_path text,
  created_at timestamptz not null default now()
);
create index on public.annotations (match_id, timestamp_sec);

create table public.round_boundaries (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  round_number int not null,
  start_sec double precision not null,
  end_sec double precision,
  unique (match_id, round_number)
);

create table public.report_cards (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.matches(id) on delete cascade,
  slug text unique not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Ownership helpers (security definer so policies don't recurse through RLS)
-- ============================================================
create or replace function public.owns_match(p_match uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.matches where id = p_match and user_id = auth.uid());
$$;

create or replace function public.owns_template(p_template uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_rubrics where template_id = p_template and user_id = auth.uid());
$$;

create or replace function public.owns_attribute(p_attr uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.rubric_attributes a
    join public.user_rubrics ur on ur.template_id = a.template_id
    where a.id = p_attr and ur.user_id = auth.uid()
  );
$$;

create or replace function public.match_has_card(p_match text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.report_cards where match_id::text = p_match);
$$;

-- ============================================================
-- Row-level security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.rubric_templates enable row level security;
alter table public.rubric_attributes enable row level security;
alter table public.user_rubrics enable row level security;
alter table public.annotations enable row level security;
alter table public.round_boundaries enable row level security;
alter table public.report_cards enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- Users may change their handle but never their plan.
revoke update on public.profiles from authenticated, anon;
grant update (handle) on public.profiles to authenticated;

create policy "matches: own" on public.matches
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "templates: read default or own" on public.rubric_templates
  for select to authenticated using (is_default or public.owns_template(id));
create policy "templates: update own" on public.rubric_templates
  for update to authenticated using (public.owns_template(id)) with check (public.owns_template(id) and not is_default);

create policy "attributes: read default or own" on public.rubric_attributes
  for select to authenticated using (
    public.owns_template(template_id)
    or exists (select 1 from public.rubric_templates t where t.id = template_id and t.is_default)
  );
create policy "attributes: insert own" on public.rubric_attributes
  for insert to authenticated with check (public.owns_template(template_id));
create policy "attributes: update own" on public.rubric_attributes
  for update to authenticated using (public.owns_template(template_id)) with check (public.owns_template(template_id));
create policy "attributes: delete own" on public.rubric_attributes
  for delete to authenticated using (public.owns_template(template_id));

create policy "user_rubrics: read own" on public.user_rubrics
  for select to authenticated using (user_id = auth.uid());

create policy "annotations: own" on public.annotations
  for all to authenticated
  using (public.owns_match(match_id))
  with check (public.owns_match(match_id) and public.owns_attribute(attribute_id));

create policy "rounds: own" on public.round_boundaries
  for all to authenticated using (public.owns_match(match_id)) with check (public.owns_match(match_id));

create policy "cards: own" on public.report_cards
  for all to authenticated using (public.owns_match(match_id)) with check (public.owns_match(match_id));

-- Public card access is slug-scoped through this function rather than a broad
-- anon SELECT policy, so slugs cannot be enumerated.
create or replace function public.get_public_card(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'slug', rc.slug,
    'created_at', rc.created_at,
    'plan', p.plan,
    'owner_handle', p.handle,
    'match', to_jsonb(m) - 'user_id',
    'attributes', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.display_order)
      from public.rubric_attributes a
      join public.user_rubrics ur on ur.template_id = a.template_id
      where ur.user_id = m.user_id
    ), '[]'::jsonb),
    'annotations', coalesce((
      select jsonb_agg(to_jsonb(an) order by an.timestamp_sec)
      from public.annotations an where an.match_id = m.id
    ), '[]'::jsonb),
    'rounds', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.round_number)
      from public.round_boundaries r where r.match_id = m.id
    ), '[]'::jsonb)
  )
  from public.report_cards rc
  join public.matches m on m.id = rc.match_id
  join public.profiles p on p.id = m.user_id
  where rc.slug = p_slug;
$$;
revoke all on function public.get_public_card(text) from public;
grant execute on function public.get_public_card(text) to anon, authenticated;

-- ============================================================
-- Free-tier limit: max 3 active matches (enforced in the database so the
-- REST API cannot bypass it)
-- ============================================================
create or replace function public.enforce_match_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_count int;
begin
  if new.status <> 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;
  select plan into v_plan from public.profiles where id = new.user_id;
  if coalesce(v_plan, 'free') = 'free' then
    select count(*) into v_count from public.matches
      where user_id = new.user_id and status = 'active' and id <> new.id;
    if v_count >= 3 then
      raise exception 'free_tier_limit' using hint = 'Free plan allows 3 active matches';
    end if;
  end if;
  return new;
end;
$$;

create trigger matches_enforce_limit
  before insert or update of status on public.matches
  for each row execute function public.enforce_match_limit();

-- ============================================================
-- Default rubric: "Great Technique Framework"
-- ============================================================
insert into public.rubric_templates (id, name, is_default)
values ('00000000-0000-0000-0000-000000000001', 'Great Technique Framework', true);

insert into public.rubric_attributes (template_id, name, description, display_order) values
  ('00000000-0000-0000-0000-000000000001', 'Fingers', 'Grip depth & finger control at setup and during pull', 1),
  ('00000000-0000-0000-0000-000000000001', 'Depth (pronator)', 'Pronation strength, establishing and holding depth', 2),
  ('00000000-0000-0000-0000-000000000001', 'Palm', 'Palm-to-palm pressure application', 3),
  ('00000000-0000-0000-0000-000000000001', 'Wrist', 'Wrist position, flexion, containment', 4),
  ('00000000-0000-0000-0000-000000000001', 'Riser', 'Riser/height control of the hand', 5),
  ('00000000-0000-0000-0000-000000000001', 'The turn', 'Post-hook turning power application', 6),
  ('00000000-0000-0000-0000-000000000001', 'Strategic fouling', 'Using the foul system deliberately', 7),
  ('00000000-0000-0000-0000-000000000001', 'Versatility', 'Multiple styles, transitions between them', 8),
  ('00000000-0000-0000-0000-000000000001', 'Counter style', 'Mid-table vector changes, answering opponent''s move', 9),
  ('00000000-0000-0000-0000-000000000001', 'Optimal vector application', 'Applying force in the right direction', 10),
  ('00000000-0000-0000-0000-000000000001', 'Shoulder line', 'Body/shoulder alignment behind the hand', 11),
  ('00000000-0000-0000-0000-000000000001', 'Elbow positioning', 'Elbow drift, containment of own elbow', 12),
  ('00000000-0000-0000-0000-000000000001', 'Ref''s grip', 'Setup discipline, forcing advantageous starts', 13),
  ('00000000-0000-0000-0000-000000000001', 'Out of strap', 'Performance in strap rounds', 14),
  ('00000000-0000-0000-0000-000000000001', 'Initial grip', 'Winning or neutralizing the setup', 15),
  ('00000000-0000-0000-0000-000000000001', 'Talking to the ref', 'Communication, influencing restarts', 16);

-- ============================================================
-- New-user bootstrap: profile, personal rubric copy, demo match
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_template uuid;
  v_match uuid;
begin
  insert into public.profiles (id, handle)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'handle', ''), split_part(new.email, '@', 1))
      || '-' || substr(replace(new.id::text, '-', ''), 1, 4)
  );

  insert into public.rubric_templates (name, is_default)
  values ('Great Technique Framework', false)
  returning id into v_template;

  insert into public.rubric_attributes (template_id, name, description, display_order)
  select v_template, name, description, display_order
  from public.rubric_attributes
  where template_id = '00000000-0000-0000-0000-000000000001';

  insert into public.user_rubrics (user_id, template_id) values (new.id, v_template);

  insert into public.matches (user_id, title, event_name, left_puller, right_puller, source_type, youtube_id, fps)
  values (new.id, 'EVW 17 ' || chr(8212) || ' Janis Amolins vs. Mindaugas Tarasaitis', 'East vs West 17',
          'Mindaugas Tarasaitis', 'Janis Amolins', 'youtube', 'wBRBQlVCn1U', 30)
  returning id into v_match;

  insert into public.annotations (match_id, attribute_id, puller_side, round_number, timestamp_sec, rating, note)
  select v_match, a.id, d.side, d.round_number, d.ts, d.rating, d.note
  from (values
    ('Strategic fouling',  'right', 1, 30.0,  'red',   'Fidgeted, got 2nd foul ' || chr(8212) || ' lost the round on fouls'),
    ('Versatility',        'left',  2, 75.0,  'green', 'Flop press transition + strap usage gave him options Janis lacked'),
    ('Elbow positioning',  'right', 2, 110.0, 'red',   'Stuck in position; elbow moved back before hand control'),
    ('Counter style',      'left',  3, 150.0, 'green', 'Great mid-table vector change in strap ' || chr(8212) || ' Janis had no answer'),
    ('Fingers',            'right', 3, 185.0, 'red',   'Let Mindaugas establish depth'),
    ('Talking to the ref', 'right', 1, 20.0,  'green', 'Communicates well, gets refs to listen')
  ) as d(attr, side, round_number, ts, rating, note)
  join public.rubric_attributes a on a.template_id = v_template and a.name = d.attr;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Storage: private buckets; object paths are "{user_id}/{match_id}/{file}"
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('videos', 'videos', false, 524288000, array['video/mp4']),
  ('frames', 'frames', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "media: owner full access" on storage.objects
  for all to authenticated
  using (bucket_id in ('videos', 'frames') and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id in ('videos', 'frames') and (storage.foldername(name))[1] = auth.uid()::text);

create policy "media: readable when match has a public card" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('videos', 'frames') and public.match_has_card((storage.foldername(name))[2]));
