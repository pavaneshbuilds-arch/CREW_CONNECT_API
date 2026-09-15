import catchAsync from '../utils/catchAsync.js';
import { success } from '../utils/apiResponse.js';
import { deviceService } from '../services/index.js';

class DeviceController {
  register = catchAsync(async (req, res) => {
    const tokens = req.body.pnids?.length ? req.body.pnids : [req.body.pnid];
    let current = null;
    for (const pnid of tokens) {
      current = await deviceService.register({
        subjectType: req.auth.type,
        subjectId: req.auth.sub,
        mid: req.body.mid,
        pnid,
        platform: req.body.platform,
        deviceName: req.body.deviceName,
        osVersion: req.body.osVersion,
        appVersion: req.body.appVersion,
      });
    }
    return success(res, current, { message: 'Device registered' });
  });
}

export default new DeviceController();
