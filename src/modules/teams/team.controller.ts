import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/httpResponse';
import * as service from './team.service';

export const listTeamsHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.listTeams(req.user!));
});

export const createTeamHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.createTeam(req.user!, req.body), 201);
});

export const getTeamHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.getTeam(req.user!, req.params.id));
});

export const updateTeamHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.updateTeam(req.user!, req.params.id, req.body));
});

export const deleteTeamHandler = asyncHandler(async (req, res) => {
  await service.deleteTeam(req.user!, req.params.id);
  sendOk(res, { success: true });
});

export const addMemberHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.addMember(req.user!, req.params.id, req.body.userId));
});

export const removeMemberHandler = asyncHandler(async (req, res) => {
  sendOk(res, await service.removeMember(req.user!, req.params.id, req.params.userId));
});
