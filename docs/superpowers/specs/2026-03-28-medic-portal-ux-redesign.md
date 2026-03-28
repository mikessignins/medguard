# MedPass Web — Medic Portal UX Redesign

**Date:** 2026-03-28
**Scope:** Medic portal (primary daily-use surface) + Admin dashboard fix + Mobile nav + Light mode
**Priority driver:** Medics use the portal daily in a linear queue workflow; admins use it a few times a week

---

## Context

MedPass Web is a Next.js 14 app used by medics to review fitness-for-work declarations submitted via the iOS app. The web portal is read/manage only — no submission creation. Medics process a queue of declarations top-to-bottom each shift. The primary pain points identified:

- Decision buttons buried at the bottom of a long scroll on the submission detail page
- No queue navigation — after a decision, medics manually back-navigate to the list
- Flagged medications indicated only by a small 2px orange dot in the list — easy to miss
- Medication declarations section bolted below submissions — no badge count, easy to overlook
- Admin dashboard uses white/light cards on a dark `bg-slate-950` layout — theme inconsistency
- No mobile support — sidebar breaks on small screens
- No light mode option

---

## 1. Submission Detail Page (`/medic/submissions/[id]`)

### Layout change: single-column scroll → two-column split

**Left column (scrollable):** All clinical information in reading order
- Worker identity bar at the top (sticky): full name, job role, site, visit date, shift type, current status badge, flagged medication count badge
- Flagged medication callout card directly below identity bar — orange-bordered, lists each flagged med with its review category. Only rendered when `hasFlaggedMeds` is true
- Disclosed conditions section
- Full medications table (existing)
- Prescription scripts / lightbox (existing)
- Immunisations (existing)
- Submission metadata (submitted at, consent) — de-emphasised, placed last

**Right column (sticky, non-scrolling):**
- Decision panel (Approve / Requires Follow-up buttons) — always visible
- "Next Submission →" button — rendered after a decision is saved, advances to the next pending submission in the queue
- Export PDF button
- Comments section (existing, moved here)

### Queue navigation

A header bar above the two-column layout contains:
- "← Back to Submissions" link (existing behaviour)
- Queue position indicator: `X of Y pending` — Y = count of non-exported, non-recalled submissions for the active site at page load
- Prev / Next arrow buttons — navigate to adjacent submission IDs in the same ordered list

Queue position and sibling IDs are passed as URL search params from the dashboard list: `?queue=id1,id2,id3&pos=2`. The detail page reads these to render the nav bar. If params are absent (direct link), the nav bar shows "Back to Submissions" only. The queue param is capped at 50 IDs to keep URLs reasonable; sites with more pending submissions than that are uncommon in this context.

### "Next Submission" behaviour

After Approve or Requires Follow-up is saved:
- If a next submission ID exists in the queue param, show "Next Submission →" button in the right panel
- Button navigates to `/medic/submissions/[nextId]?queue=...&pos=N+1`
- If no next submission, button reads "Back to list" instead

---

## 2. Medic Dashboard (`/medic`)

### Stat cards → clickable filters

The four stat cards (New, In Review, Approved, Follow-up) become interactive filter toggles. Clicking a card filters the submission list below to that status — replacing the existing separate filter pill row, which is removed.

Active card: highlighted border + accent background. Clicking the active card again clears the filter (shows all).

When `medDecEnabled` is true, a fifth stat tile is added: "Med Decs pending" — count of medication declarations for the active site that are not exported, not purged, and not in a final review status.

### Site switcher

Current underline tabs replaced with horizontally scrollable pill buttons. Each pill shows the site name and, if applicable, a badge with the count of new/pending items. The active pill is cyan-bordered. This handles sites with long names or many sites without layout breakage.

### Submission list rows

Each row in the submission list gains inline risk chips between the worker name and the status badge:

- Job role (plain text, slate-500)
- "⚠ N flagged meds" chip (orange) — only when `hasFlaggedMeds` is true
- "⚠ Anaphylaxis risk" chip (red) — only when `ws.allergies?.toLowerCase().includes('anaphyla')` is true (mirrors existing SubmissionDetail logic)
- "N condition(s)" chip (amber) — only when `conditionFlags.length > 0`
- "No flags" chip (slate, low contrast) — when none of the above apply

Status badge moves to the far right (existing position).

### Section tabs: Emergency Declarations / Medication Declarations

When `medDecEnabled` is true, the content area below the site switcher gains two tabs:

- **Emergency Declarations** (default active) — existing submission list content
- **Medication Declarations** — existing `MedDecSection` content, moved here from its current appended position

The Medication Declarations tab shows a badge with the pending count. This replaces the current approach of rendering `MedDecSection` unconditionally below all submissions.

---

## 3. Admin Dashboard (`/admin`)

### Theme fix

The `MetricCard` component currently renders `bg-white border-slate-200 text-slate-800` — white cards on a `bg-slate-950` layout. Replace with the existing `stat-card` Tailwind class (`bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl`).

Metric values get semantic accent colours consistent with the medic dashboard:
- Workers → `text-blue-400`
- Active Medics → `text-emerald-400`
- Pending Medics → `text-amber-400`
- Sites → `text-violet-400`
- Declarations This Month → `text-cyan-400`

