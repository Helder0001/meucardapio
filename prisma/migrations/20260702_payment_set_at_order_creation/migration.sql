-- Marca pagamentos definidos no momento da criação do pedido (PDV/Mesa
-- com "pagar agora"), para esconder a opção de trocar forma de pagamento.
ALTER TABLE "Payment" ADD COLUMN "setAtOrderCreation" BOOLEAN NOT NULL DEFAULT false;
