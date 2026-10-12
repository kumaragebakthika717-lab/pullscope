# PullScope

Arm-wrestling match analysis: paste a YouTube link or upload a match, score both pullers across a
technique rubric with frame-accurate timestamps, export a shareable report card (web page + PNG).

Next.js 15 (App Router) · TypeScript · Tailwind v4 + shadcn/ui · Supabase (Postgres + Auth + Storage)
· TanStack Query · satori + resvg-js.

## Routes

| Route | Purpose |
|---|---|
| `/` | Landing page with an example report card |
| `/login` | Email + Google sign in / sign up |
| `/dashboard` | Your matches, 3 active on the free plan |
| `/match/[id]` | The workspace: player, timeline, rubric, annotations |
| `/card/[slug]` | Public report card (`/card/[slug]/png` renders the PNG) |
| `/settings/rubric` | Rubric editor |

In the workspace: `Space` play/pause · `←`/`→` seek 1s · `,`/`.` frame step · `A` new annotation ·
`1`/`2`/`3` green/red/black · `Tab` switch puller · `Esc` close.

## Getting started

### 1. Supabase project

Create a free project at [supabase.com](https://supabase.com). Then get three values:

- **Project Settings → API**: Project URL and `anon` public key
- **Project Settings → Database → Connection string**: the *session pooler* URI
  (`postgres://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres`)

### 2. Environment

```bash
cp .env.example .env.local
```

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | anon public key; RLS is what protects data, not this key |
| `NEXT_PUBLIC_SITE_URL` | yes | Origin used for share links and OAuth redirects, no trailing slash |
| `DATABASE_URL` | for `npm run db:migrate` only | Connection string from step 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | no | Not read at runtime; reserved for admin scripts |

`.env*` is git-ignored except `.env.example`.

### 3. Schema, default rubric, demo data

```bash
npm install
npm run db:migrate
```

This applies `supabase/migrations/0001_init.sql`, which creates the tables, all RLS policies, the
private `videos`/`frames` buckets, the 16-attribute "Great Technique Framework", and a trigger that —
on signup — creates the user's profile, their own copy of the rubric, and the pre-annotated
EVW 17 demo match. Run it **before** the first signup so the bootstrap trigger exists.

Prefer the dashboard? Paste the same file into SQL Editor instead; it is a single transaction.

### 4. Auth

- **Email**: Authentication → Providers → Email. For local testing turn *Confirm email* off, or every
  signup will need a click that never arrives.
- **Google**: Authentication → Sign In / Up → Google. Add your OAuth client's redirect URI as
  `http://localhost:3000/auth/callback` (and the production equivalent), then put that same origin in
  Authentication → URL Configuration → Site URL and Redirect URLs.
- **Handle**: Authentication → Sign In / Up → Additional Settings → Email template.

### 5. Run

```bash
npm run dev
```

Sign up, and the demo match opens with six annotations already on the timeline.

## Notes that matter

**Frame capture.** Capture is client-side: the current frame of the `<video>` is drawn to a canvas,
encoded as JPEG and uploaded straight to `frames`. That requires the video response to carry CORS
headers, so the element sets `crossOrigin="anonymous"`. Supabase Storage sends
`access-control-allow-origin: *` on signed URLs (verified), so frames from uploaded videos capture
cleanly. **YouTube cannot be captured at all** — its player is a cross-origin iframe that taints the
canvas — so `video-player.tsx` reports `canCapture: false` for that source, the form says
"YouTube frames can't be captured", and the annotation saves without a screenshot.

**Upload probing.** `finalizeUpload` runs ffprobe against the signed URL to read real fps and duration.
The binary comes from `@ffprobe-installer/ffprobe` (a per-platform optional dependency, ~70 MB), so no
system ffmpeg is needed — verified locally against a remote signed URL (returned `30/1` fps, 10 s).
On a host that cannot execute the bundled binary the probe throws and the match falls back to the
browser-reported duration plus 30 fps, which makes frame stepping approximate for uploads; the Vercel
behaviour has not been tested. The 500 MB cap is enforced hard by the `videos` bucket; the 30-minute
cap is only as trustworthy as the probe.

**Match limit.** 3 active matches for `plan = 'free'`, enforced by a `before insert or update` trigger,
so it cannot be bypassed through the REST API.

**Public cards.** `/card/[slug]` reads through the security-definer `get_public_card(slug)` function
rather than a blanket anon policy, so slugs can't be enumerated. Frame and video objects stay in private
buckets; anon may read an object only when its `{user}/{match}/…` path names a match that has a report
card, and the page serves 6–24 h signed URLs.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest (pure logic + a real satori/resvg PNG render) |
| `npm run db:migrate` | Apply `supabase/migrations/*.sql` using `DATABASE_URL` |

## Deploy

Stop `npm run dev` and delete `.next` before `npm run build` — running both against the same `.next`
directory fails the build with `Invariant: no direct app page entry found for /auth/callback`. With a
clean cache the build passes. ffprobe comes from `@ffprobe-installer/ffprobe`, which installs a
per-platform binary, so no system ffmpeg is needed (verified on Windows; not yet on a host).

Set the four variables from step 2 in your host, apply the migration once, and point Supabase's Site URL
and redirect list at the production origin. The PNG route needs no extra config — satori and resvg-js
are bundled, and the Barlow Condensed + Inter fonts ship from `@fontsource`.

Not built, on purpose: payments (Free/Pro/Coach tiers are schema-only — `profiles.plan` gates the
watermark and the match limit), angle overlays, multi-analyst consensus, AI pose detection.
