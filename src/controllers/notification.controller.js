import catchAsync from '../utils/catchAsync.js';
import { success } from '../utils/apiResponse.js';
import { notificationService } from '../services/index.js';

class NotificationController {
  listForUser = catchAsync(async (req, res) => {
    const { items, meta } = await notificationService.listForRecipient('user', req.auth.sub, req.query);
    return success(res, items, { meta });
  });

  listForCrew = catchAsync(async (req, res) => {
    const { items, meta } = await notificationService.listForRecipient('crew', req.auth.sub, req.query);
    return success(res, items, { meta });
  });
}

export default new NotificationController();
