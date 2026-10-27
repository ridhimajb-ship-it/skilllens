import { HttpError } from '../utils/httpError.js';

/** Validate req[source] with a zod schema; the parsed value replaces it on req.valid. */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return next(new HttpError(400, `Invalid input: ${issues.map((i) => `${i.path || 'body'} — ${i.message}`).join('; ')}`, issues));
    }
    req.valid = { ...(req.valid || {}), [source]: result.data };
    return next();
  };
}
