const express = require('express');
const router = express.Router();
const { isAuthenticated: ensureAuthenticated } = require('../middleware/authMiddleware');
const notificationController = require('../controllers/notificationController');

// Main notifications page
router.get('/', ensureAuthenticated, notificationController.listNotifications);

// API endpoint to get notifications as JSON (for the popup)
router.get('/json', ensureAuthenticated, notificationController.getJsonNotifications);

// API endpoint to get unread count
router.get('/unread-count', ensureAuthenticated, notificationController.getUnreadCount);

// API endpoint to mark all as read
router.post('/mark-all-read', ensureAuthenticated, notificationController.markAllRead);

// API endpoint to mark a single notification as read
router.post('/:id/mark-read', ensureAuthenticated, notificationController.markOneAsRead);

// API endpoint to delete a notification
router.post('/:id/delete', ensureAuthenticated, notificationController.deleteNotification);

module.exports = router;