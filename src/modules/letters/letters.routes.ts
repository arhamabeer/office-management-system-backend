import { Router } from 'express';
import {
  letterTemplateSchema,
  updateLetterTemplateSchema,
  renderLetterSchema,
  emailLetterSchema,
  idParamSchema,
} from '@ems/validation';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as c from './letters.controller';

const router = Router();

// Letters are composed on the company letterhead — Owner/Admin only.
router.use(requireAuth);
router.use(authorize({ minOrgRole: 'Admin' }));

// Reusable templates (the "saved" list).
router.get('/templates', c.listTemplatesHandler);
router.post('/templates', validate({ body: letterTemplateSchema }), c.createTemplateHandler);
router.get('/templates/:id', validate({ params: idParamSchema }), c.getTemplateHandler);
router.patch('/templates/:id', validate({ params: idParamSchema, body: updateLetterTemplateSchema }), c.updateTemplateHandler);
router.delete('/templates/:id', validate({ params: idParamSchema }), c.deleteTemplateHandler);

// Produce a filled letter for one recipient (not persisted).
router.post('/render', validate({ body: renderLetterSchema }), c.renderHandler);
router.post('/email', validate({ body: emailLetterSchema }), c.emailHandler);

export default router;
