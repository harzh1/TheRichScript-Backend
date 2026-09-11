import express from 'express';
import { register, login, getMe, updateProfile, updatePassword, updateAvatar, removeAvatar, deleteAccount, refreshTokenHandler, logoutHandler } from '../controllers/auth.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { uploadAvatar } from '../config/cloudinary.js';
import { validate } from '../middlewares/validate.middleware.js';
import { registerSchema, loginSchema, updateProfileSchema, updatePasswordSchema, refreshTokenSchema } from '../validations/auth.schema.js';

const router = express.Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/refresh-token', validate(refreshTokenSchema), refreshTokenHandler);
router.post('/refresh', validate(refreshTokenSchema), refreshTokenHandler);
router.post('/logout', logoutHandler);
router.get('/me', protect, getMe);
router.put('/profile', protect, validate(updateProfileSchema), updateProfile);
router.put('/avatar', protect, uploadAvatar.single('avatar'), updateAvatar);
router.delete('/avatar', protect, removeAvatar);
router.put('/password', protect, validate(updatePasswordSchema), updatePassword);
router.delete('/account', protect, deleteAccount);

export default router;