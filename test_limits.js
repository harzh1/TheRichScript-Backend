import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const limits = await prisma.categoryLimit.findMany();
  console.log('Limits:', limits);
}
main().finally(() => prisma.$disconnect());
