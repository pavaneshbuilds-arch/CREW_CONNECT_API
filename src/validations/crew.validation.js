import Joi from 'joi';

const role = Joi.string().valid('waiter', 'supervisor', 'bouncer');
const gender = Joi.string().valid('male', 'female', 'other');

// Step 1 — Personal information
export const updatePersonal = {
  body: Joi.object({
    fullName: Joi.string().max(150),
    email: Joi.string().email().max(255).allow(null, ''),
    profilePhotoUrl: Joi.string().uri().max(2048).allow(null, ''),
    dateOfBirth: Joi.date().iso().less('now'),
    gender,
    city: Joi.string().max(100),
    currentAddress: Joi.string().max(1000),
  }).min(1),
};

// Step 2 — Work profile
export const updateWorkProfile = {
  body: Joi.object({
    primaryRole: role,
    yearsOfExperience: Joi.number().integer().min(0).max(80),
    languages: Joi.array().items(Joi.string().max(50)).max(30),
    skills: Joi.array().items(Joi.string().max(100)).max(50),
  }).min(1),
};

// Step 3 — Identity documents
export const upsertIdentityDocuments = {
  body: Joi.object({
    aadhaarNumber: Joi.string().pattern(/^\d{12}$/).messages({ 'string.pattern.base': 'aadhaarNumber must be 12 digits' }),
    aadhaarFrontUrl: Joi.string().uri().max(2048),
    aadhaarBackUrl: Joi.string().uri().max(2048),
    panNumber: Joi.string().pattern(/^[A-Z]{5}\d{4}[A-Z]$/).messages({ 'string.pattern.base': 'panNumber must be a valid PAN (e.g. ABCDE1234F)' }),
    panCardUrl: Joi.string().uri().max(2048),
  }).min(1),
};

// Bank details
export const upsertBankDetails = {
  body: Joi.object({
    accountHolderName: Joi.string().max(150).required(),
    accountNumber: Joi.string().pattern(/^\d{6,20}$/).required().messages({ 'string.pattern.base': 'accountNumber must be 6–20 digits' }),
    ifscCode: Joi.string().pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/).required().messages({ 'string.pattern.base': 'ifscCode must be a valid IFSC (e.g. HDFC0001234)' }),
    upiId: Joi.string().max(100).allow(null, ''),
  }),
};

export const addTimeOff = {
  body: Joi.object({
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
    reason: Joi.string().max(150).allow(null, ''),
  }),
};

export const timeOffParam = {
  params: Joi.object({ id: Joi.number().integer().positive().required() }),
};

export const setOnline = {
  body: Joi.object({
    isOnline: Joi.boolean().required(),
    latitude: Joi.number().min(-90).max(90),
    longitude: Joi.number().min(-180).max(180),
  }),
};

export const createEditRequest = {
  body: Joi.object({
    changedFields: Joi.object().min(1).required(),
  }),
};
