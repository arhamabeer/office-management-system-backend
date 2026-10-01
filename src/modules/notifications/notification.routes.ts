import { Router } from 'express';
import { listNotificationsQuerySchema, updateNotificationPrefsSchema, idParamSchema } from '@ems/validation';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import * as c from './notification.controller';

const router = Router();
router.use(requireAuth);

// Always scoped to the current user in the service.
router.get('/', validate({ query: listNotificationsQuerySchema }), c.listHandler);
router.get('/count', c.countHandler);
router.get('/preferences', c.getPrefsHandler);
router.patch('/preferences', validate({ body: updateNotificationPrefsSchema }), c.updatePrefsHandler);
router.post('/read-all', c.markAllReadHandler);
router.patch('/:id/read', validate({ params: idParamSchema }), c.markReadHandler);

export default router;
