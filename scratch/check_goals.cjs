const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const goals = await prisma.goal.findMany();
    console.log(goals.map(g => ({ name: g.name, imageUrl: g.imageUrl })));
}

main().finally(() => prisma.$disconnect());
