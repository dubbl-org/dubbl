# Design Migration Plan

> Migrate Dubbl's visual layer to match the PayrollPro (QuickBooks-inspired) design language.
> **Zero functional changes.** All business logic, data flow, routing, and APIs stay identical.

---

## Phase 1: Design Tokens (globals.css)

### 1.1 Color Variables
Replace CSS custom properties in `app/globals.css`:

| Token | Current (Dubbl) | Target (Reference) |
|-------|-----------------|---------------------|
| `--background` | `#ffffff` | `hsl(0 0% 97%)` — light gray page bg |
| `--foreground` | `#0a0a0a` | `hsl(210 11% 15%)` — blue-gray text |
| `--card` | `#ffffff` | `hsl(0 0% 100%)` — stays white |
| `--primary` | `#10b981` (bright emerald) | `hsl(145 63% 32%)` — darker QB green |
| `--primary-foreground` | `#ffffff` | `hsl(0 0% 100%)` — stays white |
| `--secondary` | `#f5f5f5` | `hsl(220 14% 96%)` — cooler gray |
| `--muted-foreground` | `#737373` | `hsl(215 13% 44%)` — blue-gray muted |
| `--accent` | `#f5f5f5` | `hsl(145 63% 95%)` — soft green tint |
| `--accent-foreground` | `#0a0a0a` | `hsl(145 63% 25%)` — deep green |
| `--border` | `#e5e5e5` | `hsl(220 13% 91%)` — cooler border |
| `--ring` | `#10b981` | `hsl(145 63% 32%)` — darker green ring |

Add new tokens:
- `--success`: `hsl(145 63% 32%)`
- `--warning`: `hsl(38 92% 50%)`
- `--shadow-sm/md/lg/glow` custom properties

Dark mode: change from green-tinted grays to neutral blue-grays (220 13% base).

Sidebar tokens: adopt white/light sidebar in light mode.

### 1.2 Radius
- Change `--radius` from `0.625rem` (10px) to `0.375rem` (6px)

### 1.3 Typography
- Replace Geist with Inter (already available via Google Fonts import)
- Remove Playfair Display (display font) — headings use Inter `font-semibold tracking-tight`
- Keep Geist Mono for code blocks only
- Add `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap')`
- Update `--font-sans` and body font-family

### 1.4 Shadows
Add shadow CSS variables matching reference:
```css
--shadow-sm: 0 1px 2px 0 hsl(0 0% 0% / 0.04);
--shadow-md: 0 1px 3px 0 hsl(0 0% 0% / 0.06), 0 1px 2px -1px hsl(0 0% 0% / 0.06);
--shadow-lg: 0 4px 6px -1px hsl(0 0% 0% / 0.07), 0 2px 4px -2px hsl(0 0% 0% / 0.05);
```

### 1.5 Utility Classes
Add reference's utility classes to globals.css:
- `.stat-card` — card with hover shadow transition
- `.nav-link` / `.nav-link-active` — sidebar nav styling
- `.data-table` — table styling conventions
- `.badge-success`, `.badge-warning`, `.badge-pending`
- `.animate-fade-in`, `.animate-slide-up`, `.animate-slide-in-left`

**Functional risk: NONE.** These are purely CSS variable and utility changes.

---

## Phase 2: Global Layout

### 2.1 Dashboard Layout (`app/(dashboard)/layout.tsx`)
Current: Uses `SidebarProvider` + `AppSidebar` + `SidebarInset` + `Topbar` + `OrgLoader` + `CreateDrawerProvider` + `CommandPalette`

