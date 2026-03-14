-- Multi-Stripe: remove single-account constraint, add label
DROP INDEX IF EXISTS stripe_integration_org_active_idx;
ALTER TABLE stripe_integration ADD COLUMN label text NOT NULL DEFAULT 'Default';
CREATE UNIQUE INDEX stripe_integration_account_active_idx
  ON stripe_integration (stripe_account_id) WHERE deleted_at IS NULL;

-- Low bank balance alerts
ALTER TABLE bank_account ADD COLUMN low_balance_threshold integer;

-- Budget variance alerts
ALTER TABLE budget ADD COLUMN variance_threshold_pct integer DEFAULT 100;

-- Revenue recognition account columns
ALTER TABLE revenue_schedule ADD COLUMN deferred_revenue_account_id uuid REFERENCES chart_account(id);
ALTER TABLE revenue_schedule ADD COLUMN revenue_account_id uuid REFERENCES chart_account(id);

-- New notification types
ALTER TYPE notification_type ADD VALUE 'webhook_exhausted';
ALTER TYPE notification_type ADD VALUE 'budget_exceeded';
ALTER TYPE notification_type ADD VALUE 'low_bank_balance';
