export function notFoundHandler(req, res, next) {
  res.status(404);
  next(new Error(`Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  let status = error.status || error.statusCode || 500;
  let message = error.message || 'An unexpected error occurred';
  let details;

  if (error.name === 'ValidationError') {
    status = 400;
    details = Object.values(error.errors).map((item) => item.message);
    message = 'Validation failed';
  } else if (error.name === 'CastError' || error.name === 'StrictModeError') {
    status = 400;
    message = 'Invalid product data or ID';
  } else if (error.code === 11000) {
    status = 409;
    const field = Object.keys(error.keyValue || {})[0] || 'value';
    message = `A product with this ${field} already exists`;
  }

  const body = { error: message };
  if (details) body.details = details;
  if (process.env.NODE_ENV !== 'production' && status >= 500) {
    body.stack = error.stack;
  }

  res.status(status).json(body);
}
