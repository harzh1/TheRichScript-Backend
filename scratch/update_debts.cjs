const fs = require('fs');

// 1. Update debt.controller.js
const ctrlPath = 'c:\\\\Users\\\\ASUS\\\\Dev\\\\2026 Projects\\\\Finance Tool\\\\Finance Tool Backend\\\\src\\\\controllers\\\\debt.controller.js';
let ctrlContent = fs.readFileSync(ctrlPath, 'utf8');

const updateDebtFn = `
export const updateDebt = async (req, res) => {
    try {
        const { id } = req.params;
        const { assetId, type, person, personName, amount, dueDate } = req.body;
        const parsedAmount = amount !== undefined ? parseFloat(amount) : undefined;

        const result = await prisma.$transaction(async (tx) => {
            const oldDebt = await tx.debt.findUnique({ where: { id, userId: req.user.userId } });
            if (!oldDebt) throw new Error('Debt not found');

            const finalPersonName = person || personName;
            
            // Revert old asset balance
            if (oldDebt.assetId) {
                const oldAsset = await tx.asset.findUnique({ where: { id: oldDebt.assetId } });
                if (oldAsset) {
                    const revertBalance = oldDebt.type === 'LENT' ? oldAsset.value + oldDebt.amount : oldAsset.value - oldDebt.amount;
                    await tx.asset.update({ where: { id: oldDebt.assetId }, data: { value: revertBalance } });
                }
            }

            // Apply new asset balance
            const newType = type ? type.toUpperCase() : oldDebt.type;
            const newAmount = parsedAmount !== undefined ? parsedAmount : oldDebt.amount;
            const newAssetId = assetId || oldDebt.assetId;

            if (newAssetId) {
                const newAsset = await tx.asset.findUnique({ where: { id: newAssetId } });
                if (newAsset) {
                    const newBalance = newType === 'LENT' ? newAsset.value - newAmount : newAsset.value + newAmount;
                    await tx.asset.update({ where: { id: newAssetId }, data: { value: newBalance } });
                }
            }

            const updatedDebt = await tx.debt.update({
                where: { id },
                data: {
                    ...(newAssetId && { assetId: newAssetId }),
                    ...(newType && { type: newType }),
                    ...(finalPersonName && { personName: finalPersonName }),
                    ...(newAmount !== undefined && { amount: newAmount }),
                    ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {})
                }
            });

            return updatedDebt;
        });

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
`;

if (!ctrlContent.includes('export const updateDebt =')) {
    ctrlContent += updateDebtFn;
    fs.writeFileSync(ctrlPath, ctrlContent, 'utf8');
}

// 2. Update debt.routes.js
const routesPath = 'c:\\\\Users\\\\ASUS\\\\Dev\\\\2026 Projects\\\\Finance Tool\\\\Finance Tool Backend\\\\src\\\\routes\\\\debt.routes.js';
let routesContent = fs.readFileSync(routesPath, 'utf8');
if (!routesContent.includes('updateDebt')) {
    routesContent = routesContent.replace('createDebt, settleDebt', 'createDebt, settleDebt, updateDebt');
    routesContent = routesContent.replace(
        /.post\(createDebt\);/,
        `.post(createDebt);\n\nrouter.route('/:id')\n    .put(updateDebt);`
    );
    fs.writeFileSync(routesPath, routesContent, 'utf8');
}

