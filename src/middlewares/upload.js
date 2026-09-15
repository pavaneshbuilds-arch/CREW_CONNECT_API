import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { nanoid } from 'nanoid';
import config from '../config/env.js';
import ApiError from '../utils/apiError.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function uploadsRoot() {
  return path.resolve(process.cwd(), config.uploads.dir);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

ensureDir(uploadsRoot());

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest = path.join(uploadsRoot(), req.auth?.type || 'unknown', String(req.auth?.sub || '0'));
    try {
      ensureDir(dest);
      cb(null, dest);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const ext = EXT_BY_MIME[file.mimetype] || path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${nanoid(12)}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(ApiError.badRequest('Only JPEG, PNG, or WebP images are allowed', { code: 'INVALID_FILE_TYPE' }));
  }
  cb(null, true);
}

export const uploadSingle = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.uploads.maxFileBytes, files: 1 },
}).single('file');

/**
 * Wraps multer so LIMIT_FILE_SIZE becomes our JSON error envelope.
 */
export function handleUpload(req, res, next) {
  uploadSingle(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(
        ApiError.badRequest(`File too large. Max ${Math.floor(config.uploads.maxFileBytes / (1024 * 1024))} MB`, {
          code: 'FILE_TOO_LARGE',
        })
      );
    }
    if (err instanceof ApiError) return next(err);
    if (err.name === 'MulterError') {
      return next(ApiError.badRequest(err.message, { code: 'UPLOAD_FAILED' }));
    }
    return next(err);
  });
}

export { uploadsRoot };
