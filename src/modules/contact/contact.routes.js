const express = require('express');
const router = express.Router();
const contactController = require('./contact.controller');

// Public route for visitors to submit messages
router.post('/', contactController.submitContactMessage);

module.exports = router;
