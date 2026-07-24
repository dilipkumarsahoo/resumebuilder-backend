const validate = (schema) => (req, res, next) => {
  try {
    schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    next();
  } catch (error) {
    const errorMessage = error.errors
      .map((details) => details.message)
      .join(', ');
    return res.status(400).json({ status: 'error', message: errorMessage });
  }
};

module.exports = validate;
