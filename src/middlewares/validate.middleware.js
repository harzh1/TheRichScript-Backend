import { ZodError } from 'zod';

export const validate = (schema) => (req, res, next) => {
  try {
    const parsed = schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    
    // Replace req properties with validated ones if defined in schema
    if (parsed.body !== undefined) req.body = parsed.body;
    if (parsed.query !== undefined) {
      Object.defineProperty(req, 'query', { value: parsed.query, configurable: true, writable: true });
    }
    if (parsed.params !== undefined) {
      Object.defineProperty(req, 'params', { value: parsed.params, configurable: true, writable: true });
    }
    
    next();
  } catch (err) {
    if (err instanceof ZodError || err?.name === 'ZodError') {
      const errorMessages = err.errors.map((e) => `${e.path.join('.')} - ${e.message}`).join(', ');
      return res.status(400).json({
        success: false,
        error: errorMessages,
        details: err.errors
      });
    }
    console.error('INTERNAL VALIDATION ERROR:', err);
    return res.status(500).json({ success: false, error: 'Internal validation error: ' + (err.message || 'Unknown error') });
  }
};
