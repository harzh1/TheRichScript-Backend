-- Relax the transfer CHECK constraint.
-- The original was too strict — it required TRANSFER to always have toAssetId,
-- but goal funding uses TRANSFER without toAssetId (money goes to abstract goal pool).
-- New rule: only prevent self-transfers (assetId = toAssetId).

ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS "transaction_transfer_check";

ALTER TABLE "Transaction" ADD CONSTRAINT "transaction_transfer_check" CHECK (
    "toAssetId" IS NULL OR "assetId" <> "toAssetId"
);
