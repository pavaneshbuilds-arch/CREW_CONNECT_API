import catchAsync from '../utils/catchAsync.js';
import { created } from '../utils/apiResponse.js';
import { uploadService } from '../services/index.js';

class UploadController {
  create = catchAsync(async (req, res) => {
    const data = await uploadService.save({
      subjectType: req.auth.type,
      subjectId: req.auth.sub,
      purpose: req.body.purpose,
      file: req.file,
    });
    return created(res, data, { message: 'File uploaded' });
  });
}

export default new UploadController();
