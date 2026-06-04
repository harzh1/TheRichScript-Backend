import express from 'express';
import { getTransactions, createTransaction, deleteTransaction } from '../controllers/transaction.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { upload } from '../config/cloudinary.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createTransactionSchema, transactionIdParamSchema } from '../validations/transaction.schema.js';
const router = express.Router();

router.use(protect);

router.route('/')
    .get(getTransactions)
    .post(upload.single('receipt'), validate(createTransactionSchema), createTransaction);

router.route('/:id')
    .delete(validate(transactionIdParamSchema), deleteTransaction);

export default router;
