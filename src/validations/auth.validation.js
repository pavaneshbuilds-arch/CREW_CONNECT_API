import Joi from 'joi';

// E.164-ish: optional +, 8–15 digits. Kept permissive for Indian + intl numbers.
const phoneNumber = Joi.string()
  .pattern(/^\+?[0-9]{8,15}$/)
  .messages({ 'string.pattern.base': 'phoneNumber must be 8–15 digits, optionally prefixed with +' });

const subjectType = Joi.string().valid('user', 'crew');

export const requestOtp = {
  body: Joi.object({
    phoneNumber: phoneNumber.required(),
    subjectType: subjectType.required(),
  }),
};

export const verifyOtp = {
  body: Joi.object({
    phoneNumber: phoneNumber.required(),
    subjectType: subjectType.required(),
    code: Joi.string()
      .pattern(/^[0-9]{4,8}$/)
      .required()
      .messages({ 'string.pattern.base': 'code must be 4–8 digits' }),
  }),
};

export const google = {
  body: Joi.object({
    idToken: Joi.string().required(),
  }),
};

export const adminLogin = {
  body: Joi.object({
    email: Joi.string().email({ tlds: { allow: false } }).required(),
    password: Joi.string().min(1).required(),
  }),
};

export const refresh = {
  body: Joi.object({
    refreshToken: Joi.string().required(),
  }),
};

export const logout = refresh;

export const registerApp = {
  body: Joi.object({
    mid: Joi.string().max(255).required(),
    platform: Joi.string().max(30),
    appVersion: Joi.string().max(50),
  }),
};

export const registerDevice = {
  body: Joi.object({
    mid: Joi.string().max(255).required(),
    pnid: Joi.string().max(512),
    pnids: Joi.array().items(Joi.string().max(512)).min(1),
    platform: Joi.string().max(30),
    deviceName: Joi.string().max(150),
    osVersion: Joi.string().max(50),
    appVersion: Joi.string().max(50),
  })
    .or('pnid', 'pnids')
    .messages({ 'object.missing': 'Provide pnid or pnids' }),
};
