-- Robô de atendimento do WhatsApp (Automações do Chat).
-- Execute este arquivo inteiro de uma vez no SQL Editor do Neon.

-- ── Controle do robô por conversa ──────────────────────────────────────
ALTER TABLE "WhatsappChat" ADD COLUMN IF NOT EXISTS "botActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WhatsappChat" ADD COLUMN IF NOT EXISTS "awaitingAttendant" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WhatsappChat" ADD COLUMN IF NOT EXISTS "botState" TEXT;
ALTER TABLE "WhatsappChat" ADD COLUMN IF NOT EXISTS "botFallbackCount" INTEGER NOT NULL DEFAULT 0;

-- ── Configuração do robô (uma linha por tenant) ────────────────────────
CREATE TABLE IF NOT EXISTS "ChatbotSettings" (
  "id"                            TEXT NOT NULL,
  "tenantId"                      TEXT NOT NULL,
  "enabled"                       BOOLEAN NOT NULL DEFAULT false,

  "welcomeActive"                 BOOLEAN NOT NULL DEFAULT true,
  "welcomeMode"                   TEXT NOT NULL DEFAULT 'ALWAYS',
  "welcomeMessage"                TEXT NOT NULL DEFAULT 'Olá, tudo bem? Bem-vindo(a) à {nome_loja}. Como posso te ajudar hoje? 😊',

  "menuAutoSendActive"            BOOLEAN NOT NULL DEFAULT true,
  "menuAutoSendMessage"           TEXT NOT NULL DEFAULT '📋 Confira nosso cardápio completo aqui:
{link_cardapio}',

  "optionsMessage"                TEXT NOT NULL DEFAULT 'Você pode escolher uma opção:

1️⃣ Ver cardápio
2️⃣ Acompanhar pedido
3️⃣ Falar com atendente

Digite 1, 2 ou 3.',

  "fallbackActive"                BOOLEAN NOT NULL DEFAULT true,
  "fallbackMessage"               TEXT NOT NULL DEFAULT 'Não entendi muito bem 🤔

Você pode escolher uma opção:

1️⃣ Ver cardápio
2️⃣ Acompanhar pedido
3️⃣ Falar com atendente

Digite 1, 2 ou 3.',

  "attendantMessage"              TEXT NOT NULL DEFAULT 'Um atendente irá te atender em breve! 😊',
  "blockAutoTransferToAttendant"  BOOLEAN NOT NULL DEFAULT false,

  "closingCommandActive"          BOOLEAN NOT NULL DEFAULT true,
  "closingKeyword"                TEXT NOT NULL DEFAULT 'encerrar',
  "closingMessage"                TEXT NOT NULL DEFAULT 'Atendimento encerrado! Se precisar de algo, estou por aqui. 😊',

  "outOfHoursActive"              BOOLEAN NOT NULL DEFAULT true,
  "outOfHoursMessage"             TEXT NOT NULL DEFAULT 'Olá! No momento estamos fora do nosso horário de atendimento.

Nosso horário é de {horario_abertura} às {horario_fechamento}.

Assim que abrirmos, teremos prazer em te atender! 😊
Se preferir, pode enviar sua mensagem que respondemos assim que estivermos online.',

  "createdAt"                     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ChatbotSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatbotSettings_tenantId_key" ON "ChatbotSettings"("tenantId");

DO $$ BEGIN
  ALTER TABLE "ChatbotSettings" ADD CONSTRAINT "ChatbotSettings_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Mensagens automáticas por status do pedido (uma linha por evento) ─
CREATE TABLE IF NOT EXISTS "OrderStatusMessage" (
  "id"        TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL,
  "event"     TEXT NOT NULL,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "message"   TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OrderStatusMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrderStatusMessage_tenantId_event_key" ON "OrderStatusMessage"("tenantId", "event");
CREATE INDEX IF NOT EXISTS "OrderStatusMessage_tenantId_idx" ON "OrderStatusMessage"("tenantId");

DO $$ BEGIN
  ALTER TABLE "OrderStatusMessage" ADD CONSTRAINT "OrderStatusMessage_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
