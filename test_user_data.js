import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({
    include: {
      goals: true,
      assets: true
    }
  });
  users.forEach(u => {
    console.log(`User: ${u.email} | Assets: ${u.assets.length} | Goals: ${u.goals.length}`);
  });
}
main().finally(() => prisma.$disconnect());
