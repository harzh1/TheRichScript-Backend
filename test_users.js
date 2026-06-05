import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.user.findMany({ select: { id: true, email: true, firstName: true } }).then(console.log).finally(() => prisma.$disconnect());
