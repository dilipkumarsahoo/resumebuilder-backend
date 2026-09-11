const express = require('express');
const router = express.Router();
const adminController = require('./admin.controller');
const adminMiddleware = require('../../middlewares/admin.middleware');

// Public Admin Login route
router.post('/login', adminController.adminLogin);

// Protected Admin Routes
router.get('/stats', adminMiddleware, adminController.getStats);
router.get('/users', adminMiddleware, adminController.getUsers);
router.patch('/users/:id/toggle-pro', adminMiddleware, adminController.toggleUserPro);
router.delete('/users/:id', adminMiddleware, adminController.deleteUser);
router.get('/payments', adminMiddleware, adminController.getPayments);

// Contact Inquiries Management Routes
router.get('/contacts', adminMiddleware, adminController.getContacts);
router.patch('/contacts/:id/status', adminMiddleware, adminController.updateContactStatus);
router.delete('/contacts/:id', adminMiddleware, adminController.deleteContact);

module.exports = router;
