-- Run this entire file in Supabase SQL Editor.
-- It replaces the old random-room/name-only structure.

create extension if not exists pgcrypto;

-- 1. Users: custom username/password accounts (no email).
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text not null,
  password_hash text not null,
  password_salt text not null,
  created_at timestamptz not null default now()
);

-- Case-insensitive username uniqueness.
create unique index if not exists users_username_lower_unique
  on public.users (lower(username));

alter table public.users enable row level security;

-- Users are accessed through the server API using the service-role key.
-- No public policies are created for this table.

-- 2. Messages.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  sender_username text not null,
  sender_name text not null,
  message text not null default '',
  message_type text not null default 'text'
    check (message_type in ('text', 'image', 'audio', 'file')),
  file_url text,
  file_name text,
  file_type text,
  file_size integer,
  reply_to_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Add new columns safely if an older messages table already exists.
alter table public.messages add column if not exists sender_username text;
alter table public.messages add column if not exists message_type text default 'text';
alter table public.messages add column if not exists file_url text;
alter table public.messages add column if not exists file_name text;
alter table public.messages add column if not exists file_type text;
alter table public.messages add column if not exists file_size integer;

create index if not exists messages_room_id_idx
  on public.messages (room_id, created_at);

alter table public.messages enable row level security;

drop policy if exists "Allow public read access" on public.messages;
create policy "Allow public read access"
  on public.messages for select using (true);

drop policy if exists "Allow public insert access" on public.messages;
create policy "Allow public insert access"
  on public.messages for insert with check (
    message_type in ('text', 'image', 'audio', 'file')
    and coalesce(file_size, 0) <= 5242880
    and not (coalesce(file_type, '') ilike 'video/%')
  );

-- 3. Supabase Storage bucket.
-- The bucket is public for reading attachments, while uploads are performed
-- only by the Next.js server with SUPABASE_SERVICE_ROLE_KEY.
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-files', 'chat-files', true, 5242880)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880;

-- Remove broad anonymous upload policies if they exist.
drop policy if exists "Public can upload chat files" on storage.objects;
drop policy if exists "Public can read chat files" on storage.objects;

-- Public reads are handled by the public bucket URL.
-- No public INSERT policy is needed because /api/upload uses the service role.

-- 4. Realtime.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;
