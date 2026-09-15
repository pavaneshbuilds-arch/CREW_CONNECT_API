import path from 'node:path';
import { prisma } from '../config/prisma.js';
import config from '../config/env.js';
import ApiError from '../utils/apiError.js';
import { uploadsRoot } from '../middlewares/upload.js';

const PURPOSES = new Set(['profile_photo', 'aadhaar_front', 'aadhaar_back', 'pan_card', 'other']);

class UploadService {
  async save({ subjectType, subjectId, purpose, file }) {
    if (subjectType !== 'user' && subjectType !== 'crew') {
      throw ApiError.forbidden('Uploads are only for user and crew apps', { code: 'FORBIDDEN_TYPE' });
    }
    if (!PURPOSES.has(purpose)) {
      throw ApiError.badRequest('Invalid purpose', { code: 'INVALID_PURPOSE' });
    }
    if (!file) {
      throw ApiError.badRequest('file field is required', { code: 'FILE_REQUIRED' });
    }

    const storageKey = path.relative(uploadsRoot(), file.path).split(path.sep).join('/');
    const url = `${config.uploads.publicBaseUrl}/uploads/${storageKey}`;

    const row = await prisma.uploadedFile.create({
      data: {
        subjectType,
        subjectId,
        purpose,
        originalName: file.originalname?.slice(0, 255),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey,
        url,
      },
    });

    return {
      id: row.id,
      purpose: row.purpose,
      url: row.url,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
    };
  }
}

export default new UploadService();
