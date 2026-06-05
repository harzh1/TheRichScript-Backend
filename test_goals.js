import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.goal.findMany().then(console.log).finally(() => prisma.$disconnect());
