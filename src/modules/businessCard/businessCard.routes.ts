import { Router } from 'express';
import { updateCompanyProfileSchema } from '@ems/validation';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as c from './businessCard.controller';

const router = Router();
router.use(requireAuth);

// Everyone gets their OWN card + downloads (vCard / PDF) and can read company details.
router.get('/', c.myCardHandler);
router.get('/vcard', c.vcardHandler);
router.get('/pdf', c.cardPdfHandler);
router.get('/company', c.getCompanyHandler);
// Company details are configurable by Admin/Owner.
router.put('/company', authorize({ minOrgRole: 'Admin' }), validate({ body: updateCompanyProfileSchema }), c.updateCompanyHandler);

export default router;