Emoji icons are removed. The icon slot becomes the large coloured number itself.

---

## 4. Mobile Navigation

### Sidebar → bottom nav on small screens

Both medic and admin layouts currently render a fixed `w-64` sidebar with no mobile handling.

Changes:
- Sidebar wrapper: add `hidden md:flex` — hidden on mobile, visible from `md` upward
- Add a `<nav>` element with `flex md:hidden fixed bottom-0 left-0 right-0 z-50` containing the same nav links rendered as icon+label columns
- Main content area: add `pb-16 md:pb-0` to clear the bottom nav on mobile

No JavaScript required — pure Tailwind responsive classes. The bottom nav items mirror the sidebar links for each role.

---

## 5. Light Mode

### Palette: Warm Slate

- Base background: `bg-slate-100` (`#f1f5f9`)
- Card/panel background: `bg-white` with `border-slate-200`
- Secondary surface: `bg-slate-50`
- Primary text: `text-slate-900`
- Secondary text: `text-slate-500`
- Borders: `border-slate-200` / `border-slate-300`
- Accent (cyan): unchanged — `text-cyan-600` / `bg-cyan-600` (darkened slightly for contrast on light bg)

Risk chip colours adapt: orange/amber/red chips lighten their backgrounds to match (e.g. `bg-orange-50 border-orange-200 text-orange-700`).

### Implementation

CSS custom properties on `:root` (dark, default) and `[data-theme="light"]`:

```css
:root {
  --bg-base: #0f172a;
  --bg-card: rgba(30, 41, 59, 0.6);
  --border: rgba(148, 163, 184, 0.1);
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
}

[data-theme="light"] {
  --bg-base: #f1f5f9;
  --bg-card: #ffffff;
  --border: #e2e8f0;
  --text-primary: #0f172a;
  --text-secondary: #64748b;
}
```

The existing codebase uses hardcoded Tailwind dark classes throughout. Rather than migrating every component at once, the light mode implementation is progressive: CSS variables cover the high-traffic surfaces first (body background, card backgrounds, borders, primary/secondary text), applied via `globals.css`. Individual components are updated as they are touched during this implementation. The Tailwind config does not need changes — the variable approach works independently of Tailwind's `darkMode` setting.

**Toggle:** A sun/moon icon button in the sidebar footer (below the user section). Clicking sets `document.documentElement.dataset.theme` and persists to `localStorage`. On mount, the root layout reads `localStorage` and sets the attribute before first paint to avoid flash.

---

## 6. Superuser Portal (`/superuser`)

### Active link highlighting

The superuser layout hardcodes all sidebar nav links with the inactive style — there is no `usePathname()` active detection. Extract sidebar nav into a `SuperuserSidebar` client component, mirroring the existing `AdminSidebar` pattern. Nav items: Businesses (`/superuser`), Purge Log, Billing, Feedback (with unread badge).

The unread feedback count is currently fetched in the layout server component and passed down. `SuperuserSidebar` receives it as a prop.

### Mobile navigation

Same treatment as medic and admin layouts:
- Sidebar wrapper: `hidden md:flex`
- Fixed bottom nav: `flex md:hidden fixed bottom-0 left-0 right-0 z-50`
- Bottom nav items: Businesses, Billing, Feedback (with badge dot if unread > 0), Sign Out
- Main content: `pb-16 md:pb-0`

### Light mode

Superuser layout and `SuperuserDashboard` included in the CSS variable coverage pass. The table (`bg-slate-800/60`, `bg-slate-900/60`, `border-slate-700/50`) maps to the same card/base/border variables as other portals. No structural changes to the dashboard table — it already displays data well.

### No other changes

`SuperuserDashboard` itself is already dark-themed and correctly structured. The business table, suspend/unsuspend actions, and `NewBusinessModal` are functional and out of scope for visual changes beyond light mode.

---

## Out of Scope

- Worker-facing features (workers use iOS only)
- Submission creation from web
- Superuser portal changes
- Purge workflow UI changes (functional, leave as-is)
- Supabase schema changes

---

## Files Affected

| File | Change |
|------|--------|
| `app/globals.css` | Add CSS theme variables, light mode overrides |
| `app/layout.tsx` | Theme initialisation script (prevent flash) |
| `app/medic/layout.tsx` | Mobile bottom nav, theme toggle button |
| `app/admin/layout.tsx` | Mobile bottom nav, theme toggle button |
| `app/admin/page.tsx` | Replace MetricCard with dark stat-card pattern |
| `app/medic/page.tsx` | Pass queue params to MedicDashboard |
| `app/medic/submissions/[id]/page.tsx` | Read queue params, pass sibling IDs to SubmissionDetail |
| `components/medic/MedicDashboard.tsx` | Clickable stat cards, pill site switcher, richer rows, section tabs |
| `components/medic/SubmissionDetail.tsx` | Two-column layout, sticky action panel, queue nav bar, next button |
| `app/superuser/layout.tsx` | Mobile bottom nav, pass unreadFeedback to SuperuserSidebar |
| `components/superuser/SuperuserSidebar.tsx` | New component — active link detection, mirrors AdminSidebar pattern |
| `components/superuser/SuperuserDashboard.tsx` | CSS variable coverage for light mode |
