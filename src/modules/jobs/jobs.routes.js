const express = require('express');
const router = express.Router();
const jobsController = require('./jobs.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

// All job tracker routes require authentication
router.use(authMiddleware);

router.get('/', jobsController.getJobs);
router.post('/', jobsController.createJob);
router.put('/:id', jobsController.updateJob);
router.delete('/:id', jobsController.deleteJob);

module.exports = router;
