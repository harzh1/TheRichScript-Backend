import express from 'express';
import { getDebts, createDebt, settleDebt, updateDebt, writeOffDebt } from '../controllers/debt.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getDebts)
    .post(createDebt);

router.route('/:id')
    .put(updateDebt);

router.route('/:id/settle')
    .put(settleDebt);

router.route('/:id/writeoff')
    .put(writeOffDebt);

export default router;
