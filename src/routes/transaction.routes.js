import express from 'express';
import { getTransactions, createTransaction, deleteTransaction } from '../controllers/transaction.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { upload } from '../config/cloudinary.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getTransactions)
    .post(upload.single('receipt'), createTransaction);

router.route('/:id')
    .delete(deleteTransaction);

export default router;