// 3. Update DebtsView.jsx
const debtsViewPath = 'c:\\\\Users\\\\ASUS\\\\Dev\\\\2026 Projects\\\\Finance Tool\\\\Finance Tool Frontend\\\\src\\\\components\\\\views\\\\DebtsView.jsx';
let debtsViewContent = fs.readFileSync(debtsViewPath, 'utf8');
debtsViewContent = debtsViewContent.replace(/\{debt\.person\}/g, '{debt.personName}');
if (!debtsViewContent.includes('Edit3')) {
    debtsViewContent = debtsViewContent.replace(/import \{ Plus, Users, UserMinus, Handshake, Trash2 \} from 'lucide-react';/, "import { Plus, Users, UserMinus, Handshake, Trash2, Edit3 } from 'lucide-react';");
    debtsViewContent = debtsViewContent.replace(/const DebtsView = \(\{(.*?)\}\) => \{/, "const DebtsView = ({$1, openEditDebtModal}) => {");
    debtsViewContent = debtsViewContent.replace(
        /<button \n\s*onClick=\{\(\) => \{\n\s*if \(window\.confirm/,
        `<button \n                  onClick={() => openEditDebtModal(debt)}\n                  className="p-2 border-2 border-black font-black bg-white hover:bg-[#FFEA00] transition-colors"\n                  title="Edit Loan"\n                >\n                  <Edit3 size={20} strokeWidth={3} />\n                </button>\n              <button \n                  onClick={() => {\n                    if (window.confirm`
    );
    fs.writeFileSync(debtsViewPath, debtsViewContent, 'utf8');
}

// 4. Update AddDebtModal.jsx
const addDebtModalPath = 'c:\\\\Users\\\\ASUS\\\\Dev\\\\2026 Projects\\\\Finance Tool\\\\Finance Tool Frontend\\\\src\\\\components\\\\modals\\\\AddDebtModal.jsx';
let addDebtModalContent = fs.readFileSync(addDebtModalPath, 'utf8');
if (!addDebtModalContent.includes('debtToEdit')) {
    addDebtModalContent = addDebtModalContent.replace(/import React, \{ useState \} from 'react';/, "import React, { useState, useEffect } from 'react';");
    addDebtModalContent = addDebtModalContent.replace(/const AddDebtModal = \(\{ isOpen, onClose, onSave, assets \}\) => \{/, "const AddDebtModal = ({ isOpen, onClose, onSave, assets, debtToEdit }) => {");
    const useEffectStr = `
  useEffect(() => {
    if (debtToEdit) {
      setFormData({
        id: debtToEdit.id,
        type: debtToEdit.type,
        person: debtToEdit.personName,
        amount: debtToEdit.amount,
        dueDate: debtToEdit.dueDate ? new Date(debtToEdit.dueDate).toISOString().split('T')[0] : '',
        assetId: debtToEdit.assetId
      });
    } else {
      setFormData({ type: 'LENT', person: '', amount: '', dueDate: '', assetId: assets[0]?.id || '' });
    }
  }, [debtToEdit, isOpen, assets]);
`;
    addDebtModalContent = addDebtModalContent.replace(/const handleSubmit = \(e\) => \{/, useEffectStr + '\n  const handleSubmit = (e) => {');
    
    fs.writeFileSync(addDebtModalPath, addDebtModalContent, 'utf8');
}

// 5. Update App.jsx
const appPath = 'c:\\\\Users\\\\ASUS\\\\Dev\\\\2026 Projects\\\\Finance Tool\\\\Finance Tool Frontend\\\\src\\\\App.jsx';
let appContent = fs.readFileSync(appPath, 'utf8');
if (!appContent.includes('debtToEdit')) {
    appContent = appContent.replace(/const \[isSettleDebtModalOpen, setIsSettleDebtModalOpen\] = useState\(false\);/, "const [isSettleDebtModalOpen, setIsSettleDebtModalOpen] = useState(false);\n  const [debtToEdit, setDebtToEdit] = useState(null);");
    
    appContent = appContent.replace(
        /const handleAddDebt = async \(e, debtData\) => \{([\s\S]*?)api\.post\('\/debts', debtData\);([\s\S]*?)setIsAddDebtModalOpen\(false\);([\s\S]*?)\};/,
        `const handleAddDebt = async (e, debtData) => {$1if (debtData.id) {\n        await api.put(\`/debts/\${debtData.id}\`, debtData);\n      } else {\n        await api.post('/debts', debtData);\n      }$2setIsAddDebtModalOpen(false);\n      setDebtToEdit(null);$3};`
    );

    appContent = appContent.replace(
        /setIsAddDebtModalOpen=\{setIsAddDebtModalOpen\}/,
        `setIsAddDebtModalOpen={setIsAddDebtModalOpen}\n            openEditDebtModal={(debt) => { setDebtToEdit(debt); setIsAddDebtModalOpen(true); }}`
    );

    appContent = appContent.replace(
        /<AddDebtModal \n\s*isOpen=\{isAddDebtModalOpen\}\n\s*onClose=\{\(\) => setIsAddDebtModalOpen\(false\)\}/,
        `<AddDebtModal \n        isOpen={isAddDebtModalOpen}\n        onClose={() => { setIsAddDebtModalOpen(false); setDebtToEdit(null); }}\n        debtToEdit={debtToEdit}`
    );
    
    fs.writeFileSync(appPath, appContent, 'utf8');
}

console.log('Debts editing added successfully.');
