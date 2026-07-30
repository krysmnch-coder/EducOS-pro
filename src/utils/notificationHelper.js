const db = require('../models/db');

async function createNotification({ userId, title, message, type = 'info', link = null }) {
    try {
        await db('notifications').insert({
            user_id: userId,
            title,
            message,
            type,
            link,
            is_read: false,
            created_at: new Date()
        });
        return true;
    } catch (error) {
        console.error('Erreur création notification:', error);
        return false;
    }
}

async function createNotificationForUsers({ userIds, title, message, type = 'info', link = null }) {
    try {
        const notifications = userIds.map(userId => ({
            user_id: userId,
            title,
            message,
            type,
            link,
            is_read: false,
            created_at: new Date()
        }));
        await db('notifications').insert(notifications);
        return true;
    } catch (error) {
        console.error('Erreur création notifications multiples:', error);
        return false;
    }
}

module.exports = { createNotification, createNotificationForUsers };