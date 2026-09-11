const contactService = require('./contact.service');

const submitContactMessage = async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body;
    const result = await contactService.createContactMessage({ name, email, subject, message });

    return res.status(201).json({
      success: true,
      message: 'Your message has been sent successfully. We will get back to you shortly!',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getContacts = async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const result = await contactService.getContactMessages({ status, page, limit });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const result = await contactService.updateMessageStatus(id, status);

    return res.status(200).json({
      success: true,
      message: 'Status updated successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const deleteMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await contactService.deleteContactMessage(id);

    return res.status(200).json({
      success: true,
      message: 'Contact message deleted successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitContactMessage,
  getContacts,
  updateStatus,
  deleteMessage,
};
