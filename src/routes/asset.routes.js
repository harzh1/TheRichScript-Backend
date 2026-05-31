import express from 'express';
import { getAssets, createAsset, updateAsset, deleteAsset } from '../controllers/asset.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getAssets)
    .post(createAsset);

router.route('/:id')
    .put(updateAsset)
    .delete(deleteAsset);

export default router;
