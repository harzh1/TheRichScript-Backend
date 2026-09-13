-- ============================================================================
-- Full Multi-Currency Architecture Migration
-- ============================================================================
-- 1. Sanitize & constrain User country and currency to ISO standards
-- 2. Add currency to Asset with User backfill
-- 3. Add currency, exchangeRate, targetAmount, and baseAmount to Transaction
-- 4. Add currency to Debt, Goal, and PlannedExpense
-- ============================================================================

-- 1. Sanitize any existing country data longer than 2 characters
UPDATE "User"
SET "country" = CASE
    WHEN "country" = 'PHP' THEN 'PH'
    WHEN LENGTH("country") > 2 THEN UPPER(SUBSTRING("country" FROM 1 FOR 2))
    ELSE UPPER(COALESCE("country", 'IN'))
END;

UPDATE "User"
SET "currency" = UPPER(COALESCE(SUBSTRING("currency" FROM 1 FOR 3), 'INR'));

-- Constrain User table
ALTER TABLE "User" ALTER COLUMN "country" TYPE VARCHAR(2);
ALTER TABLE "User" ALTER COLUMN "country" SET DEFAULT 'IN';
ALTER TABLE "User" ALTER COLUMN "currency" TYPE VARCHAR(3);
ALTER TABLE "User" ALTER COLUMN "currency" SET DEFAULT 'INR';

-- 2. Asset currency
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) NOT NULL DEFAULT 'INR';

UPDATE "Asset" a
SET "currency" = COALESCE(u."currency", 'INR')
FROM "User" u
WHERE a."userId" = u."id";

-- 3. Transaction multi-currency fields
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) NOT NULL DEFAULT 'INR';
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "exchangeRate" DECIMAL(19, 6) NOT NULL DEFAULT 1.000000;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "targetAmount" DECIMAL(19, 4);
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "baseAmount" DECIMAL(19, 4) NOT NULL DEFAULT 0;

UPDATE "Transaction" t
SET "currency" = COALESCE(a."currency", 'INR'),
    "baseAmount" = t."amount",
    "exchangeRate" = 1.000000
FROM "Asset" a
WHERE t."assetId" = a."id";

-- Fallback for any transactions where assetId might not match
UPDATE "Transaction"
SET "baseAmount" = "amount"
WHERE "baseAmount" = 0;

-- 4. Debt currency
ALTER TABLE "Debt" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) NOT NULL DEFAULT 'INR';

UPDATE "Debt" d
SET "currency" = COALESCE(a."currency", 'INR')
FROM "Asset" a
WHERE d."assetId" = a."id";

-- 5. Goal currency
ALTER TABLE "Goal" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) NOT NULL DEFAULT 'INR';

UPDATE "Goal" g
SET "currency" = COALESCE(u."currency", 'INR')
FROM "User" u
WHERE g."userId" = u."id";

-- 6. PlannedExpense currency
ALTER TABLE "PlannedExpense" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) NOT NULL DEFAULT 'INR';

UPDATE "PlannedExpense" pe
SET "currency" = COALESCE(a."currency", 'INR')
FROM "Asset" a
WHERE pe."assetId" = a."id";
