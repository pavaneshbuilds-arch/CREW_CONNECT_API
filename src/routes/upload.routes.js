import { Router } from 'express';
import validate from '../middlewares/validate.js';
import { authenticate, requireType } from '../middlewares/auth.js';
import { handleUpload } from '../middlewares/upload.js';
import { makeLimiter } from '../middlewares/rateLimiter.js';
import * as schema from '../validations/upload.validation.js';
import { uploadController } from '../controllers/index.js';

const uploadLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 20,
  code: 'UPLOAD_RATE_LIMITED',
  message: 'Too many uploads. Wait a minute and try again.',
});

class UploadRoutes {
  constructor() {
    this.router = Router();
    this.router.use(authenticate, requireType('user', 'crew'), uploadLimiter);
    this.registerRoutes();
  }

  registerRoutes() {
    // Multipart: field "file" (image) + text field "purpose".
    this.router.post('/', handleUpload, validate(schema.uploadFile), uploadController.create);
  }
}

export default new UploadRoutes().router;
