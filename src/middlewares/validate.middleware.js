import { ZodError } from 'zod';

export const validate = (schema) => (req, res, next) => {
  try {
    const parsed = schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    
    // Replace req properties with validated ones
    req.body = parsed.body;
    req.query = parsed.query;
    req.params = parsed.params;
    
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      const errorMessages = err.errors.map((e) => `${e.path.join('.')} - ${e.message}`).join(', ');
      return res.status(400).json({
        success: false,
        error: errorMessages,
        details: err.errors
      });
    }
    return res.status(500).json({ success: false, error: 'Internal validation error' });
  }
};
