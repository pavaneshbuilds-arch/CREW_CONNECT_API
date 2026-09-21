import Joi from 'joi';

const phoneNumber = Joi.string()
  .pattern(/^\+?[0-9]{8,15}$/)
  .messages({ 'string.pattern.base': 'phoneNumber must be 8–15 digits, optionally prefixed with +' });

const emptyToNull = Joi.string().allow('', null);

export const updateMe = {
  body: Joi.object({
    fullName: Joi.string().max(150),
    email: Joi.string().email({ tlds: { allow: false } }).max(255).allow('', null),
    profilePhotoUrl: Joi.string().uri().max(2048).allow('', null),
    locationAccessEnabled: Joi.boolean(),
    pushNotificationsEnabled: Joi.boolean(),
    marketingOptIn: Joi.boolean(),
  }).min(1),
};

export const verifyPhone = {
  body: Joi.object({
    phoneNumber: phoneNumber.required(),
    code: Joi.string()
      .pattern(/^[0-9]{4,8}$/)
      .required()
      .messages({ 'string.pattern.base': 'code must be 4–8 digits' }),
  }),
};

const addressFields = {
  houseFlatNumber: emptyToNull.max(50),
  pincode: emptyToNull.max(10),
  apartmentBuilding: emptyToNull.max(150),
  contactNumber: Joi.alternatives().try(phoneNumber, Joi.string().valid('', null)),
  floorNumber: emptyToNull.max(20),
  landmark: emptyToNull.max(150),
  addressType: Joi.string().valid('home', 'work', 'other'),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
  isDefault: Joi.boolean(),
};

export const createAddress = {
  body: Joi.object(addressFields).min(1),
};

export const updateAddress = {
  params: Joi.object({
    id: Joi.number().integer().positive().required(),
  }),
  body: Joi.object(addressFields).min(1),
};

export const addressParam = {
  params: Joi.object({
    id: Joi.number().integer().positive().required(),
  }),
};

export const searchPlaces = {
  query: Joi.object({
    q: Joi.string().trim().min(2).max(200).required(),
    limit: Joi.number().integer().min(1).max(10).default(8),
  }),
};
