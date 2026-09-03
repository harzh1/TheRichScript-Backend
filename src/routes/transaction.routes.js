import express from 'express';
import { getTransactions, createTransaction, updateTransaction, deleteTransaction } from '../controllers/transaction.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { upload } from '../config/cloudinary.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createTransactionSchema, updateTransactionSchema, transactionIdParamSchema } from '../validations/transaction.schema.js';
const router = express.Router();

router.use(protect);

router.route('/')
    .get(getTransactions)
    .post(upload.single('receipt'), validate(createTransactionSchema), createTransaction);

router.route('/:id')
    .put(upload.single('receipt'), validate(updateTransactionSchema), updateTransaction)
    .delete(validate(transactionIdParamSchema), deleteTransaction);

export default router;
