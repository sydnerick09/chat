# Realtime Two-Person Chat

A simple, beginner-friendly real-time chat website. No accounts, no
passwords, no email — just a shareable link and a name.

- Person A clicks **"Create Chat"** and gets a link like
  `https://yourapp.vercel.app/chat/ABC123xyz`
- Person A sends that link to Person B (WhatsApp, SMS, etc.)
- Both people open the link, type their name, and start chatting —
  messages appear on both screens instantly.

---

## 1. What we are building

A Next.js website with two pages:

1. **Home page (`/`)** — has a "Create Chat" button that generates a
   random, hard-to-guess room link.
2. **Chat room page (`/chat/[roomId]`)** — first asks for a name, then
   shows the live chat for that room.

Messages are stored in a Supabase database table, and Supabase
**Realtime** instantly pushes new messages to everyone viewing that
room — that's what makes the chat "real-time" instead of needing a
page refresh.

## 2. What Supabase does here

Supabase is a hosted Postgres database with two features this project
leans on:

- **Database table** — stores every chat message (`room_id`,
  `sender_name`, `message`, `created_at`, `reply_to_id`).
- **Realtime** — whenever a new row is inserted into the `messages`
  table, Supabase broadcasts that row to every browser subscribed to
  that room. No server code needed — the browser talks to Supabase
  directly, safely, using Row Level Security (RLS) rules you set up
  once.

You do **not** need to write a backend server. The Next.js app talks
straight to Supabase from the browser using the public "anon" key,
which is safe to expose because of the RLS policies in
`supabase/schema.sql`.

## 3. What files are in this project

```
realtime-chat/
├── pages/
│   ├── _app.js              # loads global styles
│   ├── index.js             # home page — "Create Chat"
│   └── chat/
│       └── [roomId].js      # name entry + the live chat room
├── lib/
│   ├── supabaseClient.js    # sets up the Supabase connection
│   └── generateRoomId.js    # makes random room IDs
├── styles/
│   └── globals.css          # all the styling (mobile + desktop friendly)
├── supabase/
│   └── schema.sql           # run this in Supabase to create the table
├── .env.local.example       # template for your Supabase keys
├── package.json
└── next.config.js
```

## 4. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in (free tier is
   fine).
2. Click **New Project**.
3. Pick an organization, name the project (e.g. `realtime-chat`), set a
   database password (save it somewhere), pick a region close to you,
   and click **Create new project**. Wait ~1-2 minutes for it to spin
   up.

## 5. Create the messages table

1. In your Supabase project, open the left sidebar and click **SQL
   Editor**.
2. Click **New query**.
3. Open `supabase/schema.sql` from this project, copy the entire
   contents, and paste it into the SQL editor.
4. Click **Run**.

This one file does everything:
- Creates the `messages` table
- Adds an index so loading a room's messages stays fast
- Turns on Row Level Security
- Adds policies so anyone with the public anon key can read and send
  messages (but not edit/delete them)
- Enables Realtime on the table

You can double check it worked: go to **Table Editor** in the sidebar
— you should see a `messages` table.

## 6. Configure environment variables

1. In Supabase, go to **Project Settings** (gear icon) → **API**.
2. Copy the **Project URL** and the **anon / public** key (NOT the
   `service_role` key — never use that one in frontend code).
3. In this project, copy `.env.local.example` to a new file named
   `.env.local`:

   ```bash
   cp .env.local.example .env.local
   ```

4. Open `.env.local` and paste in your values:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key-here
   ```

`.env.local` is already listed in `.gitignore`, so it won't get
committed to git by accident.

## 7. Install dependencies and run it locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 8. How the chat page and real-time messaging work

- `pages/index.js` — clicking **Create Chat** just generates a random
  ID (`lib/generateRoomId.js`) and builds a link like
  `/chat/aK3f9QxZ2mPq`. Nothing is saved to the database yet — the
  room "exists" as soon as the first message is sent into it.
- `pages/chat/[roomId].js`:
  - First checks `localStorage` for a name already saved for this
    room. If none is found, it shows the **"What's your name?"**
    screen. The name is saved to `localStorage` only (as the spec
    requires) — it is a display name, not a login.
  - Once a name is set, it loads existing messages for that
    `room_id` from Supabase, then opens a **Realtime subscription**
    (`supabase.channel(...).on('postgres_changes', ...)`) that listens
    for new rows inserted into `messages` for that room. When a new
    message arrives — from either person — it's added to the screen
    instantly.
  - Sending a message calls `supabase.from('messages').insert(...)`.
    The sender doesn't add the message to their own screen directly;
    they wait for the realtime event, so both people see messages
    appear the exact same way.
  - **Reply feature**: tapping "Reply" on a message stores that
    message in state and shows a "Replying to X: ..." bar above the
    input. Sending while that's active includes `reply_to_id` in the
    inserted row. Each message bubble looks up its own
    `reply_to_id` (if any) and shows a small quoted preview above it.

## 9. How to test with Person A and Person B

**Easiest local test (two browser windows):**

1. Run `npm run dev`.
2. Open `http://localhost:3000` and click **Create Chat**, then
   **Enter This Chat**. Enter the name "Erick".
3. Copy the URL from the address bar (e.g.
   `http://localhost:3000/chat/aK3f9QxZ2mPq`).
4. Open that same URL in a **second browser window** (or an incognito
   window, so it doesn't share the same `localStorage` name). Enter
   the name "John".
5. Type a message as Erick — it should appear instantly in John's
   window, and vice versa.

**Testing on two real devices:** you'll need the site deployed (see
next section) or your computer's local network IP, since
`localhost` only works on the same machine.

## 10. How to deploy it to Vercel

1. Push this project to a GitHub repository.
2. Go to [vercel.com](https://vercel.com), sign in, and click **Add
   New → Project**.
3. Import your GitHub repo.
4. In the **Environment Variables** section of the import screen, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

   (same values from your `.env.local`)
5. Click **Deploy**. Vercel builds and gives you a live URL like
   `https://realtime-chat-yourname.vercel.app`.
6. Test it: open that URL, click **Create Chat**, copy the link, and
   send it to a friend on a different device. You should be able to
   chat in real time.

---

## Security notes (please read)

- Entering a name is **not** a login system. Anyone who has the room
  link can join and see the messages in that room.
- The room ID is long and random specifically so links can't be
  guessed — treat the link itself like a password, and don't post it
  publicly. The app shows a warning about this on both the create
  screen and the name-entry screen.
- Only the Supabase **anon/public** key is used in the browser. The
  `service_role` key (which bypasses all security rules) is never
  used in this project — keep it out of frontend code in any project
  you build.
- Row Level Security policies in `supabase/schema.sql` control exactly
  what the public key is allowed to do: read and insert messages only
  — no updates, no deletes, no access to any other tables you might
  add later.

## Ideas for later (not included, on purpose)

The spec asked to keep this minimal, so these are intentionally left
out for now: read receipts, typing indicators, message editing/
deleting, image/file uploads, push notifications, and room
expiration. All of these could reuse the same `messages` table and
Realtime setup.
