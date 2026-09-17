# Realtime Two-Person Chat

This version uses:

- Name + unique username + password signup
- Username/password login with no email
- Username-based personal links such as `/erick`
- Two-person conversations based on the two usernames
- Real-time Supabase messaging
- Text replies
- Images/photos
- Documents and other files
- Voice notes
- 5 MB maximum per attachment
- Video uploads blocked on both client and server
- Explicit camera permission and photo preview before sending

## 1. Supabase setup

Run `supabase/schema.sql` in the Supabase SQL Editor.

The SQL creates:

- `users`
- `messages`
- `chat-files` storage bucket
- Realtime for `messages`

The app's server API uses `SUPABASE_SERVICE_ROLE_KEY` for account and file operations. Keep that key server-side.

## 2. Environment variables

Create `.env.local` from `.env.local.example`:

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SESSION_SECRET=a-long-random-secret
```

Never put `SUPABASE_SERVICE_ROLE_KEY` in a `NEXT_PUBLIC_` variable.

For Vercel, add all four variables to the Production environment.

## 3. Install and run

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## 4. User flow

A user signs up with:

```text
Name
Username
Password
```

No email is requested.

The username is unique and becomes the personal link:

```text
https://your-site.vercel.app/erick
```

A second logged-in user can open that link. The conversation is created from the two usernames, so the same pair always reaches the same two-person conversation.

## 5. Attachments

The Files menu supports:

- Choose File
- Take / Choose Photo
- Open Camera
- Record Voice Note

The maximum is 5 MB per file.

Video MIME types and common video extensions are rejected in the browser and again by the `/api/upload` server endpoint.

Camera use is explicit. The browser asks for camera permission, and the user must press **Take Photo** and then **Send Photo**.

## 6. Vercel

Add these Environment Variables to Vercel:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SESSION_SECRET
```

Then deploy normally from GitHub.

## 7. Important

The supplied project originally had random room IDs and name-only access. This version removes that home-screen room creation flow and changes the application to username-based accounts and links.

The existing WhatsApp-style visual design is retained.
