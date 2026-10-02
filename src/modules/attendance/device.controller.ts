import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/httpResponse';
import * as device from './device.service';

export const listDevicesHandler = asyncHandler(async (_req, res) => {
  sendOk(res, await device.listDevices());
});

export const updateDeviceHandler = asyncHandler(async (req, res) => {
  sendOk(res, await device.updateDevice(req.params.id, req.body));
});

export const listUnmappedHandler = asyncHandler(async (_req, res) => {
  sendOk(res, await device.listUnmappedPins());
});

export const mapPinHandler = asyncHandler(async (req, res) => {
  sendOk(res, await device.mapPinToEmployee(req.body));
});

export const reconcileHandler = asyncHandler(async (req, res) => {
  sendOk(res, await device.reconcile(req.body));
});