Target style:
- Content area: `bg-background` (light gray) instead of `bg-content-bg`
- Main content padding: `p-6` (matching reference)
- Max-width container: keep current `max-w-[1250px]` (close to reference's 1400px)

**Changes:** Update `bg-content-bg` to `bg-background`, adjust padding. Keep all providers, components, and structure.

### 2.2 Auth Layout (`app/(auth)/layout.tsx`)
Current: Elaborate — GrainGradient shader, OrbitalDecoration SVGs, network node animation, noise overlay, gradient mesh, frosted glass cards, container edge lines.

Target style: Clean centered card on plain background, no decorations.

**Changes:**
- Remove `GrainGradient`, `OrbitalDecoration`, noise overlay, gradient mesh, container edge lines, network node animation
- Simplify to centered card layout: `min-h-screen bg-background flex items-center justify-center`
- Keep Logo component (Dubbl's own brand, not reference's)
- Card: `bg-card border rounded-md p-6 shadow-sm` (clean, professional)
- Keep all form children untouched (sign-in, sign-up, MCP authorize)

**Functional risk: NONE.** Only visual wrappers change; form logic stays.

> **Flag:** The auth layout currently uses `@paper-design/shaders-react` (GrainGradient). Removing its usage here means this dependency may become unused. We won't remove it from package.json to avoid breaking anything else that might use it.

### 2.3 Landing Layout (`app/(landing)/layout.tsx`)
This is the marketing/landing page. Keep it as-is or minimally restyle — it's separate from the app experience and the reference doesn't have a comparable landing page.

**Recommendation:** Leave landing page unchanged for now; revisit later if desired.

---

## Phase 3: Sidebar & Navigation

### 3.1 AppSidebar (`components/dashboard/sidebar.tsx`)
Current: Uses shadcn Sidebar components (`SidebarMenu`, `SidebarMenuItem`, etc.)

Target style:
- White background (light mode) / dark bg (dark mode)
- Fixed left, `w-56`, right border
- Logo area: Green icon box + brand name + role/subtitle
- Nav items: `text-[13px]`, icon 4x4, gap-3, rounded-md, px-3 py-2
- Active: green left border (3px), green text, soft green bg
- Hover: soft green bg
- User section at bottom: avatar circle, name, email, sign-out
- Width: 224px (w-56)

**Changes:** Restyle the existing sidebar component's classes/variants. Keep all nav items, links, and routing logic. Keep all sidebar providers and state management.

**Functional risk: NONE.** Navigation targets don't change.

### 3.2 Topbar (`components/dashboard/topbar.tsx`)
Target style: Minimal — sticky, `bg-card border-b`, `px-6 py-2.5`. Contains company/org selector.

**Changes:** Simplify topbar styling. Keep all interactive elements (org switcher, notifications, user menu, etc.).

---

## Phase 4: UI Components (shadcn/ui)

### 4.1 Button (`components/ui/button.tsx`)
Target changes:
- Base: `rounded-md`, `duration-150` transition
- Default: `shadow-sm`, `hover:bg-primary/90`
- Sizes: h-9/h-8/h-10/h-11 (add `xl` size)
- Outline: `hover:bg-muted` instead of current hover
- Ghost: `hover:bg-muted`
- Add `accent` and `success` variants (alias to primary styling)

### 4.2 Card (`components/ui/card.tsx`)
Target: `rounded-lg border bg-card shadow-sm` (already close, just ensure shadow-sm)

### 4.3 Input (`components/ui/input.tsx`)
Target: `h-10 rounded-md` (should mostly work via radius token change)

### 4.4 Table (`components/ui/table.tsx`)
Target: Standard shadcn table (already similar). Headers: `h-12 px-4`, muted foreground. Keep dense table styles from base CSS.

### 4.5 Badge (`components/ui/badge.tsx`)
Target: `rounded-full px-2.5 py-0.5 text-xs font-semibold` (already matching)

### 4.6 Dialog (`components/ui/dialog.tsx`)
Target: `sm:rounded-lg`, `bg-background p-6 shadow-lg` (minor class tweaks)

### 4.7 Other UI Components
Most shadcn components already use CSS variables and will auto-update when tokens change. Review:
- `select.tsx` — ensure consistent styling
- `sheet.tsx` — overlay should match dialog
- `tabs.tsx` — ensure consistent active states
- `skeleton.tsx` — update shimmer to reference style
- `sonner.tsx` — toast styling via variables

**Functional risk: NONE for all component changes.** Only class strings change.

---

## Phase 5: Animation Cleanup

Current project has ~30 keyframe animations. Reference uses 4 simple ones.

**Approach:**
- Keep all keyframes that are actively used by functional components (loaders, collapsible, etc.)
- Replace elaborate decorative animations with simpler reference equivalents where used
- Add reference animations: `fadeIn`, `slideUp`, `slideInLeft`, `pulse-subtle`
- Keep `shimmer-sweep` (used for skeleton loaders — functional)
- Keep `brand-breathe` / `brand-pulse` (org loader — functional)
- Keep collapsible animations (functional)
- The decorative animations (gradient-mesh, orbital, etc.) will naturally stop being used when auth layout is simplified

**Functional risk: NONE.** Loaders and interactive animations preserved.

---

## Phase 6: Page-Level Styling Review

For each page area, the changes are cosmetic (colors/spacing/radius via token cascade):

| Area | Components Affected | Changes |
|------|-------------------|---------|
| Auth pages | sign-in, sign-up, mcp-authorize | Simplified layout wrapper, form styling via tokens |
| Dashboard | Stats cards, tables, charts | Token cascade + stat-card class |
| Accounting | Accounts, journal entries, bank | Token cascade only |
| Sales | Invoices, quotes, credit notes | Token cascade only |
| Purchases | Bills, POs, debit notes | Token cascade only |
| Payroll | Employees, pay runs, deductions | Token cascade only |
| Inventory | Items, warehouses, transfers | Token cascade only |
| Projects | Projects, tasks, time entries | Token cascade only |
| CRM | Pipelines, deals | Token cascade only |
| Expenses | Claims, receipts | Token cascade only |
| Reports | Report views, builders | Token cascade only |
| Contacts | Customers, suppliers | Token cascade only |
| Settings | All settings panels | Token cascade only |
| Admin | Admin panel | Token cascade only |
| Docs | Fumadocs pages | Fumadocs theme vars update |

---

## Potential Conflicts & Mitigations

### 1. Tailwind CSS version difference
- **Reference:** Tailwind v3 with `@tailwind base/components/utilities`
- **Current:** Tailwind v4 with `@import "tailwindcss"` PostCSS syntax
- **Mitigation:** Adapt reference's design values into v4 syntax. Don't copy CSS files verbatim.

### 2. Sidebar component architecture
- **Reference:** Custom JSX sidebar with NavLink
- **Current:** shadcn `SidebarProvider` system with collapsible, mobile drawer, etc.
- **Mitigation:** Keep shadcn sidebar architecture, restyle with reference's visual language (colors, spacing, active states). Don't replace the component.

### 3. Font loading
- **Reference:** Google Fonts CSS import for Inter
- **Current:** Next.js `next/font/google` for Geist
- **Mitigation:** Switch to Inter via `next/font/google` (keeps Next.js font optimization). Don't use raw CSS import.

### 4. GrainGradient dependency
- **Reference:** No shader effects
- **Current:** `@paper-design/shaders-react` used in auth layout
- **Mitigation:** Stop rendering it in auth layout but don't remove package (may be used in landing page).

### 5. Fumadocs theme
- **Current:** Custom fd-* CSS variables matching emerald theme
- **Mitigation:** Update fd-* variables to match new QB-green palette.

---

## Implementation Order

1. **globals.css** — tokens, shadows, utility classes, font
2. **tailwind.config** (if exists) / theme inline block — update radius, font-family, color mappings
3. **Auth layout** — simplify decorations
4. **Dashboard layout** — bg color, padding
5. **Sidebar** — restyle classes
6. **Topbar** — simplify styling
7. **Button** — update variants
8. **Card** — minor shadow tweak
9. **Other UI components** — review and adjust
10. **Fumadocs theme vars** — update fd-* colors
11. **Visual regression pass** — review all pages

---

## Dependencies

**No new dependencies needed.** Inter font via `next/font/google` (already available in Next.js).

**Question for approval:** Should I also restyle the landing page (`/(landing)/`), or leave it as-is for now?

---

## STOP — Awaiting Approval

Please review this plan and confirm before I begin implementing. Specifically:
1. Do you approve the color palette change (bright emerald -> darker QB green)?
2. Do you approve simplifying the auth layout (removing grain shader, orbital decorations)?
3. Should the landing page be included or excluded from this migration?
4. Any components or pages you want to keep styled as-is?
