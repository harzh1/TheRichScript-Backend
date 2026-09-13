const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.findMany().then(u => console.log(u)).finally(() => prisma.$disconnect());
