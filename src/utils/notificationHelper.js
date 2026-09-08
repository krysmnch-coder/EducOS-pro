const db = require('../models/db');
const notificationModel = require('../models/notificationModel');

async function createNotification({ userId, title, message, type = 'info', link = null }) {
    try {
        await notificationModel.createNotification({ user_id: userId, title, message, type, link });
        return true;
    } catch (error) {
        console.error('Erreur création notification:', error);
        return false;
    }
}

async function createNotificationForUsers({ userIds, title, message, type = 'info', link = null }) {
    try {
        for (const userId of userIds) {
            await notificationModel.createNotification({ user_id: userId, title, message, type, link });
        }
        return true;
    } catch (error) {
        console.error('Erreur création notifications multiples:', error);
        return false;
    }
}

module.exports = { createNotification, createNotificationForUsers };