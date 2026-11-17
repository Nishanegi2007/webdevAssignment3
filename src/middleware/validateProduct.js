const allowedFields = new Set([
  'name',
  'sku',
  'category',
  'price',
  'quantity',
  'reorderLevel',
  'supplier',
]);

export function validateProductBody({ partial = false } = {}) {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Request body must be a JSON object' });
    }

    const keys = Object.keys(req.body);
    const unknown = keys.filter((key) => !allowedFields.has(key));
    if (unknown.length) {
      return res.status(400).json({ error: 'Unknown product fields', fields: unknown });
    }
    if (keys.length === 0) {
      return res.status(400).json({ error: 'Request body must include product fields' });
    }

    if (!partial) {
      const missing = [...allowedFields].filter((field) => !(field in req.body));
      if (missing.length) {
        return res.status(400).json({ error: 'Missing required product fields', fields: missing });
      }
    }

    next();
  };
}
