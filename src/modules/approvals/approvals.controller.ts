import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/httpResponse';
import * as service from './approvals.service';

export const countHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.countPending(req.user!));
});
