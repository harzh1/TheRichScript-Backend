-- ============================================================================
-- Migration: Normalize Schema (V1-V5)
-- Creates: UserAssetType, GoalImage
-- Normalizes: Transaction.category, PlannedExpense.category, 
--             CategoryLimit.categoryName, Asset.type, Goal.imageUrls
-- ============================================================================

-- ─── Step 1: Create new lookup tables ────────────────────────────────────────

CREATE TABLE "UserAssetType" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAssetType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GoalImage" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "goalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserAssetType_userId_name_key" ON "UserAssetType"("userId", "name");

ALTER TABLE "UserAssetType" ADD CONSTRAINT "UserAssetType_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoalImage" ADD CONSTRAINT "GoalImage_goalId_fkey" 
    FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Step 2: Populate UserAssetType from existing Asset.type values ─────────

INSERT INTO "UserAssetType" ("id", "userId", "name")
SELECT gen_random_uuid(), a."userId", a."type"
FROM "Asset" a
GROUP BY a."userId", a."type"
ON CONFLICT ("userId", "name") DO NOTHING;

-- ─── Step 3: Add new FK columns (nullable initially) ────────────────────────

ALTER TABLE "Asset" ADD COLUMN "typeId" TEXT;

ALTER TABLE "Transaction" ADD COLUMN "categoryId" TEXT;

ALTER TABLE "PlannedExpense" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "PlannedExpense" ADD COLUMN "txType" "TransactionType" NOT NULL DEFAULT 'EXPENSE';

ALTER TABLE "CategoryLimit" ADD COLUMN "categoryId" TEXT;

-- ─── Step 4: Populate UserCategory from ALL existing category strings ───────

-- From Transaction.category
INSERT INTO "UserCategory" ("id", "userId", "name")
SELECT gen_random_uuid(), t."userId", UPPER(t."category")
FROM "Transaction" t
GROUP BY t."userId", UPPER(t."category")
ON CONFLICT ("userId", "name") DO NOTHING;

-- From CategoryLimit.categoryName
INSERT INTO "UserCategory" ("id", "userId", "name")
SELECT gen_random_uuid(), cl."userId", UPPER(cl."categoryName")
FROM "CategoryLimit" cl
GROUP BY cl."userId", UPPER(cl."categoryName")
ON CONFLICT ("userId", "name") DO NOTHING;

-- From PlannedExpense.category (handle the || encoding)
-- First, extract the actual category name (after || if present, otherwise the whole string)
INSERT INTO "UserCategory" ("id", "userId", "name")
SELECT gen_random_uuid(), pe."userId", 
    UPPER(
        CASE 
            WHEN pe."category" LIKE '%||%' THEN SPLIT_PART(pe."category", '||', 2)
            ELSE pe."category"
        END
    )
FROM "PlannedExpense" pe
GROUP BY pe."userId", 
    UPPER(
        CASE 
            WHEN pe."category" LIKE '%||%' THEN SPLIT_PART(pe."category", '||', 2)
            ELSE pe."category"
        END
    )
ON CONFLICT ("userId", "name") DO NOTHING;

-- ─── Step 5: Populate FK columns from lookup tables ─────────────────────────

-- Asset.typeId from UserAssetType
UPDATE "Asset" a
SET "typeId" = uat."id"
FROM "UserAssetType" uat
WHERE uat."userId" = a."userId" AND uat."name" = a."type";

-- Transaction.categoryId from UserCategory
UPDATE "Transaction" t
SET "categoryId" = uc."id"
FROM "UserCategory" uc
WHERE uc."userId" = t."userId" AND uc."name" = UPPER(t."category");

-- CategoryLimit.categoryId from UserCategory
UPDATE "CategoryLimit" cl
SET "categoryId" = uc."id"
FROM "UserCategory" uc
WHERE uc."userId" = cl."userId" AND uc."name" = UPPER(cl."categoryName");

-- PlannedExpense.categoryId + txType from UserCategory (handle || encoding)
UPDATE "PlannedExpense" pe
SET 
    "categoryId" = uc."id",
    "txType" = CASE 
        WHEN pe."category" LIKE 'INCOME%' THEN 'INCOME'::"TransactionType"
        WHEN pe."category" LIKE 'TRANSFER%' THEN 'EXPENSE'::"TransactionType"
        ELSE 'EXPENSE'::"TransactionType"
    END
FROM "UserCategory" uc
WHERE uc."userId" = pe."userId" 
    AND uc."name" = UPPER(
        CASE 
            WHEN pe."category" LIKE '%||%' THEN SPLIT_PART(pe."category", '||', 2)
            ELSE pe."category"
        END
    );

-- ─── Step 6: Migrate Goal.imageUrls → GoalImage rows ────────────────────────

INSERT INTO "GoalImage" ("id", "goalId", "url")
SELECT gen_random_uuid(), g."id", UNNEST(g."imageUrls")
FROM "Goal" g
WHERE array_length(g."imageUrls", 1) > 0;

-- ─── Step 7: Make FK columns required and add constraints ───────────────────

ALTER TABLE "Asset" ALTER COLUMN "typeId" SET NOT NULL;
ALTER TABLE "Transaction" ALTER COLUMN "categoryId" SET NOT NULL;
ALTER TABLE "PlannedExpense" ALTER COLUMN "categoryId" SET NOT NULL;
ALTER TABLE "CategoryLimit" ALTER COLUMN "categoryId" SET NOT NULL;

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_typeId_fkey" 
    FOREIGN KEY ("typeId") REFERENCES "UserAssetType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" 
    FOREIGN KEY ("categoryId") REFERENCES "UserCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlannedExpense" ADD CONSTRAINT "PlannedExpense_categoryId_fkey" 
    FOREIGN KEY ("categoryId") REFERENCES "UserCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop old unique constraint before adding new one
DROP INDEX IF EXISTS "CategoryLimit_userId_categoryName_key";

ALTER TABLE "CategoryLimit" ADD CONSTRAINT "CategoryLimit_categoryId_fkey" 
    FOREIGN KEY ("categoryId") REFERENCES "UserCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CategoryLimit_userId_categoryId_key" ON "CategoryLimit"("userId", "categoryId");

-- ─── Step 8: Drop old columns ───────────────────────────────────────────────

ALTER TABLE "Asset" DROP COLUMN "type";
ALTER TABLE "Transaction" DROP COLUMN "category";
ALTER TABLE "PlannedExpense" DROP COLUMN "category";
ALTER TABLE "CategoryLimit" DROP COLUMN "categoryName";
ALTER TABLE "Goal" DROP COLUMN "imageUrls";

-- ─── Step 9: Fix Goal.recurringFrequency from String to Frequency enum ──────

-- Create a temp column, copy data, drop old, rename
ALTER TABLE "Goal" ADD COLUMN "recurringFrequency_new" "Frequency";

UPDATE "Goal" 
SET "recurringFrequency_new" = "recurringFrequency"::"Frequency"
WHERE "recurringFrequency" IS NOT NULL;

ALTER TABLE "Goal" DROP COLUMN "recurringFrequency";
ALTER TABLE "Goal" RENAME COLUMN "recurringFrequency_new" TO "recurringFrequency";
