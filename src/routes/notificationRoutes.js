const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

// Middleware d'authentification
const isAuthenticated = (req, res, next) => {
    if (req.user) return next();
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(401).json({ error: 'Non authentifié' });
    }
    res.redirect('/login');
};

// API - Récupérer les notifications récentes (pour le popup)
router.get('/api/notifications/recent', isAuthenticated, notificationController.getRecentNotifications);

// API - Nombre de notifications non lues
router.get('/api/notifications/unread-count', isAuthenticated, notificationController.getUnreadCount);

// API - Marquer une notification comme lue
router.post('/api/notifications/:id/read', isAuthenticated, notificationController.markAsRead);

// API - Marquer toutes les notifications comme lues
router.post('/api/notifications/read-all', isAuthenticated, notificationController.markAllAsRead);

// Page complète des notifications
router.get('/', isAuthenticated, notificationController.getAllNotifications);

module.exports = router;