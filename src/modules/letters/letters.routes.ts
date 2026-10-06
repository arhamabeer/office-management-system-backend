import { Router } from 'express';
import { letterSchema, updateLetterSchema, idParamSchema } from '@ems/validation';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as c from './letters.controller';

const router = Router();

// Letters are composed on the company letterhead — Owner/Admin only.
router.use(requireAuth);
router.use(authorize({ minOrgRole: 'Admin' }));

router.get('/', c.listHandler);
router.post('/', validate({ body: letterSchema }), c.createHandler);
router.get('/:id', validate({ params: idParamSchema }), c.getHandler);
router.get('/:id/pdf', validate({ params: idParamSchema }), c.pdfHandler);
router.patch('/:id', validate({ params: idParamSchema, body: updateLetterSchema }), c.updateHandler);
router.delete('/:id', validate({ params: idParamSchema }), c.deleteHandler);

export default router;
