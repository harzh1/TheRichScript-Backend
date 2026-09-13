import express from 'express';
import { getContacts, createContact, updateContact, deleteContact } from '../controllers/contact.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createContactSchema, updateContactSchema, contactIdParamSchema } from '../validations/contact.schema.js';

const router = express.Router();
router.use(protect);

router.route('/')
    .get(getContacts)
    .post(validate(createContactSchema), createContact);

router.route('/:id')
    .put(validate(updateContactSchema), updateContact)
    .delete(validate(contactIdParamSchema), deleteContact);

export default router;
