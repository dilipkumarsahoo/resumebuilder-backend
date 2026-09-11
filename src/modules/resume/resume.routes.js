const express = require('express');
const multer = require('multer');
const resumeController = require('./resume.controller');
const { ApiError } = require('../../middlewares/error.middleware');

const router = express.Router();

// Configure multer memory storage (no lingering files on disk)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream'
    ];

    const ext = file.originalname ? file.originalname.split('.').pop().toLowerCase() : '';
    const isAllowedExt = ['pdf', 'doc', 'docx'].includes(ext);

    if (allowedMimeTypes.includes(file.mimetype) || isAllowedExt) {
      cb(null, true);
    } else {
      cb(new ApiError(400, 'Invalid file type. Only PDF, DOC, and DOCX files are allowed.'));
    }
  },
});

// POST /api/resume/parse
router.post('/parse', upload.single('resume'), resumeController.parseResume);

module.exports = router;
