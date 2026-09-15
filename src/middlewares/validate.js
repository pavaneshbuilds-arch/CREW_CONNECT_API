/**
 * Validates the request against a Joi schema map of the shape
 * { body, query, params }. Validated/coerced values replace the originals so
 * downstream handlers work with clean, typed data.
 */
export default function validate(schema) {
  return (req, res, next) => {
    const parts = ['body', 'query', 'params'];
    for (const part of parts) {
      if (!schema[part]) continue;
      const { error, value } = schema[part].validate(req[part], {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
      });
      if (error) return next(error);
      // Express 5 exposes req.query as a getter; replace the property so Joi
      // defaults/coercion (page, limit, booleans) actually reach controllers.
      try {
        req[part] = value;
      } catch {
        Object.defineProperty(req, part, { value, writable: true, configurable: true, enumerable: true });
      }
    }
    return next();
  };
}
