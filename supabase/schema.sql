-- ============================================================
-- Creative Team (CT) - database schema
-- Paste this whole file into: Supabase dashboard -> SQL Editor -> Run
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- TABLES ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz default now()
);

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now()
);

create table public.board_members (
  board_id uuid references public.boards(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz default now(),
  primary key (board_id, user_id)
);

create table public.board_invites (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  email text not null,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  unique (board_id, email)
);

-- "columns" are the task categories (To Do, In Progress, Review, Completed...)
create table public.columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  position double precision not null default 0,
  created_at timestamptz default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  column_id uuid not null references public.columns(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text default '',
  position double precision not null default 0,
  assignee_id uuid references public.profiles(id) on delete set null,
  due_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  board_id uuid references public.boards(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  message text not null,
  read boolean not null default false,
  created_at timestamptz default now()
);

create index on public.tasks (board_id, column_id, position);
create index on public.columns (board_id, position);
create index on public.comments (task_id, created_at);
create index on public.notifications (user_id, read, created_at desc);

-- ---------- HELPER FUNCTIONS ----------
create or replace function public.is_board_member(b uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.board_members where board_id = b and user_id = auth.uid());
$$;

create or replace function public.is_board_owner(b uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.boards where id = b and owner_id = auth.uid());
$$;

create or replace function public.shares_board_with(other uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.board_members a
    join public.board_members b on a.board_id = b.board_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

-- ---------- NEW USER -> PROFILE (+ accept pending invites) ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));

  insert into public.board_members (board_id, user_id, role)
  select board_id, new.id, 'member' from public.board_invites where email = lower(new.email)
  on conflict do nothing;

  delete from public.board_invites where email = lower(new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- RPC: create a board with default categories ----------
create or replace function public.create_board(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into public.boards (name, owner_id) values (trim(p_name), auth.uid()) returning id into new_id;
  insert into public.board_members (board_id, user_id, role) values (new_id, auth.uid(), 'owner');
  insert into public.columns (board_id, name, position) values
    (new_id, 'To Do', 1000), (new_id, 'In Progress', 2000),
    (new_id, 'Review', 3000), (new_id, 'Completed', 4000);
  return new_id;
end;
$$;

-- ---------- RPC: add a member by email (owner only) ----------
-- Returns 'added' if the person already has an account,
-- or 'invited' if they will be added automatically when they sign up.
create or replace function public.add_member_by_email(p_board uuid, p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare target uuid; clean text := lower(trim(p_email));
begin
  if not public.is_board_owner(p_board) then raise exception 'Only the board owner can add members'; end if;
  select id into target from public.profiles where email = clean;
  if target is not null then
    insert into public.board_members (board_id, user_id, role) values (p_board, target, 'member') on conflict do nothing;
    return 'added';
  else
    insert into public.board_invites (board_id, email, invited_by) values (p_board, clean, auth.uid()) on conflict do nothing;
    return 'invited';
  end if;
end;
$$;

-- ---------- NOTIFICATION TRIGGERS ----------
create or replace function public.actor_name()
returns text language sql security definer stable set search_path = public as $$
  select coalesce(full_name, email) from public.profiles where id = auth.uid();
$$;

create or replace function public.notify_board(p_board uuid, p_task uuid, p_msg text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, board_id, task_id, message)
  select user_id, p_board, p_task, p_msg
  from public.board_members
  where board_id = p_board and user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000');
end;
$$;

create or replace function public.trg_task_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare col text;
begin
  select name into col from public.columns where id = new.column_id;
  perform public.notify_board(new.board_id, new.id,
    public.actor_name() || ' added a task "' || new.title || '" in ' || col);
  return new;
end;
$$;
create trigger task_insert_notify after insert on public.tasks
  for each row execute function public.trg_task_insert();

create or replace function public.trg_task_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare col text;
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger task_update_touch before update on public.tasks
  for each row execute function public.trg_task_update();

create or replace function public.trg_task_moved()
returns trigger language plpgsql security definer set search_path = public as $$
declare col text;
begin
  if new.column_id is distinct from old.column_id then
    select name into col from public.columns where id = new.column_id;
    perform public.notify_board(new.board_id, new.id,
      public.actor_name() || ' moved "' || new.title || '" to ' || col);
  end if;
  return new;
end;
$$;
create trigger task_moved_notify after update on public.tasks
  for each row execute function public.trg_task_moved();

create or replace function public.trg_comment_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare t text;
begin
  select title into t from public.tasks where id = new.task_id;
  perform public.notify_board(new.board_id, new.task_id,
    public.actor_name() || ' commented on "' || t || '"');
  return new;
end;
$$;
create trigger comment_insert_notify after insert on public.comments
  for each row execute function public.trg_comment_insert();

-- ---------- ROW LEVEL SECURITY ----------
alter table public.profiles       enable row level security;
alter table public.boards         enable row level security;
alter table public.board_members  enable row level security;
alter table public.board_invites  enable row level security;
alter table public.columns        enable row level security;
alter table public.tasks          enable row level security;
alter table public.comments       enable row level security;
alter table public.notifications  enable row level security;

-- profiles: see yourself and people you share a board with
create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_board_with(id));
create policy "profiles update self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- boards
create policy "boards read" on public.boards for select to authenticated
  using (public.is_board_member(id));
create policy "boards update" on public.boards for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "boards delete" on public.boards for delete to authenticated
  using (owner_id = auth.uid());
-- (boards are created through create_board(), so there is no insert policy on purpose)

-- members
create policy "members read" on public.board_members for select to authenticated
  using (public.is_board_member(board_id));
create policy "members remove" on public.board_members for delete to authenticated
  using ((public.is_board_owner(board_id) and role <> 'owner') or (user_id = auth.uid() and role <> 'owner'));

-- invites (owner only)
create policy "invites read" on public.board_invites for select to authenticated
  using (public.is_board_owner(board_id));
create policy "invites delete" on public.board_invites for delete to authenticated
  using (public.is_board_owner(board_id));

-- categories (columns)
create policy "columns read" on public.columns for select to authenticated using (public.is_board_member(board_id));
create policy "columns insert" on public.columns for insert to authenticated with check (public.is_board_member(board_id));
create policy "columns update" on public.columns for update to authenticated using (public.is_board_member(board_id)) with check (public.is_board_member(board_id));
create policy "columns delete" on public.columns for delete to authenticated using (public.is_board_member(board_id));

-- tasks
create policy "tasks read" on public.tasks for select to authenticated using (public.is_board_member(board_id));
create policy "tasks insert" on public.tasks for insert to authenticated
  with check (public.is_board_member(board_id) and created_by = auth.uid());
create policy "tasks update" on public.tasks for update to authenticated
  using (public.is_board_member(board_id)) with check (public.is_board_member(board_id));
create policy "tasks delete" on public.tasks for delete to authenticated using (public.is_board_member(board_id));

-- comments
create policy "comments read" on public.comments for select to authenticated using (public.is_board_member(board_id));
create policy "comments insert" on public.comments for insert to authenticated
  with check (public.is_board_member(board_id) and user_id = auth.uid());
create policy "comments update own" on public.comments for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "comments delete own" on public.comments for delete to authenticated using (user_id = auth.uid());

-- notifications: only yours (they are created by triggers)
create policy "notifications read" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notifications update" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications delete" on public.notifications for delete to authenticated using (user_id = auth.uid());

-- lock down RPCs to signed-in users only
revoke all on function public.create_board(text) from public, anon;
revoke all on function public.add_member_by_email(uuid, text) from public, anon;
grant execute on function public.create_board(text) to authenticated;
grant execute on function public.add_member_by_email(uuid, text) to authenticated;
revoke all on function public.notify_board(uuid, uuid, text) from public, anon, authenticated;

-- ---------- LIVE UPDATES ----------
alter publication supabase_realtime add table public.tasks, public.columns, public.comments,
  public.notifications, public.board_members;
