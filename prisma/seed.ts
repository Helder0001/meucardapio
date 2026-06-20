// prisma/seed.ts
//
// Popula o banco com dados de exemplo para desenvolvimento.
// Execute com: pnpm db:seed
//
// Cria:
// - 1 tenant de exemplo (Pizzaria do José)
// - 1 usuário admin
// - Categorias e produtos
// - Horários de funcionamento
// - PDV padrão

import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../lib/auth/password'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed...')

  // 1. Criar tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'pizzaria-do-jose' },
    update: {},
    create: {
      name: 'Pizzaria do José',
      slug: 'pizzaria-do-jose',
      plan: 'PRO',
      subscriptionStatus: 'ACTIVE',
      primaryColor: '#f97316',
      phone: '11999999999',
      email: 'contato@pizzariadojose.com',
    },
  })
  console.log('✅ Tenant criado:', tenant.name)

  // 2. Criar usuário admin
  const adminHash = await hashPassword('Admin@123')
  const admin = await prisma.user.upsert({
    where: { email_tenantId: { email: 'admin@pizzariadojose.com', tenantId: tenant.id } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'José Silva',
      email: 'admin@pizzariadojose.com',
      passwordHash: adminHash,
      role: 'TENANT_ADMIN',
    },
  })
  console.log('✅ Admin criado:', admin.email)

  // 3. Criar operador de exemplo
  const staffUserHash = await hashPassword('Garcom@123')
  await prisma.user.upsert({
    where: { email_tenantId: { email: 'staff@pizzariadojose.com', tenantId: tenant.id } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Carlos Operador',
      email: 'staff@pizzariadojose.com',
      passwordHash: staffUserHash,
      role: 'STAFF',
    },
  })

  // 4. Criar PDV
  const pdv = await prisma.pDV.upsert({
    where: { id: 'pdv-default' },
    update: {},
    create: {
      id: 'pdv-default',
      tenantId: tenant.id,
      name: 'Loja Principal',
      type: 'STORE',
    },
  })

  // 5. Horários de funcionamento
  const hours = [
    { dayOfWeek: 0, isOpen: false, openTime: '11:00', closeTime: '22:00' }, // Dom
    { dayOfWeek: 1, isOpen: true,  openTime: '11:00', closeTime: '23:00' }, // Seg
    { dayOfWeek: 2, isOpen: true,  openTime: '11:00', closeTime: '23:00' }, // Ter
    { dayOfWeek: 3, isOpen: true,  openTime: '11:00', closeTime: '23:00' }, // Qua
    { dayOfWeek: 4, isOpen: true,  openTime: '11:00', closeTime: '23:00' }, // Qui
    { dayOfWeek: 5, isOpen: true,  openTime: '11:00', closeTime: '00:00' }, // Sex
    { dayOfWeek: 6, isOpen: true,  openTime: '11:00', closeTime: '00:00' }, // Sáb
  ]
  for (const h of hours) {
    await prisma.businessHour.upsert({
      where: { tenantId_dayOfWeek: { tenantId: tenant.id, dayOfWeek: h.dayOfWeek } },
      update: h,
      create: { tenantId: tenant.id, ...h },
    })
  }

  // 6. Categorias
  const categories = [
    { name: 'Pizzas', description: 'Nossas deliciosas pizzas artesanais' },
    { name: 'Bebidas', description: 'Refrigerantes, sucos e cervejas' },
    { name: 'Sobremesas', description: 'Doces para finalizar bem' },
  ]
  const createdCategories: Record<string, string> = {}
  for (const [i, cat] of categories.entries()) {
    const created = await prisma.category.create({
      data: { tenantId: tenant.id, ...cat, sortOrder: i },
    })
    createdCategories[cat.name] = created.id
  }

  // 7. Produtos
  const pizzas = [
    { name: 'Pizza Margherita', description: 'Molho de tomate, mussarela e manjericão fresco', price: 42.90 },
    { name: 'Pizza Calabresa', description: 'Molho de tomate, mussarela, calabresa e cebola', price: 45.90 },
    { name: 'Pizza Quatro Queijos', description: 'Mussarela, gorgonzola, provolone e catupiry', price: 52.90, isFeatured: true },
    { name: 'Pizza Portuguesa', description: 'Mussarela, presunto, ovos, cebola e azeitona', price: 48.90 },
  ]

  for (const [i, pizza] of pizzas.entries()) {
    await prisma.product.create({
      data: {
        tenantId: tenant.id,
        categoryId: createdCategories['Pizzas'],
        ...pizza,
        sortOrder: i,
        isBestSeller: i === 0,
      },
    })
  }

  // Bebidas
  const drinks = [
    { name: 'Coca-Cola 350ml', price: 6.00 },
    { name: 'Água Mineral 500ml', price: 3.50 },
    { name: 'Suco de Laranja', price: 9.90 },
    { name: 'Cerveja Heineken 600ml', price: 18.00 },
  ]
  for (const [i, drink] of drinks.entries()) {
    await prisma.product.create({
      data: {
        tenantId: tenant.id,
        categoryId: createdCategories['Bebidas'],
        ...drink,
        sortOrder: i,
      },
    })
  }

  // 8. Mesas
  const tableData = [
    { number: 1, sector: 'Salão' },
    { number: 2, sector: 'Salão' },
    { number: 3, sector: 'Salão' },
    { number: 4, sector: 'Varanda' },
    { number: 5, sector: 'Varanda' },
  ]
  const { nanoid } = await import('nanoid')
  for (const table of tableData) {
    await prisma.table.create({
      data: {
        tenantId: tenant.id,
        pdvId: pdv.id,
        ...table,
        capacity: 4,
        qrCode: nanoid(16),
      },
    })
  }

  // 9. Cupom de exemplo
  await prisma.coupon.upsert({
    where: { code_tenantId: { code: 'BEMVINDO10', tenantId: tenant.id } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'BEMVINDO10',
      description: '10% de desconto para novos clientes',
      type: 'PERCENTAGE',
      value: 10,
      usageLimit: 100,
      isActive: true,
    },
  })

  console.log('✅ Seed concluído!')
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🔑 Acesse o painel em: http://localhost:3000/login')
  console.log('📧 Email: admin@pizzariadojose.com')
  console.log('🔐 Senha: Admin@123')
  console.log('🍕 Cardápio: http://localhost:3000/menu/pizzaria-do-jose')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    prisma.$disconnect()
    process.exit(1)
  })
