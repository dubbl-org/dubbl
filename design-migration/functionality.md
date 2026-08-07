# Dubbl - Functionality Record

> This document records ALL existing functionality that MUST be preserved during the design migration. No behavioral changes allowed.

## Tech Stack
- **Framework:** Next.js 16.1.6 (App Router, React Server Components)
- **Language:** TypeScript 5
- **Database:** PostgreSQL + Drizzle ORM (43+ schema modules)
- **Auth:** NextAuth.js 5.0.0-beta.30 (credentials + Google + Apple OAuth, 2FA/TOTP)
- **Styling:** Tailwind CSS v4, shadcn/ui, Radix UI, Lucide icons
- **Animations:** motion/react (Framer Motion)
- **Forms:** Zod validation, react-hook-form patterns
- **Charts:** Recharts
- **Toasts:** Sonner
- **Payments:** Stripe (subscriptions, Connect)
- **Email:** Resend
- **Storage:** AWS S3
- **Background jobs:** Trigger.dev
- **Docs:** Fumadocs (MDX)
- **Package manager:** pnpm 10.30.3

## Routes & Pages

### Authentication (`/(auth)/`)
- Sign-in (email/password + OAuth)
- Sign-up with email verification
- Two-factor authentication (TOTP + backup codes)
- Session tracking and revocation

### Documentation (`/docs/`)
- Fumadocs MDX-based documentation site
- Table of contents, responsive layout

### API Routes (`/api/`)
- `/api/auth/` - NextAuth endpoints
- `/api/auth/providers-config` - Provider configuration
- Full REST API coverage for all modules

### Main Platform (protected routes)
- Dashboard
- All module pages (see Feature Modules below)

### Error Pages
- Custom 404 (not-found.tsx)

## Feature Modules (ALL must be preserved)

### 1. Core Accounting
- Double-entry bookkeeping, chart of accounts (hierarchical parent-child)
- Journal entries (draft/posted/void)
- General ledger with multi-currency
- Bank reconciliation + bank statement imports (CSV, TSV, QIF, OFX, QBO, MT940, MT942, BAI2, CAMT)
- Period locking, fiscal year management
- Tax rates (standard, blocked, partial_block, exempt, reverse_charge, no_vat, sales_tax_us)

### 2. Sales & Revenue
- Invoicing (standard, deposit, retainer; approval workflows)
- Quotes + quote-to-invoice conversion
- Credit notes
- Sales receipts (cash sales)
- Customer credit management (prepayments, overpayments)
- Payment tracking with multi-document allocation
- Recurring invoice automation with auto-send
- Dunning levels for overdue tracking

### 3. Purchasing & Payables
- Bills, purchase orders, debit notes
- Requisitions
- Landed costs allocation
- Goods receipts

### 4. Expenses
- Expense claims with approval workflows
- Receipt uploads
- Mileage tracking (configurable rates)
- Cost center allocation
- Tax-inclusive expense lines

### 5. Inventory Management
- Items with categories
- Multiple warehouses, stock tracking
- Serial number + lot tracking
- Inventory movements, transfers
- Assembly/BOM (Bill of Materials)
- Three cost methods: average, FIFO, standard cost
- Inventory variants

### 6. Payroll
- Employee management (salary, hourly, commission, milestone)
- Pay runs (regular, off-cycle, termination, bonus, correction)
- Deductions (pre-tax, post-tax, recurring, one-time)
- Bonuses (performance, signing, referral, holiday, spot, retention)
- Payroll item tracking
- Approval workflows
- Tax forms integration

### 7. Projects & Time Tracking
- Projects (status, priority, billing type: hourly/fixed/milestone/non-billable)
- Tasks (backlog, todo, in_progress, in_review, done, cancelled)
- Milestones
- Team members with roles
- Time entries, billable hours

### 8. CRM
- Pipeline management (customizable stages)
- Deals (probability, expected close dates)
- Activities (notes, emails, calls, meetings, tasks)
- Lead source tracking, win/loss

### 9. Financial Management
- Budgets with variance analysis (monthly, quarterly, etc.)
- Fixed assets with depreciation schedules
- Loans with amortization
- Revenue recognition/scheduling
- Accruals
- Tax configuration (VAT, GST, US sales tax)

### 10. Banking & Payments
- Bank account management
- Bank rules for auto-categorization
- Payment tracking (received/made)
- Payment methods (bank transfer, cash, check, card)
- Stripe integration
- Scheduled payments

### 11. Reporting
- 25+ financial reports (P&L, Balance Sheet, Cash Flow, etc.)
- Aged receivables/payables
- Saved reports, report scheduling with email
- Custom report builder (filters, grouping, date ranges)

### 12. Contacts
- Customer/supplier management
- Contact persons
- 1099/W-9 vendor tracking
- PEPPOL identifiers
- Multi-currency preferences, payment terms defaults

### 13. Administration
- Multi-org support
- Member roles (owner, admin, member)
- Custom roles with fine-grained permissions
- Teams
- Audit logging
- Notifications (in-app + email, digest batching, preferences)
- API key management
- Subscription/billing management (free/pro, seat-based, storage tiers)

### 14. Documents & Files
- Document templates, folders
- File uploads to S3
- Backup management

### 15. Integrations
- MCP (Model Context Protocol) OAuth 2.1 for AI agents
- REST API
- Webhooks
- Trigger.dev background jobs

## State Management
- NextAuth.js for auth sessions
- next-themes for dark/light mode
- React Server Components + server actions (no client state library)
- Drizzle ORM for data layer
- Zod for validation

## Current Design System (before migration)
- **Primary color:** Emerald green (#10b981, #059669, #047857)
- **Fonts:** Geist (sans), Geist Mono (mono), Playfair Display (display/headings)
- **Base radius:** 0.625rem (10px)
- **Light mode:** White bg (#ffffff), dark text (#0a0a0a)
- **Dark mode:** Dark green-tinted bg (#0a0d0b), light text (#f0fdf4)
- **Sidebar:** Fixed, dark-themed in dark mode
- **Component library:** shadcn/ui with emerald theming
- **Animations:** Elaborate (orbital rings, grain overlays, glass effects, gradient meshes, blueprint patterns, shimmer loaders, blur reveals)
- **Icons:** Lucide React
- **Dense table styling:** 0.8125rem body, 0.75rem headers
