# Reference Design System (PayrollPro)

> Extracted from `design-reference/`. This is the target visual language to adopt.

## Overview
QuickBooks-inspired, clean, professional payroll application. Minimal decoration, business-focused.

## Color Palette (HSL CSS variables)

### Light Mode
| Token | HSL | Approx Hex | Usage |
|-------|-----|------------|-------|
| `--background` | 0 0% 97% | #f7f7f7 | Page background |
| `--foreground` | 210 11% 15% | #222831 | Primary text |
| `--card` | 0 0% 100% | #ffffff | Card surfaces |
| `--card-foreground` | 210 11% 15% | #222831 | Card text |
| `--primary` | 145 63% 32% | #1e8a50 | Primary green (darker, QB-style) |
| `--primary-foreground` | 0 0% 100% | #ffffff | Text on primary |
| `--secondary` | 220 14% 96% | #f2f4f7 | Secondary surfaces |
| `--secondary-foreground` | 210 11% 15% | #222831 | Secondary text |
| `--muted` | 220 14% 96% | #f2f4f7 | Muted surfaces |
| `--muted-foreground` | 215 13% 44% | #607080 | Muted text |
| `--accent` | 145 63% 95% | #e6f9f0 | Soft green highlight |
| `--accent-foreground` | 145 63% 25% | #176b3e | Accent text |
| `--success` | 145 63% 32% | #1e8a50 | Same as primary |
| `--warning` | 38 92% 50% | #f5a623 | Amber warning |
| `--destructive` | 0 72% 51% | #dc3545 | Red destructive |
| `--border` | 220 13% 91% | #e4e7ec | Borders |
| `--input` | 220 13% 91% | #e4e7ec | Input borders |
| `--ring` | 145 63% 32% | #1e8a50 | Focus rings |

### Dark Mode
| Token | HSL | Approx Hex | Usage |
|-------|-----|------------|-------|
| `--background` | 220 13% 10% | #161a1e | Page background |
| `--foreground` | 0 0% 95% | #f2f2f2 | Primary text |
| `--card` | 220 13% 14% | #1f2328 | Card surfaces |
| `--primary` | 145 63% 42% | #27b866 | Slightly lighter green |
| `--secondary` | 220 13% 18% | #282d33 | Secondary surfaces |
| `--muted` | 220 13% 18% | #282d33 | Muted surfaces |
| `--muted-foreground` | 215 13% 60% | #8494a7 | Muted text |
| `--accent` | 145 40% 18% | #1b3d2b | Dark green accent |
| `--accent-foreground` | 145 63% 65% | #5cd18d | Accent text |
| `--border` | 220 13% 22% | #31363d | Borders |

### Sidebar (Light)
| Token | HSL | Usage |
|-------|-----|-------|
| `--sidebar-background` | 0 0% 100% | White sidebar |
| `--sidebar-foreground` | 210 11% 15% | Sidebar text |
| `--sidebar-primary` | 145 63% 32% | Active nav color |
| `--sidebar-accent` | 145 63% 95% | Hover/active bg |
| `--sidebar-border` | 220 13% 91% | Sidebar border |

### Shadows
```css
--shadow-sm: 0 1px 2px 0 hsl(0 0% 0% / 0.04);
--shadow-md: 0 1px 3px 0 hsl(0 0% 0% / 0.06), 0 1px 2px -1px hsl(0 0% 0% / 0.06);
--shadow-lg: 0 4px 6px -1px hsl(0 0% 0% / 0.07), 0 2px 4px -2px hsl(0 0% 0% / 0.05);
--shadow-glow: none; (light) / 0 0 15px hsl(145 63% 42% / 0.1) (dark)
```

## Typography
- **Font family:** Inter (weight 300-700), system-ui fallback
- **Headings:** `font-semibold tracking-tight` (no display font)
- **Body:** Default text-sm (14px)
- **Small text / labels:** text-xs (12px)
- **Table headers:** text-xs uppercase tracking-wider
- **Brand name:** text-sm font-bold
- **Sub-labels:** text-[10px]

## Spacing & Layout
- **Base radius:** `0.375rem` (6px) - noticeably tighter than current 10px
- **Radius scale:** sm = 2px, md = 4px, lg = 6px
- **Sidebar width:** `w-56` (224px), fixed left
- **Main content:** `ml-56` offset, `p-6` padding
- **Top bar:** Sticky, `bg-card border-b`, `px-6 py-2.5`
- **Card padding:** `p-5` (stat cards), `p-6` (standard cards)
- **Grid gaps:** `gap-3` (stat grid), `gap-3` (shortcuts)
- **Section spacing:** `space-y-5`
- **Nav item spacing:** `space-y-0.5`
- **Container:** max-width 1400px, centered, 2rem padding

