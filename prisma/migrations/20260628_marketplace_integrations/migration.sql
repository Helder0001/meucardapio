-- Migration: integração com marketplaces de delivery (iFood / 99Food)
-- Execute via: npx prisma db execute --file prisma/migrations/20260628_marketplace_integrations/migration.sql
-- Depois rode `npx prisma generate` para atualizar o client TypeScript.

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE "MarketplaceProvider" AS ENUM ('IFOOD', 'NINETYNINE_FOOD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MarketplaceConnectionStatus" AS ENUM ('PENDING', 'CONNECTED', 'DISCONNECTED', 'ERROR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MarketplaceOrderStatus" AS ENUM (
    'RECEIVED', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP',
    'DISPATCHED', 'CONCLUDED', 'CANCELLED', 'CANCELLATION_REQUESTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Tabela MarketplaceConnection
CREATE TABLE IF NOT EXISTS "MarketplaceConnection" (
  "id"                        TEXT NOT NULL,
  "tenantId"                  TEXT NOT NULL,
  "provider"                  "MarketplaceProvider" NOT NULL,
  "status"                    "MarketplaceConnectionStatus" NOT NULL DEFAULT 'PENDING',
  "externalMerchantId"        TEXT,
  "merchantName"              TEXT,
  "accessTokenEnc"            TEXT,
  "refreshTokenEnc"           TEXT,
  "tokenType"                 TEXT DEFAULT 'bearer',
  "scope"                     TEXT,
  "expiresAt"                 TIMESTAMP(3),
  "oauthState"                TEXT,
  "authorizationCodeVerifier" TEXT,
  "lastCatalogSyncAt"         TIMESTAMP(3),
  "lastCatalogSyncError"      TEXT,
  "autoAcceptOrders"          BOOLEAN NOT NULL DEFAULT false,
  "isOpen"                    BOOLEAN NOT NULL DEFAULT true,
  "lastPolledAt"              TIMESTAMP(3),
  "lastPollingError"          TEXT,
  "connectedAt"               TIMESTAMP(3),
  "connectedByUserId"         TEXT,
  "disconnectedAt"            TIMESTAMP(3),
  "revokedAt"                 TIMESTAMP(3),
  "createdAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                 TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MarketplaceConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceConnection_tenantId_provider_key"
  ON "MarketplaceConnection"("tenantId", "provider");
CREATE INDEX IF NOT EXISTS "MarketplaceConnection_tenantId_idx" ON "MarketplaceConnection"("tenantId");
CREATE INDEX IF NOT EXISTS "MarketplaceConnection_provider_status_idx" ON "MarketplaceConnection"("provider", "status");
CREATE INDEX IF NOT EXISTS "MarketplaceConnection_externalMerchantId_idx" ON "MarketplaceConnection"("externalMerchantId");

DO $$ BEGIN
  ALTER TABLE "MarketplaceConnection"
    ADD CONSTRAINT "MarketplaceConnection_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Tabela MarketplaceProductMapping
CREATE TABLE IF NOT EXISTS "MarketplaceProductMapping" (
  "id"             TEXT NOT NULL,
  "connectionId"   TEXT NOT NULL,
  "productId"      TEXT NOT NULL,
  "externalItemId" TEXT,
  "overridePrice"  DECIMAL(10,2),
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "lastSyncedAt"   TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MarketplaceProductMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceProductMapping_connectionId_productId_key"
  ON "MarketplaceProductMapping"("connectionId", "productId");
CREATE INDEX IF NOT EXISTS "MarketplaceProductMapping_connectionId_idx" ON "MarketplaceProductMapping"("connectionId");
CREATE INDEX IF NOT EXISTS "MarketplaceProductMapping_productId_idx" ON "MarketplaceProductMapping"("productId");

DO $$ BEGIN
  ALTER TABLE "MarketplaceProductMapping"
    ADD CONSTRAINT "MarketplaceProductMapping_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "MarketplaceConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "MarketplaceProductMapping"
    ADD CONSTRAINT "MarketplaceProductMapping_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Tabela MarketplaceOrder
CREATE TABLE IF NOT EXISTS "MarketplaceOrder" (
  "id"                   TEXT NOT NULL,
  "tenantId"              TEXT NOT NULL,
  "connectionId"          TEXT NOT NULL,
  "orderId"               TEXT,
  "provider"              "MarketplaceProvider" NOT NULL,
  "externalOrderId"       TEXT NOT NULL,
  "externalDisplayId"     TEXT,
  "status"                "MarketplaceOrderStatus" NOT NULL DEFAULT 'RECEIVED',
  "rawPayload"            JSONB NOT NULL,
  "acknowledgedEventIds"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "grossAmount"           DECIMAL(10,2),
  "commissionAmount"      DECIMAL(10,2),
  "netAmount"             DECIMAL(10,2),
  "deliveredBy"           TEXT,
  "receivedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt"           TIMESTAMP(3),
  "cancelledAt"           TIMESTAMP(3),
  "cancelReason"          TEXT,
  "syncError"             TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MarketplaceOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceOrder_orderId_key" ON "MarketplaceOrder"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceOrder_provider_externalOrderId_key"
  ON "MarketplaceOrder"("provider", "externalOrderId");
CREATE INDEX IF NOT EXISTS "MarketplaceOrder_tenantId_idx" ON "MarketplaceOrder"("tenantId");
CREATE INDEX IF NOT EXISTS "MarketplaceOrder_connectionId_idx" ON "MarketplaceOrder"("connectionId");
CREATE INDEX IF NOT EXISTS "MarketplaceOrder_status_idx" ON "MarketplaceOrder"("status");
CREATE INDEX IF NOT EXISTS "MarketplaceOrder_receivedAt_idx" ON "MarketplaceOrder"("receivedAt");

DO $$ BEGIN
  ALTER TABLE "MarketplaceOrder"
    ADD CONSTRAINT "MarketplaceOrder_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "MarketplaceOrder"
    ADD CONSTRAINT "MarketplaceOrder_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "MarketplaceConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "MarketplaceOrder"
    ADD CONSTRAINT "MarketplaceOrder_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
