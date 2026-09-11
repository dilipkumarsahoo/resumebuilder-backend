const { extractTextFromBuffer } = require('../parser/parser.utils');
const { parseResumeWithAI } = require('./resume.ai.service');
const { ApiError } = require('../../middlewares/error.middleware');

/**
 * Controller to handle resume upload and parse with AI / text extraction.
 * POST /api/resume/parse
 */
const parseResume = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ApiError(400, 'Please upload a resume file (.pdf, .doc, or .docx).');
    }

    const { buffer, mimetype, originalname, size } = req.file;

    // Validate 5MB file size limit
    const MAX_SIZE = 5 * 1024 * 1024;
    if (size > MAX_SIZE) {
      throw new ApiError(400, 'File size exceeds 5MB limit. Please upload a smaller file.');
    }

    // Validate file extension
    const extension = originalname ? originalname.split('.').pop().toLowerCase() : '';
    const allowedExtensions = ['pdf', 'doc', 'docx'];
    if (!allowedExtensions.includes(extension)) {
      throw new ApiError(400, 'Invalid file type. Only PDF, DOC, and DOCX files are allowed.');
    }

    // Extract readable text from buffer
    let rawText = '';
    try {
      rawText = await extractTextFromBuffer(buffer, mimetype, originalname);
    } catch (err) {
      console.error('Resume text extraction failed:', err);
      throw new ApiError(422, `Failed to extract readable text from your resume file: ${err.message}`);
    }

    if (!rawText || rawText.trim().length === 0) {
      throw new ApiError(422, 'Could not extract any text from the uploaded file. The file may be empty, image-only, or encrypted.');
    }

    // AI structured parsing
    const parsedData = await parseResumeWithAI(rawText);

    res.status(200).json({
      status: 'success',
      message: 'Resume parsed and structured successfully.',
      data: parsedData
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  parseResume
};
