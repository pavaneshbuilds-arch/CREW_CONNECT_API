import Joi from 'joi';

export const uploadFile = {
  body: Joi.object({
    purpose: Joi.string().valid('profile_photo', 'aadhaar_front', 'aadhaar_back', 'pan_card', 'other').required(),
  }),
};
