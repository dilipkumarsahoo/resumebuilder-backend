const adminService = require('./admin.service');

const adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const result = await adminService.adminLogin(email, password);
    res.status(200).json({
      message: 'Admin login successful',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getStats = async (req, res, next) => {
  try {
    const stats = await adminService.getDashboardStats();
    res.status(200).json({
      status: 'success',
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

const getUsers = async (req, res, next) => {
  try {
    const { search, isPro, role, page, limit } = req.query;
    const result = await adminService.getUsers({ search, isPro, role, page, limit });
    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const toggleUserPro = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updatedUser = await adminService.toggleUserPro(id);
    res.status(200).json({
      message: `User Pro status updated to ${updatedUser.isPro ? 'PRO' : 'FREE'}`,
      data: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await adminService.deleteUser(id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getPayments = async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const result = await adminService.getPayments({ status, page, limit });
    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getContacts = async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const result = await adminService.getContactMessages({ status, page, limit });
    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const updateContactStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const result = await adminService.updateMessageStatus(id, status);
    res.status(200).json({
      status: 'success',
      message: 'Status updated successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const deleteContact = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await adminService.deleteContactMessage(id);
    res.status(200).json({
      status: 'success',
      message: 'Contact message deleted successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  adminLogin,
  getStats,
  getUsers,
  toggleUserPro,
  deleteUser,
  getPayments,
  getContacts,
  updateContactStatus,
  deleteContact,
};
