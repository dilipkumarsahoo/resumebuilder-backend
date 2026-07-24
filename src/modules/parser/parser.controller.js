const { extractTextFromBuffer, parseResumeText } = require('./parser.utils');
const { ApiError } = require('../../middlewares/error.middleware');

/**
 * Controller to handle resume upload and parse it.
 */
const parseResume = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ApiError(400, 'Please upload a resume file (.pdf, .doc, or .docx).');
    }

    const { buffer, mimetype, originalname } = req.file;

    // Validate file type
    const extension = originalname.split('.').pop().toLowerCase();
    const allowedExtensions = ['pdf', 'doc', 'docx'];
    if (!allowedExtensions.includes(extension)) {
      throw new ApiError(400, 'Invalid file type. Only PDF, DOC, and DOCX files are allowed.');
    }

    // Extract raw text
    let rawText = '';
    try {
      rawText = await extractTextFromBuffer(buffer, mimetype, originalname);
    } catch (err) {
      console.error('Text extraction failed:', err);
      throw new ApiError(422, `Failed to extract text from your resume file: ${err.message}`);
    }

    if (!rawText || rawText.trim().length === 0) {
      throw new ApiError(422, 'Could not extract any text from the uploaded file. The file may be empty or encrypted.');
    }

    // Parse structured details
    const parsedData = parseResumeText(rawText);

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
