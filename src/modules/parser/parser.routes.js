const express = require('express');
const multer = require('multer');
const parserController = require('./parser.controller');
const { ApiError } = require('../../middlewares/error.middleware');

const router = express.Router();

// Configure multer memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream' // sometimes returned by browser/client for doc/docx files
    ];
    
    const ext = file.originalname.split('.').pop().toLowerCase();
    const isAllowedExt = ['pdf', 'doc', 'docx'].includes(ext);
    
    if (allowedMimeTypes.includes(file.mimetype) || isAllowedExt) {
      cb(null, true);
    } else {
      cb(new ApiError(400, 'Invalid file type. Only PDF, DOC, and DOCX files are allowed.'));
    }
  },
});

// Post route to handle resume file upload and parse it
router.post('/upload', upload.single('resume'), parserController.parseResume);

module.exports = router;