## Navigation Pattern
- **Left sidebar:** Fixed, full-height, white background, right border
- **Logo area:** 8x8 rounded-md green icon + brand name + role label, border-bottom
- **Nav items:** `px-3 py-2`, 13px text, `gap-3` icon+label, rounded-md
- **Active state:** `bg-sidebar-accent`, green text, `border-l-[3px] border-sidebar-primary`, `-ml-px`
- **Hover:** `bg-sidebar-accent`, accent-foreground text
- **User section:** Bottom of sidebar, avatar circle, name/email, sign-out button
- **Top bar:** Company selector only, minimal height

## Component Styles

### Buttons
- Default: `h-9 px-4`, rounded-md, `bg-primary text-white`, `hover:bg-primary/90`, `shadow-sm`
- Small: `h-8 px-3 text-xs`
- Large: `h-10 px-6`
- XL: `h-11 px-8 text-base`
- Outline: `border border-input bg-background hover:bg-muted`
- Ghost: `hover:bg-muted`
- Transition: `duration-150`

### Inputs
- `h-10`, rounded-md, `border border-input`, `bg-background`
- `px-3 py-2`, `md:text-sm`
- Focus: `ring-2 ring-ring ring-offset-2`
- With icons: `pl-9` for left icon padding

### Cards
- `rounded-lg border bg-card shadow-sm`
- Header: `p-6`, space-y-1.5
- Content: `p-6 pt-0`
- Stat cards: `rounded-md border p-5 shadow-sm`, `hover:shadow-md`, `transition-all duration-200`

### Tables
- Headers: `text-xs uppercase tracking-wider`, `py-2.5 px-4`, `border-b`
- Cells: `py-3 px-4`, `border-b border-border/50`
- Row hover: `bg-muted/40`

### Badges
- `rounded-full`, `px-2.5 py-0.5`, `text-xs font-semibold`
- Success: `bg-primary/10 text-primary`
- Warning: `bg-warning/10 text-warning`
- Pending: `bg-muted text-muted-foreground`

### Dialogs
- `max-w-lg`, `p-6`, `shadow-lg`, `sm:rounded-lg`
- Overlay: `bg-black/80`
- Close button: top-right, `rounded-sm`, X icon

### Login Page
- Centered, `max-w-sm`
- Logo: `w-12 h-12 rounded-lg bg-primary` icon
- Card: `bg-card border rounded-md p-6 shadow-sm`
- Labels: `text-xs font-medium`
- Inputs: `h-9 text-sm`, icon prefix

## Animations (Simple & Professional)
```css
/* fadeIn */
from { opacity: 0; } to { opacity: 1; }  /* 0.3s ease-out */

/* slideUp */
from { opacity: 0; transform: translateY(10px); }
to { opacity: 1; transform: translateY(0); }  /* 0.3s ease-out */

/* slideInLeft */
from { opacity: 0; transform: translateX(-10px); }
to { opacity: 1; transform: translateX(0); }  /* 0.2s ease-out */

/* pulse-subtle */
0%, 100% { opacity: 1; } 50% { opacity: 0.8; }  /* 2s ease-in-out infinite */
```

## Icons
- **Lucide React** (same library as current project)

## Key Design Differences from Current
1. **Greens:** Reference uses darker QB-green (HSL 145 63% 32% ~#1e8a50) vs current bright emerald (#10b981)
2. **Background:** Light gray (#f7f7f7) vs white (#ffffff)
3. **Font:** Inter vs Geist/Playfair
4. **Radius:** 6px vs 10px (much tighter)
5. **Sidebar:** White/light with left-border active state vs current styling
6. **Decorations:** Minimal vs elaborate (grain, glass, orbital, blueprint patterns)
7. **Shadows:** Subtle, defined scale vs varied/custom
8. **Dark mode grays:** Neutral blue-gray (220 13%) vs green-tinted
9. **Animations:** Simple fades/slides vs complex (shimmer, blur-reveal, etc.)
10. **Typography:** Single font (Inter) vs three fonts (Geist, Geist Mono, Playfair)
