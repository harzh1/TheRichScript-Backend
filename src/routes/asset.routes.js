import express from 'express';
import { getAssets, createAsset, updateAsset, deleteAsset } from '../controllers/asset.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createAssetSchema, updateAssetSchema, assetIdParamSchema } from '../validations/asset.schema.js';
const router = express.Router();

router.use(protect);

router.route('/')
    .get(getAssets)
    .post(validate(createAssetSchema), createAsset);

router.route('/:id')
    .put(validate(updateAssetSchema), updateAsset)
    .delete(validate(assetIdParamSchema), deleteAsset);

export default router;
