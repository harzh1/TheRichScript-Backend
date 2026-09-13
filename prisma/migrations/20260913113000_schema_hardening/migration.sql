-- ============================================================================
-- Schema Hardening Migration
-- ============================================================================
-- This migration:
--   1. Converts all monetary Float columns to DECIMAL(19,4)
--   2. Merges CategoryLimit into UserCategory
--   3. Merges GoalImage into Goal (imageUrls text array)
--   4. Adds Contact, Notification, AuditLog tables
--   5. Adds DebtAction enum and linkedDebt FK on Transaction
--   6. Makes Transaction.categoryId and description nullable
--   7. Adds soft deletes (deletedAt) to User, Transaction, Asset, Debt
--   8. Adds updatedAt to Transaction, Debt, Goal, PlannedExpense, UserCategory
--   9. Adds User fields: isActive, lastLoginAt, emailVerifiedAt
--  10. Adds Debt fields: contactId, notes
--  11. Adds performance indexes
--  12. Adds CHECK constraints
-- ============================================================================

-- ─── 1. New Enums ───────────────────────────────────────────────────────────

CREATE TYPE "DebtAction" AS ENUM ('CREATE', 'SETTLE', 'PARTIAL_PAYMENT');
CREATE TYPE "NotificationType" AS ENUM ('DEBT_DUE', 'GOAL_MILESTONE', 'BUDGET_EXCEEDED', 'PLANNED_EXPENSE_DUE', 'SYSTEM');
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'PASSWORD_CHANGE', 'SETTLE_DEBT', 'FUND_GOAL');

-- ─── 2. User table enhancements ─────────────────────────────────────────────

ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- ─── 3. Float → Decimal(19,4) conversions ───────────────────────────────────

-- Asset
ALTER TABLE "Asset" ALTER COLUMN "value" TYPE DECIMAL(19,4);
ALTER TABLE "Asset" ALTER COLUMN "quantity" TYPE DECIMAL(19,4);
ALTER TABLE "Asset" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Transaction
ALTER TABLE "Transaction" ALTER COLUMN "amount" TYPE DECIMAL(19,4);
ALTER TABLE "Transaction" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Transaction" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Make categoryId nullable (transfers don't need categories)
ALTER TABLE "Transaction" ALTER COLUMN "categoryId" DROP NOT NULL;

-- Make description nullable
ALTER TABLE "Transaction" ALTER COLUMN "description" DROP NOT NULL;

-- Convert linkedDebtAction from text to enum
ALTER TABLE "Transaction" ALTER COLUMN "linkedDebtAction" TYPE "DebtAction" USING "linkedDebtAction"::"DebtAction";

-- Add linkedDebt FK
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_linkedDebtId_fkey" FOREIGN KEY ("linkedDebtId") REFERENCES "Debt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PlannedExpense
ALTER TABLE "PlannedExpense" ALTER COLUMN "amount" TYPE DECIMAL(19,4);
ALTER TABLE "PlannedExpense" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Goal
ALTER TABLE "Goal" ALTER COLUMN "targetAmount" TYPE DECIMAL(19,4);
ALTER TABLE "Goal" ALTER COLUMN "currentAmount" TYPE DECIMAL(19,4);
ALTER TABLE "Goal" ALTER COLUMN "recurringAmount" TYPE DECIMAL(19,4);
ALTER TABLE "Goal" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Debt
ALTER TABLE "Debt" ALTER COLUMN "amount" TYPE DECIMAL(19,4);
ALTER TABLE "Debt" ALTER COLUMN "settledAmount" TYPE DECIMAL(19,4);
ALTER TABLE "Debt" ADD COLUMN "notes" TEXT;
ALTER TABLE "Debt" ADD COLUMN "contactId" TEXT;
ALTER TABLE "Debt" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Debt" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- IncomeSource
ALTER TABLE "IncomeSource" ALTER COLUMN "expectedAmount" TYPE DECIMAL(19,4);

-- ─── 4. Merge CategoryLimit → UserCategory ──────────────────────────────────

ALTER TABLE "UserCategory" ADD COLUMN "monthlyLimit" DECIMAL(19,4);
ALTER TABLE "UserCategory" ADD COLUMN "yearlyLimit" DECIMAL(19,4);
ALTER TABLE "UserCategory" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Migrate existing CategoryLimit data into UserCategory
UPDATE "UserCategory" uc
SET "monthlyLimit" = cl."monthlyLimit",
    "yearlyLimit" = cl."yearlyLimit"
