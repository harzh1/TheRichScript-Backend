import express from 'express';
import { getDebts, createDebt, settleDebt, updateDebt, writeOffDebt } from '../controllers/debt.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createDebtSchema, settleDebtSchema, updateDebtSchema, debtIdParamSchema } from '../validations/debt.schema.js';
const router = express.Router();

router.use(protect);

router.route('/')
    .get(getDebts)
    .post(validate(createDebtSchema), createDebt);

router.route('/:id')
    .put(validate(updateDebtSchema), updateDebt);

router.route('/:id/settle')
    .put(validate(settleDebtSchema), settleDebt);

router.route('/:id/writeoff')
    .put(validate(debtIdParamSchema), writeOffDebt);

export default router;
