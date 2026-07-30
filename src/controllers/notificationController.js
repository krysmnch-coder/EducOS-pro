const notificationModel = require('../models/notificationModel');

const getRecentNotifications = async (req, res) => {
    try {
        const result = await notificationModel.getRecentNotifications(req.user.id);
        res.json(result);
    } catch (error) {
        console.error('Erreur getRecentNotifications:', error);
        res.json({ notifications: [], unreadCount: 0 });
    }
};

const getUnreadCount = async (req, res) => {
    try {
        const count = await notificationModel.getUnreadNotificationCountForUser(req.user);
        res.json({ count });
    } catch (error) {
        res.json({ count: 0 });
    }
};

const markAsRead = async (req, res) => {
    try {
        await notificationModel.markAsRead(req.params.id, req.user.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
};

const markAllAsRead = async (req, res) => {
    try {
        await notificationModel.markAllAsRead(req.user.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
};

const getAllNotifications = async (req, res) => {
    try {
        const notifications = await notificationModel.getAllNotifications(req.user.id);
        res.render('notifications', {
            title: 'Notifications',
            notifications: notifications,
            user: req.user
        });
    } catch (error) {
        req.flash('error_msg', 'Erreur lors du chargement des notifications');
        res.redirect('/dashboard');
    }
};

module.exports = {
    getRecentNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    getAllNotifications
};