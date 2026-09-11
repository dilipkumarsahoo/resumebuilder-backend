const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const authRoutes = require('./modules/auth/auth.routes');
const parserRoutes = require('./modules/parser/parser.routes');
const resumeRoutes = require('./modules/resume/resume.routes');
const paymentRoutes = require('./modules/payment/payment.routes');
const { errorHandler } = require('./middlewares/error.middleware');

const app = express();

// Middlewares
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/parser', parserRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/payment', paymentRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

module.exports = app;
