-- Conexões de pagamento dos tenants: Stripe Connect (OAuth) e Efí Bank
-- (credenciais cadastradas manualmente) — ao lado do MercadoPagoConnection
-- já existente.

CREATE TABLE "StripeConnection" (
  "id"                TEXT NOT NULL,
  "tenantId"          TEXT NOT NULL,
  "stripeUserId"      TEXT NOT NULL,
  "publishableKey"    TEXT,
  "accessTokenEnc"    TEXT NOT NULL,
  "refreshTokenEnc"   TEXT,
  "scope"             TEXT,
  "livemode"          BOOLEAN NOT NULL DEFAULT true,
  "connectedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "connectedByUserId" TEXT,
  "revokedAt"         TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StripeConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StripeConnection_tenantId_key" ON "StripeConnection"("tenantId");
CREATE INDEX "StripeConnection_tenantId_idx" ON "StripeConnection"("tenantId");
CREATE INDEX "StripeConnection_stripeUserId_idx" ON "StripeConnection"("stripeUserId");

ALTER TABLE "StripeConnection" ADD CONSTRAINT "StripeConnection_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "EfiConnection" (
  "id"                TEXT NOT NULL,
  "tenantId"          TEXT NOT NULL,
  "clientIdEnc"       TEXT NOT NULL,
  "clientSecretEnc"   TEXT NOT NULL,
  "accountIdentifier" TEXT,
  "sandbox"           BOOLEAN NOT NULL DEFAULT true,
  "connectedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "connectedByUserId" TEXT,
  "revokedAt"         TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EfiConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EfiConnection_tenantId_key" ON "EfiConnection"("tenantId");
CREATE INDEX "EfiConnection_tenantId_idx" ON "EfiConnection"("tenantId");

ALTER TABLE "EfiConnection" ADD CONSTRAINT "EfiConnection_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
