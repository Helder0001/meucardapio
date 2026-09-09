-- Fluxo de recebimentos: taxa, valor líquido e data prevista de recebimento
-- por pagamento. Preenchidos só na confirmação (paidAt) — ver
-- lib/finance/compute-receipt.ts para as regras por método/provedor.
ALTER TABLE "Payment" ADD COLUMN "fee" DECIMAL(10,2);
ALTER TABLE "Payment" ADD COLUMN "netAmount" DECIMAL(10,2);
ALTER TABLE "Payment" ADD COLUMN "expectedReceiptDate" TIMESTAMP(3);
