import { Router } from 'express';
import {
  createTeamSchema,
  updateTeamSchema,
  teamMemberBodySchema,
  teamIdParamSchema,
  teamMemberParamSchema,
} from '@ems/validation';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import * as c from './team.controller';

const router = Router();
router.use(requireAuth);

// Fine-grained permissions (create / manage / delete) are enforced in the service.
router.get('/', c.listTeamsHandler);
router.post('/', validate({ body: createTeamSchema }), c.createTeamHandler);
router.get('/:id', validate({ params: teamIdParamSchema }), c.getTeamHandler);
router.patch('/:id', validate({ params: teamIdParamSchema, body: updateTeamSchema }), c.updateTeamHandler);
router.delete('/:id', validate({ params: teamIdParamSchema }), c.deleteTeamHandler);

router.post('/:id/members', validate({ params: teamIdParamSchema, body: teamMemberBodySchema }), c.addMemberHandler);
router.delete('/:id/members/:userId', validate({ params: teamMemberParamSchema }), c.removeMemberHandler);

export default router;
