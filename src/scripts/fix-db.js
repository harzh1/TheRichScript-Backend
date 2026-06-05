import prisma from '../config/db.js';

async function main() {
  console.log('Fixing PlannedExpense txType...');
  
  const plans = await prisma.plannedExpense.findMany({
    include: { category: true }
  });

  for (const plan of plans) {
    let newTxType = plan.txType;
    let newCategoryName = plan.category.name;

    if (newCategoryName.includes('||')) {
      const parts = newCategoryName.split('||');
      const prefix = parts[0];
      const name = parts[1] || prefix;

      if (prefix === 'INCOME') newTxType = 'INCOME';
      else if (prefix === 'SAVINGS' || prefix === 'TRANSFER') newTxType = 'TRANSFER';
      else newTxType = 'EXPENSE';

      newCategoryName = name;
    }

    // Fix txType on plan
    if (plan.txType !== newTxType) {
      await prisma.plannedExpense.update({
        where: { id: plan.id },
        data: { txType: newTxType }
      });
      console.log(`Updated plan ${plan.name} txType to ${newTxType}`);
    }

    // Fix category name if it has ||
    if (plan.category.name !== newCategoryName) {
      // Check if a category with the new name already exists for this user
      const existingCat = await prisma.userCategory.findFirst({
        where: { userId: plan.userId, name: newCategoryName }
      });

      if (existingCat && existingCat.id !== plan.categoryId) {
        // Point this plan to the existing category
        await prisma.plannedExpense.update({
          where: { id: plan.id },
          data: { categoryId: existingCat.id }
        });
        console.log(`Repointed plan ${plan.name} to existing category ${newCategoryName}`);
      } else {
        // Just rename the category
        await prisma.userCategory.update({
          where: { id: plan.categoryId },
          data: { name: newCategoryName }
        });
        console.log(`Renamed category ${plan.category.name} to ${newCategoryName}`);
      }
    }
  }

  // Also check all categories and clean up any remaining ||
  const allCats = await prisma.userCategory.findMany();
  for (const cat of allCats) {
    if (cat.name.includes('||')) {
      const parts = cat.name.split('||');
      const name = parts[1] || parts[0];
      
      const existingCat = await prisma.userCategory.findFirst({
        where: { userId: cat.userId, name: name }
      });

      if (existingCat && existingCat.id !== cat.id) {
        // Need to migrate all relations from cat to existingCat
        await prisma.transaction.updateMany({ where: { categoryId: cat.id }, data: { categoryId: existingCat.id } });
        await prisma.plannedExpense.updateMany({ where: { categoryId: cat.id }, data: { categoryId: existingCat.id } });
        await prisma.categoryLimit.updateMany({ where: { categoryId: cat.id }, data: { categoryId: existingCat.id } });
        await prisma.userCategory.delete({ where: { id: cat.id } });
        console.log(`Merged and deleted duplicate category ${cat.name}`);
      } else {
        await prisma.userCategory.update({ where: { id: cat.id }, data: { name: name } });
        console.log(`Renamed standalone category ${cat.name} to ${name}`);
      }
    }
  }

  console.log('Done!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
