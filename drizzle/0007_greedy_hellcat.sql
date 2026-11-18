ALTER TABLE "bank_account" ADD COLUMN "balance_as_of_date" date;
-- `balance` used to be read as the live balance. It is now the anchor: what the
-- account held at `balance_as_of_date`, with movements after that date added on
-- read. Accounts that have been imported have a balance that already contains
-- their transactions, so anchor them at their newest statement instead of
-- counting every row twice. Accounts never imported keep a null date, which
-- means their balance (an opening balance, usually) sits before every row.
UPDATE "bank_account" ba
SET "balance_as_of_date" = COALESCE(
  (
    SELECT bsi."statement_end_date"
    FROM "bank_statement_import" bsi
    WHERE bsi."bank_account_id" = ba."id"
      AND bsi."closing_balance" IS NOT NULL
    ORDER BY bsi."created_at" DESC
    LIMIT 1
  ),
  (
    SELECT max(bt."date")
    FROM "bank_transaction" bt
    WHERE bt."bank_account_id" = ba."id"
  )
)
WHERE ba."balance" <> 0
  AND EXISTS (
    SELECT 1 FROM "bank_statement_import" bsi WHERE bsi."bank_account_id" = ba."id"
  );
