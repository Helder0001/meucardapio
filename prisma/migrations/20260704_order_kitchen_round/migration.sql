-- Permite reabrir pedidos de balcão/mesa já ENTREGUES para adicionar itens
-- sem duplicar o pedido: o pedido volta para PENDING no Kanban, e apenas os
-- itens da rodada atual (kitchenRound) aparecem no card, enquanto o total
-- e o histórico do pedido continuam completos.
ALTER TABLE "Order" ADD COLUMN "kitchenRound" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "kitchenRound" INTEGER NOT NULL DEFAULT 0;
