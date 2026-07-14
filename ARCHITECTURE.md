# Architecture

## Stack
- **React + Vite** — frontend SPA, no backend
- **Supabase** — Postgres database + auth (Google OAuth, email/password)
- **Vercel** — hosting, auto-deploys on every push to `main`

---

## Auth
The root `App` component checks for a Supabase session on load. If none exists, it renders a `LoginPage`. Once authenticated, it renders `TrackerApp`. `onAuthStateChange` keeps the session in sync across tabs and OAuth redirects.

---

## Data layer
Two Supabase tables:
- **`tasks`** — stores routine definitions (name, frequency, specific days). Scoped to the logged-in user via Row Level Security.
- **`completions`** — stores each time a task was checked off, keyed by `task_id` and a `date_key` string (`YYYY-MM-DD` for daily/specific-days tasks, `week_YYYY-MM-DD` for weekly tasks).

All reads/writes go directly from React to Supabase — no API layer. Completions are held in a `Set` in React state for O(1) lookup when rendering each task card.

---

## Routine logic
Utility functions in `src/hooks.js` compute the date keys used as completion identifiers:
- `getTodayDateKey()` → `2026-07-13`
- `getWeekDateKey()` → `week_2026-07-07` (Monday of current week)

This keeps the completion model simple — one string per task per day/week.

---

## Views

**Routines tab** — lists tasks grouped by frequency (Daily / Specific Days / Weekly). Each card can be checked off if it's due today. The weekly progress bar counts expected vs. completed occurrences across the current week.

**Dashboard tab** — two sections:
1. *Monthly calendar heatmap* — each day cell is colored by the percentage of routines completed that day (green = 100%, dark = 0%, gray = none expected).
2. *By Routine* — one row per task showing a square per day of the month. Green = done, dark gray = missed, transparent = not scheduled, faded = future. Weekly tasks show per-week squares instead. Each row shows a monthly completion percentage.

---

## Deployment
Vercel is connected to the GitHub repo. Every push to `main` triggers a build (`vite build`) and deploys. Supabase credentials are set as environment variables in Vercel so they're baked into the bundle at build time.
