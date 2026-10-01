import { Router } from 'express';
import { createAnnouncementSchema, updateAnnouncementSchema, idParamSchema } from '@ems/validation';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import * as c from './announcement.controller';

const router = Router();
router.use(requireAuth);

// Everyone can read; create/edit/delete are Admin/Owner (enforced in the service).
router.get('/', c.listHandler);
router.post('/', validate({ body: createAnnouncementSchema }), c.createHandler);
router.post('/read-all', c.markAllReadHandler);
router.patch('/:id', validate({ params: idParamSchema, body: updateAnnouncementSchema }), c.updateHandler);
router.delete('/:id', validate({ params: idParamSchema }), c.deleteHandler);
router.post('/:id/read', validate({ params: idParamSchema }), c.markReadHandler);

export default router;
