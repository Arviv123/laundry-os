/**
 * LaundryOS Seed — נתוני הדגמה למכבסה
 * Creates: tenant, admin user, chart of accounts, services, demo customers, sample orders
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🧺 Seeding LaundryOS...');

  // ─── Tenant ────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { id: 'laundry-demo-tenant' },
    update: {},
    create: {
      id: 'laundry-demo-tenant',
      name: 'מכבסת הניצוץ',
      businessId: '516789012',
      address: {
        street: 'רחוב הרצל 42',
        city: 'תל אביב',
        zip: '6120001',
      },
      phone: '03-5551234',
      email: 'info@nitzutz-laundry.co.il',
      industry: 'LAUNDRY',
      isActive: true,
    },
  });
  console.log(`  ✓ Tenant: ${tenant.name} (${tenant.id})`);

  // ─── Admin User ────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Admin1234!', 12);
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@nitzutz.co.il' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@nitzutz.co.il',
      passwordHash,
      role: 'ADMIN',
      firstName: 'מנהל',
      lastName: 'ראשי',
    },
  });
  console.log(`  ✓ Admin: ${admin.email}`);

  // Counter staff
  const counter = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'counter@nitzutz.co.il' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'counter@nitzutz.co.il',
      passwordHash,
      role: 'COUNTER_STAFF',
      firstName: 'עובד',
      lastName: 'דלפק',
    },
  });
  console.log(`  ✓ Counter Staff: ${counter.email}`);

  // Driver
  const driver = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'driver@nitzutz.co.il' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'driver@nitzutz.co.il',
      passwordHash,
      role: 'DRIVER',
      firstName: 'נהג',
      lastName: 'משלוחים',
    },
  });
  console.log(`  ✓ Driver: ${driver.email}`);

  // ─── Chart of Accounts (Israeli Standard) ─────────────────────
  const accounts = [
    // Assets (נכסים)
    { code: '1100', name: 'קופה ראשית',          type: 'ASSET',     subType: 'CURRENT_ASSET' },
    { code: '1200', name: 'בנק לאומי',            type: 'ASSET',     subType: 'CURRENT_ASSET' },
    { code: '1300', name: 'לקוחות',               type: 'ASSET',     subType: 'CURRENT_ASSET' },
    { code: '1400', name: 'מלאי חומרי ניקוי',      type: 'ASSET',     subType: 'CURRENT_ASSET' },
    { code: '1500', name: 'ציוד ומכונות',          type: 'ASSET',     subType: 'FIXED_ASSET' },
    { code: '1510', name: 'פחת מצטבר',            type: 'ASSET',     subType: 'FIXED_ASSET' },

    // Liabilities (התחייבויות)
    { code: '2100', name: 'ספקים',                type: 'LIABILITY', subType: 'CURRENT_LIABILITY' },
    { code: '2200', name: 'מע"מ תשומות',          type: 'LIABILITY', subType: 'CURRENT_LIABILITY' },
    { code: '2300', name: 'מע"מ עסקאות',          type: 'LIABILITY', subType: 'CURRENT_LIABILITY' },
    { code: '2400', name: 'הלוואות',              type: 'LIABILITY', subType: 'LONG_TERM_LIABILITY' },
    { code: '2500', name: 'מקדמות לקוחות',        type: 'LIABILITY', subType: 'CURRENT_LIABILITY' },

    // Equity (הון עצמי)
    { code: '3100', name: 'הון עצמי',             type: 'EQUITY',    subType: 'EQUITY' },
    { code: '3200', name: 'רווח שוטף',            type: 'EQUITY',    subType: 'EQUITY' },

    // Revenue (הכנסות)
    { code: '4100', name: 'הכנסות מכביסה',        type: 'REVENUE',   subType: 'OPERATING_REVENUE' },
    { code: '4200', name: 'הכנסות מניקוי יבש',    type: 'REVENUE',   subType: 'OPERATING_REVENUE' },
    { code: '4300', name: 'הכנסות מגיהוץ',        type: 'REVENUE',   subType: 'OPERATING_REVENUE' },
    { code: '4400', name: 'הכנסות ממשלוחים',      type: 'REVENUE',   subType: 'OPERATING_REVENUE' },
    { code: '4500', name: 'הכנסות אחרות',         type: 'REVENUE',   subType: 'OPERATING_REVENUE' },

    // Expenses (הוצאות)
    { code: '5100', name: 'שכר עבודה',            type: 'EXPENSE',   subType: 'OPERATING_EXPENSE' },
    { code: '5200', name: 'חומרי ניקוי',           type: 'EXPENSE',   subType: 'OPERATING_EXPENSE' },
    { code: '5300', name: 'שכירות',               type: 'EXPENSE',   subType: 'OPERATING_EXPENSE' },
    { code: '5400', name: 'חשמל ומים',            type: 'EXPENSE',   subType: 'OPERATING_EXPENSE' },
    { code: '5500', name: 'תחזוקת ציוד',           type: 'EXPENSE',   subType: 'OPERATING_EXPENSE' },
    { code: '5600', name: 'דלק ומשלוחים',         type: 'EXPENSE',   subType: 'OPERATING_EXPENSE' },
    { code: '5700', name: 'פחת ציוד',             type: 'EXPENSE',   subType: 'OPERATING_EXPENSE' },
    { code: '5800', name: 'הוצאות הנהלה וכלליות', type: 'EXPENSE',   subType: 'OPERATING_EXPENSE' },
    { code: '5900', name: 'הוצאות שיווק ופרסום',  type: 'EXPENSE',   subType: 'OPERATING_EXPENSE' },
  ];

  for (const acc of accounts) {
    await prisma.account.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: acc.code } },
      update: {},
      create: {
        tenantId: tenant.id,
        code: acc.code,
        name: acc.name,
        type: acc.type as any,
        subType: acc.subType as any,
        isActive: true,
      },
    });
  }
  console.log(`  ✓ Chart of accounts: ${accounts.length} accounts`);

  // ─── Laundry Services ──────────────────────────────────────────
  const services = [
    { name: 'כביסה רגילה',      category: 'WASH',      basePrice: 25,  expressMultiplier: 1.5, estimatedMinutes: 120, sortOrder: 1 },
    { name: 'כביסה + גיהוץ',    category: 'WASH',      basePrice: 40,  expressMultiplier: 1.5, estimatedMinutes: 180, sortOrder: 2 },
    { name: 'ניקוי יבש',        category: 'DRY_CLEAN', basePrice: 55,  expressMultiplier: 2.0, estimatedMinutes: 240, sortOrder: 3 },
    { name: 'גיהוץ בלבד',       category: 'IRON',      basePrice: 15,  expressMultiplier: 1.5, estimatedMinutes: 30,  sortOrder: 4 },
    { name: 'קיפול בלבד',       category: 'FOLD',      basePrice: 10,  expressMultiplier: 1.0, estimatedMinutes: 15,  sortOrder: 5 },
    { name: 'כביסה לפי משקל',   category: 'WASH',      basePrice: 30,  expressMultiplier: 1.5, estimatedMinutes: 120, sortOrder: 6, pricePerKg: 12 },
    { name: 'ניקוי חליפה',      category: 'DRY_CLEAN', basePrice: 80,  expressMultiplier: 2.0, estimatedMinutes: 360, sortOrder: 7 },
    { name: 'ניקוי שמלת ערב',   category: 'DRY_CLEAN', basePrice: 90,  expressMultiplier: 2.0, estimatedMinutes: 360, sortOrder: 8 },
    { name: 'ניקוי וילונות',    category: 'SPECIAL',   basePrice: 120, expressMultiplier: 1.5, estimatedMinutes: 480, sortOrder: 9 },
    { name: 'ניקוי מצעים',      category: 'WASH',      basePrice: 35,  expressMultiplier: 1.5, estimatedMinutes: 120, sortOrder: 10 },
  ];

  const createdServices = [];
  for (const svc of services) {
    const created = await prisma.laundryService.upsert({
      where: { id: `svc-${svc.sortOrder}` },
      update: {},
      create: {
        id: `svc-${svc.sortOrder}`,
        tenantId: tenant.id,
        name: svc.name,
        category: svc.category as any,
        basePrice: svc.basePrice,
        expressMultiplier: svc.expressMultiplier,
        estimatedMinutes: svc.estimatedMinutes,
        sortOrder: svc.sortOrder,
        pricePerKg: svc.pricePerKg ?? null,
        isActive: true,
      },
    });
    createdServices.push(created);
  }
  console.log(`  ✓ Services: ${services.length} laundry services`);

  // ─── Demo Customers ────────────────────────────────────────────
  const customers = [
    { name: 'דנה כהן',     email: 'dana@example.com',   phone: '054-1234567', type: 'B2C' },
    { name: 'יוסי לוי',     email: 'yossi@example.com',  phone: '052-7654321', type: 'B2C' },
    { name: 'מלון הילטון',  email: 'hilton@example.com', phone: '03-5559000',  type: 'B2B' },
    { name: 'רבקה אברהם',  email: 'rivka@example.com',  phone: '058-1112222', type: 'B2C' },
    { name: 'מסעדת השף',    email: 'chef@example.com',   phone: '03-5553333',  type: 'B2B' },
  ];

  const createdCustomers = [];
  for (const cust of customers) {
    const created = await prisma.customer.upsert({
      where: { id: `cust-${cust.email.split('@')[0]}` },
      update: {},
      create: {
        id: `cust-${cust.email.split('@')[0]}`,
        tenantId: tenant.id,
        name: cust.name,
        email: cust.email,
        phone: cust.phone,
        type: cust.type as any,
        status: 'ACTIVE',
        metadata: {},
      },
    });
    createdCustomers.push(created);
  }
  console.log(`  ✓ Customers: ${customers.length} demo customers`);

  // ─── Machines ──────────────────────────────────────────────────
  const machines = [
    { name: 'מכונת כביסה 1',  type: 'WASHER', capacity: 12 },
    { name: 'מכונת כביסה 2',  type: 'WASHER', capacity: 12 },
    { name: 'מכונת כביסה 3',  type: 'WASHER', capacity: 20 },
    { name: 'מייבש 1',        type: 'DRYER',  capacity: 15 },
    { name: 'מייבש 2',        type: 'DRYER',  capacity: 15 },
    { name: 'מגהץ תעשייתי',   type: 'IRONER', capacity: 0 },
    { name: 'מקפלת',          type: 'FOLDER', capacity: 0 },
  ];

  for (const machine of machines) {
    await prisma.machine.create({
      data: {
        tenantId: tenant.id,
        name: machine.name,
        type: machine.type as any,
        capacity: machine.capacity,
        status: 'AVAILABLE',
        totalCycles: Math.floor(Math.random() * 500),
      },
    });
  }
  console.log(`  ✓ Machines: ${machines.length} machines`);

  // ─── Sample Orders ─────────────────────────────────────────────
  const sampleOrders = [
    {
      customer: createdCustomers[0],
      items: [
        { service: createdServices[0], description: 'חולצה לבנה', category: 'SHIRT', qty: 3 },
        { service: createdServices[3], description: 'מכנסיים', category: 'PANTS', qty: 2 },
      ],
      status: 'READY',
    },
    {
      customer: createdCustomers[1],
      items: [
        { service: createdServices[2], description: 'חליפה שחורה', category: 'SUIT', qty: 1 },
      ],
      status: 'WASHING',
    },
    {
      customer: createdCustomers[2],
      items: [
        { service: createdServices[9], description: 'מצעים לבנים', category: 'BEDDING', qty: 20 },
        { service: createdServices[8], description: 'וילונות', category: 'CURTAIN', qty: 5 },
      ],
      status: 'RECEIVED',
    },
  ];

  for (let i = 0; i < sampleOrders.length; i++) {
    const { customer, items, status } = sampleOrders[i];
    const orderNumber = `ORD-2026-${String(i + 1).padStart(4, '0')}`;

    let subtotal = 0;
    const itemsData = items.map((item, idx) => {
      const unitPrice = Number(item.service.basePrice);
      const lineTotal = unitPrice * item.qty;
      subtotal += lineTotal;
      return {
        serviceId: item.service.id,
        description: item.description,
        category: item.category as any,
        quantity: item.qty,
        unitPrice,
        lineTotal,
        barcode: `${orderNumber}-${String(idx + 1).padStart(2, '0')}`,
        status: 'ITEM_RECEIVED' as const,
      };
    });

    const vatAmount = subtotal * 0.18;
    const total = subtotal + vatAmount;

    await prisma.laundryOrder.create({
      data: {
        tenantId: tenant.id,
        orderNumber,
        customerId: customer.id,
        status: status as any,
        priority: 'NORMAL',
        source: 'STORE',
        receivedById: counter.id,
        subtotal,
        vatAmount,
        total,
        deliveryType: 'STORE_PICKUP',
        deliveryFee: 0,
        statusHistory: [
          { status: 'RECEIVED', changedAt: new Date(), changedBy: counter.id, note: 'הזמנה נקלטה' },
        ],
        items: { create: itemsData },
      },
    });
  }
  console.log(`  ✓ Orders: ${sampleOrders.length} sample orders`);

  console.log('\n✅ LaundryOS seed complete!');
  console.log('   Login: admin@nitzutz.co.il / Admin1234!');
  console.log(`   Tenant ID: ${tenant.id}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
