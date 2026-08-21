import Joi from 'joi';

export const adminSchemas = {
  sendPushNotification: Joi.object({
    title: Joi.string().trim().min(1).max(120).required(),
    message: Joi.string().trim().min(1).max(1000).required(),
    targetType: Joi.string().valid('GLOBAL', 'COUNTRY', 'COUNCIL').uppercase().required(),
    countryCode: Joi.string().trim().max(7).uppercase().when('targetType', {
      is: Joi.valid('COUNTRY', 'COUNCIL'), then: Joi.required(), otherwise: Joi.optional().allow(null, ''),
    }),
    councilId: Joi.number().integer().positive().when('targetType', {
      is: 'COUNCIL', then: Joi.required(), otherwise: Joi.optional().allow(null),
    }),
  }),
};
