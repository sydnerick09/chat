-- Run this entire file in the Supabase SQL Editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run)

-- 1. Create the messages table
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  sender_name text not null,
  message text not null,
  reply_to_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Index to make "load messages for this room" fast as the table grows.
create index if not exists messages_room_id_idx
  on public.messages (room_id, created_at);

-- 2. Turn on Row Level Security (RLS).
-- This is what makes it safe to use the public "anon" key in the browser.
alter table public.messages enable row level security;

-- 3. Policy: anyone with the anon key can READ messages.
-- (In this simple app, "having the room link" is what limits who
-- realistically sees a room's messages, since the app always filters
-- by room_id. This matches the "link = access" model described above.)
drop policy if exists "Allow public read access" on public.messages;
create policy "Allow public read access"
  on public.messages
  for select
  using (true);

-- 4. Policy: anyone with the anon key can INSERT messages.
drop policy if exists "Allow public insert access" on public.messages;
create policy "Allow public insert access"
  on public.messages
  for insert
  with check (true);

-- Note: there are no UPDATE or DELETE policies, so messages cannot be
-- edited or deleted through the public API. That's intentional for
-- this simple beginner app.

-- 5. Enable Realtime so INSERTs are pushed to subscribed clients.
alter publication supabase_realtime add table public.messages;
