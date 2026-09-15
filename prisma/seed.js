/**
 * Seeds an initial super admin so the admin web app can be logged into
 * immediately after setup. Idempotent: upserts by email.
 *
 * Run with: `node prisma/seed.js`
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pkg from '@prisma/client';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@crewconnect.local';
  const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
  const fullName = process.env.SEED_ADMIN_NAME || 'Super Admin';

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.admin.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, fullName, role: 'super_admin' },
  });

  console.log(`Seeded super admin: ${admin.email}`);

  const coupon = await prisma.coupon.upsert({
    where: { code: 'LUXURYLAUNCH' },
    update: {},
    create: {
      code: 'LUXURYLAUNCH',
      description: 'Luxury Launch Offer — Extra ₹1250 OFF',
      discountType: 'flat',
      discountValue: 1250,
      minSpend: 5000,
      isActive: true,
    },
  });

  console.log(`Seeded coupon: ${coupon.code}`);

  const percentCoupon = await prisma.coupon.upsert({
    where: { code: 'CREW50' },
    update: {},
    create: {
      code: 'CREW50',
      description: 'FLAT 50% OFF upto ₹1000',
      discountType: 'percentage',
      discountValue: 50,
      minSpend: 5000,
      maxDiscountAmount: 1000,
      maxUsesPerUser: 1,
      isActive: true,
    },
  });

  console.log(`Seeded coupon: ${percentCoupon.code}`);

  const defaultRates = [
    { role: 'waiter', rate: 800 },
    { role: 'supervisor', rate: 1000 },
    { role: 'bouncer', rate: 900 },
  ];
  for (const row of defaultRates) {
    await prisma.crewRateCard.upsert({
      where: { role: row.role },
      update: {},
      create: row,
    });
  }
  console.log('Seeded crew rate cards');

  const rangeCount = await prisma.supervisorStaffingRange.count();
  if (!rangeCount) {
    await prisma.supervisorStaffingRange.createMany({
      data: [
        { minWaiters: 5, maxWaiters: 10, supervisorCount: 1 },
        { minWaiters: 11, maxWaiters: 19, supervisorCount: 2 },
        { minWaiters: 20, maxWaiters: 29, supervisorCount: 3 },
        { minWaiters: 30, maxWaiters: 39, supervisorCount: 4 },
        { minWaiters: 40, maxWaiters: null, supervisorCount: 5 },
      ],
    });
    console.log('Seeded supervisor staffing ranges');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
