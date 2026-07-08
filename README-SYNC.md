# FretLab Cloud Sync — setup checklist

## 1. Supabase (one-time, ~5 min)
1. supabase.com → New project (or reuse an existing one).
2. SQL Editor → paste and run `supabase-setup.sql`.
3. Authentication → URL Configuration → set Site URL to
   `https://fretlab-theory.netlify.app` (and add it to Redirect URLs).
4. Project Settings → API → copy the Project URL and the `anon` public key.

## 2. Local dev
Copy `.env.example` to `.env` and fill in both values.
(`.env` is gitignored — never commit it.)

## 3. Netlify
Site configuration → Environment variables → add:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
Then trigger a redeploy (or just push).

## How it behaves
- Signed out / not configured: pure localStorage, same as before.
- Signed in: local-first. Every change writes locally instantly, then
  debounce-upserts to the cloud (~1.5 s). Status jewel in the header:
  grey local · amber saving · green synced · red error.
- On sign-in, cloud vs local timestamps are compared and the newer wins.
- Export/Import JSON works regardless of sign-in, as an offline backup.

## Why the anon key is safe in the client
Row Level Security means the anon key can only read/write the row
belonging to the signed-in user. It's designed to be public.
