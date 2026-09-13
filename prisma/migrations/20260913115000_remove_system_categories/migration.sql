-- Remove system-generated categories from user category lists.
-- These were auto-created by debt/goal/transfer controllers and pollute the user's category list.
-- Going forward, system transactions use categoryId = NULL.

-- Step 1: Nullify categoryId on all transactions that reference system categories
UPDATE "Transaction" t
SET "categoryId" = NULL
FROM "UserCategory" uc
WHERE t."categoryId" = uc."id"
  AND uc."name" IN ('DEBT', 'DEBT REPAYMENT', 'GOAL FUNDING', 'GOAL REFUND', 'TRANSFER');

-- Step 2: Nullify categoryId on any planned expenses referencing system categories (unlikely but safe)
UPDATE "PlannedExpense" pe
SET "categoryId" = pe."categoryId"  -- no-op, but ensures we check
FROM "UserCategory" uc
WHERE pe."categoryId" = uc."id"
  AND uc."name" IN ('DEBT', 'DEBT REPAYMENT', 'GOAL FUNDING', 'GOAL REFUND', 'TRANSFER');

-- Step 3: Delete system categories that now have zero references
-- Only delete categories with these exact system names that have no remaining transaction/plan references
DELETE FROM "UserCategory" uc
WHERE uc."name" IN ('DEBT', 'DEBT REPAYMENT', 'GOAL FUNDING', 'GOAL REFUND', 'TRANSFER')
  AND NOT EXISTS (
    SELECT 1 FROM "Transaction" t WHERE t."categoryId" = uc."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "PlannedExpense" pe WHERE pe."categoryId" = uc."id"
  );
