<p align="center">
  <img src="public/logo.svg" alt="dubbl logo" width="80" height="64" />
</p>
<h1 align="center">dubbl</h1>
<p align="center">Open source, double-entry bookkeeping for modern teams.</p>

<p align="center">
  <a href="/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" /></a>
  <a href="https://github.com/dubbl-org/dubbl/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/dubbl-org/dubbl" /></a>
  <a href="https://github.com/dubbl-org/dubbl/pulls"><img alt="PRs Welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" /></a>
</p>

---

dubbl is a full-featured, open-source alternative to Xero and QuickBooks. It is API-first, developer-friendly, and built for teams that want full control over their financial data.

## Features

- **Double-entry bookkeeping** - Chart of accounts, journal entries, bank reconciliation
- **Invoicing and quotes** - PDF generation, payment tracking, recurring invoices, credit notes
- **Bills and purchase orders** - Accounts payable, purchase requisitions, landed costs
- **Banking** - CSV import, bank reconciliation, scheduled transactions
- **Expense management** - Claims, receipt OCR, approval workflows, recurring expenses
- **Inventory** - Warehouses, stock takes, assembly/BOM, serial and lot tracking, valuation
- **Payroll** - Employees, contractors, pay runs, tax forms, timesheets, leave management
- **Projects** - Time tracking, milestones, tasks, billable hours
- **CRM** - Pipeline management, deals, analytics
- **Fixed assets** - Depreciation schedules, disposal tracking
- **Budgets** - Budget creation, variance analysis, budget vs actual
- **Tax** - Multi-jurisdiction tax rates, VAT returns, BAS, Schedule C, sales tax
- **25+ financial reports** - P&L, balance sheet, cash flow, aged receivables, and more
- **Multi-currency** - Exchange rates, currency conversion
- **Documents** - File management and storage
- **Audit trail** - Full audit log for compliance
- **API-first** - Complete REST API with API key management
- **MCP Server** - Connect any AI coding agent via Model Context Protocol (OAuth 2.1, paid plans)

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ (or use Docker)
- S3-compatible storage (optional, for file uploads)

### Installation

```bash
# Clone the repository
git clone https://github.com/dubbl-org/dubbl.git
cd dubbl

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/dubbl

# Auth
AUTH_SECRET=your-random-secret-here
AUTH_URL=http://localhost:3000

# Stripe (optional)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# S3 Storage (optional)
S3_BUCKET=dubbl-uploads
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_ENDPOINT=https://s3.amazonaws.com
```

### Database Setup

```bash
# Push schema to database
pnpm db:push

# Seed with demo data (optional)
pnpm db:seed
```

### Run

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

If you ran the seed script, log in with `demo@dubbl.dev` / `password123`.

## Tech Stack

- **Framework** - [Next.js](https://nextjs.org) (App Router)
- **Database** - [PostgreSQL](https://www.postgresql.org) with [Drizzle ORM](https://orm.drizzle.team)
- **Auth** - [NextAuth.js](https://next-auth.js.org)
- **UI** - [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- **Docs** - [Fumadocs](https://fumadocs.vercel.app)

## Self-Hosting

See the [Self-Hosting Guide](https://dubbl.dev/docs/self-hosting) for instructions on deploying dubbl with Docker.

## MCP Server

dubbl includes a built-in [Model Context Protocol](https://modelcontextprotocol.io) server that lets any MCP-compatible AI agent interact with your accounting data. The MCP server uses Streamable HTTP transport with OAuth 2.1 authentication and is available on Pro and Business plans.

Works with Claude Desktop, Claude Code, Cursor, Windsurf, VS Code Copilot, and any other MCP-enabled agent. Just point your client at:

```
https://dubbl.dev/api/mcp
```

See the [MCP documentation](https://dubbl.dev/docs/guides/mcp) for setup instructions for each client.

## Documentation

Full documentation is available at [dubbl.dev/docs](https://dubbl.dev/docs) or by running the app locally and visiting `/docs`.

## Contributing

We welcome contributions of all kinds: bug fixes, features, documentation, and tax regulation updates.

- Open an issue to report bugs or request features
- Submit a pull request with your changes
- Help keep tax information accurate by reporting outdated rules
- See the [Contributing Guide](https://dubbl.dev/docs/contributing) for details

## License

Licensed under the [Apache License 2.0](/LICENSE).
