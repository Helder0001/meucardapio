# Patch para prisma/schema.prisma
# Adicione @default(0) nos seguintes campos Decimal para evitar NULL acidental:

# Model Order (~linha 350)
  subtotal      Decimal @db.Decimal(10, 2) @default(0)
  deliveryFee   Decimal @db.Decimal(10, 2) @default(0)
  discountAmount Decimal @db.Decimal(10, 2) @default(0)
  cashbackUsed  Decimal @db.Decimal(10, 2) @default(0)
  total         Decimal @db.Decimal(10, 2) @default(0)
  couponDiscount Decimal? @db.Decimal(10, 2)  # mantido nullable (opcional)
  changeFor     Decimal? @db.Decimal(10, 2)   # mantido nullable (opcional)

# Model OrderItem (~linha 400)
  productPrice  Decimal @db.Decimal(10, 2) @default(0)
  unitPrice     Decimal @db.Decimal(10, 2) @default(0)
  totalPrice    Decimal @db.Decimal(10, 2) @default(0)

# Model Payment (~linha 550)
  amount        Decimal @db.Decimal(10, 2) @default(0)
  changeAmount  Decimal? @db.Decimal(10, 2)  # mantido nullable
  refundAmount  Decimal? @db.Decimal(10, 2)  # mantido nullable

# Model Stock (~linha 280)
  quantity      Decimal @db.Decimal(10, 3) @default(0)
  minQuantity   Decimal? @db.Decimal(10, 3)  # mantido nullable

# Model StockMovement (~linha 300)
  quantity      Decimal @db.Decimal(10, 3) @default(0)
  balanceAfter  Decimal @db.Decimal(10, 3) @default(0)

# Model CashFlow (~linha 240)
  amount        Decimal @db.Decimal(10, 2) @default(0)

# Model Product (~linha 260)
  price         Decimal @db.Decimal(10, 2) @default(0)
  comparePrice  Decimal? @db.Decimal(10, 2)  # mantido nullable

# Model Addon (~linha 320)
  price         Decimal @db.Decimal(10, 2) @default(0)

# Model DeliveryZone (~linha 580)
  fee           Decimal @db.Decimal(10, 2) @default(0)
  freeAbove     Decimal? @db.Decimal(10, 2)  # mantido nullable
  minOrder      Decimal? @db.Decimal(10, 2)  # mantido nullable
  radiusKm      Decimal? @db.Decimal(6, 2)    # mantido nullable

# Model Coupon (~linha 600)
  value         Decimal @db.Decimal(10, 2) @default(0)
  minOrderValue Decimal? @db.Decimal(10, 2)  # mantido nullable
  maxDiscount   Decimal? @db.Decimal(10, 2)  # mantido nullable

# Model Subscription (~linha 120)
  amount        Decimal @db.Decimal(10, 2) @default(0)

# Model SubscriptionPayment (~linha 140)
  amount        Decimal @db.Decimal(10, 2) @default(0)

# Model LoyaltyConfig (~linha 620)
  pointsPerReal Decimal @db.Decimal(10, 2) @default(1)
  redeemValue   Decimal @db.Decimal(10, 2) @default(5)

# Model CashbackConfig (~linha 640)
  percentage    Decimal @db.Decimal(5, 2) @default(0)
  maxCashback   Decimal? @db.Decimal(10, 2)  # mantido nullable
  minOrderValue Decimal? @db.Decimal(10, 2)  # mantido nullable

# Model CashbackTransaction (~linha 660)
  amount        Decimal @db.Decimal(10, 2) @default(0)
  balance       Decimal @db.Decimal(10, 2) @default(0)

# Model MarketplaceOrder (~linha 750)
  grossAmount     Decimal? @db.Decimal(10, 2)  # mantido nullable (snapshot)
  commissionAmount Decimal? @db.Decimal(10, 2)  # mantido nullable
  netAmount       Decimal? @db.Decimal(10, 2)  # mantido nullable

# Model Customer (~linha 340)
  totalSpent      Decimal @db.Decimal(10, 2) @default(0)
  cashbackBalance Decimal @db.Decimal(10, 2) @default(0)