FROM "CategoryLimit" cl
WHERE cl."categoryId" = uc."id";

-- Drop the CategoryLimit table
DROP TABLE "CategoryLimit";

-- ─── 5. Merge GoalImage → Goal.imageUrls ────────────────────────────────────

ALTER TABLE "Goal" ADD COLUMN "imageUrls" TEXT[] DEFAULT '{}';

-- Migrate existing GoalImage data into Goal.imageUrls
UPDATE "Goal" g
SET "imageUrls" = sub.urls
FROM (
    SELECT "goalId", array_agg("url" ORDER BY "createdAt") AS urls
    FROM "GoalImage"
    GROUP BY "goalId"
) sub
WHERE g."id" = sub."goalId";

-- Drop the GoalImage table
DROP TABLE "GoalImage";

-- ─── 6. New Tables ──────────────────────────────────────────────────────────

-- Contact
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- Notification
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- AuditLog
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValues" JSONB,
    "newValues" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- ─── 7. Foreign Keys for new tables/columns ─────────────────────────────────

ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 8. Unique Constraints ──────────────────────────────────────────────────

CREATE UNIQUE INDEX "Contact_userId_name_key" ON "Contact"("userId", "name");

-- ─── 9. Performance Indexes ─────────────────────────────────────────────────

-- Asset
CREATE INDEX "Asset_userId_idx" ON "Asset"("userId");
CREATE INDEX "Asset_typeId_idx" ON "Asset"("typeId");

-- Transaction
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");
CREATE INDEX "Transaction_assetId_idx" ON "Transaction"("assetId");
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");

-- Debt
CREATE INDEX "Debt_userId_idx" ON "Debt"("userId");
CREATE INDEX "Debt_userId_status_idx" ON "Debt"("userId", "status");

-- Goal
CREATE INDEX "Goal_userId_idx" ON "Goal"("userId");
CREATE INDEX "Goal_userId_isPinned_idx" ON "Goal"("userId", "isPinned");

-- PlannedExpense
CREATE INDEX "PlannedExpense_userId_idx" ON "PlannedExpense"("userId");
CREATE INDEX "PlannedExpense_userId_nextDueDate_idx" ON "PlannedExpense"("userId", "nextDueDate");

-- IncomeSource
CREATE INDEX "IncomeSource_userId_idx" ON "IncomeSource"("userId");

-- UserCategory
CREATE INDEX "UserCategory_userId_idx" ON "UserCategory"("userId");

-- UserAssetType
CREATE INDEX "UserAssetType_userId_idx" ON "UserAssetType"("userId");

-- Contact
CREATE INDEX "Contact_userId_idx" ON "Contact"("userId");

-- Notification
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AuditLog
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- ─── 10. CHECK Constraints ──────────────────────────────────────────────────

-- Positive monetary amounts
ALTER TABLE "Transaction" ADD CONSTRAINT "transaction_amount_positive" CHECK (amount > 0);
ALTER TABLE "Debt" ADD CONSTRAINT "debt_amount_positive" CHECK (amount > 0);
ALTER TABLE "Debt" ADD CONSTRAINT "debt_settled_valid" CHECK ("settledAmount" >= 0 AND "settledAmount" <= amount);
ALTER TABLE "Goal" ADD CONSTRAINT "goal_amounts_valid" CHECK ("targetAmount" > 0 AND "currentAmount" >= 0);
ALTER TABLE "PlannedExpense" ADD CONSTRAINT "planned_expense_amount_positive" CHECK (amount > 0);

-- Transfer integrity: if toAssetId is set, it must differ from assetId (no self-transfers)
ALTER TABLE "Transaction" ADD CONSTRAINT "transaction_transfer_check" CHECK (
    "toAssetId" IS NULL OR "assetId" <> "toAssetId"
);

-- Category limit positivity
ALTER TABLE "UserCategory" ADD CONSTRAINT "category_limit_positive" CHECK (
    ("monthlyLimit" IS NULL OR "monthlyLimit" > 0) AND
    ("yearlyLimit" IS NULL OR "yearlyLimit" > 0)
);
