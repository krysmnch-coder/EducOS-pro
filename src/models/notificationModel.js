const db = require('./db');

const notificationModel = {
    // Récupérer les notifications récentes
    async getRecentNotifications(userId, limit = 10) {
        const notifications = await db('notifications')
            .where({ user_id: userId })
            .orderBy('created_at', 'desc')
            .limit(limit)
            .select('id', 'title', 'message', 'type', 'link', 'is_read', 'created_at');

        const unreadCount = await this.getUnreadCount(userId);

        return {
            notifications: notifications.map(n => ({
                id: n.id,
                title: n.title,
                message: n.message,
                type: n.type || 'info',
                link: n.link || '#',
                unread: !n.is_read,
                time: this.formatTimeAgo(n.created_at)
            })),
            unreadCount
        };
    },

    // Récupérer toutes les notifications
    async getAllNotifications(userId) {
        return db('notifications')
            .where({ user_id: userId })
            .orderBy('created_at', 'desc')
            .select('*');
    },

    // Compter les notifications non lues
    async getUnreadCount(userId) {
        const result = await db('notifications')
            .where({ user_id: userId, is_read: false })
            .count('id as count')
            .first();
        return result ? parseInt(result.count) : 0;
    },

    // Pour la navbar (utilise req.user)
    async getUnreadNotificationCountForUser(user) {
        if (!user) return 0;
        return this.getUnreadCount(user.id);
    },

    // Marquer une notification comme lue
    async markAsRead(notificationId, userId) {
        return db('notifications')
            .where({ id: notificationId, user_id: userId })
            .update({ is_read: true, read_at: new Date() });
    },

    // Marquer toutes les notifications comme lues
    async markAllAsRead(userId) {
        return db('notifications')
            .where({ user_id: userId, is_read: false })
            .update({ is_read: true, read_at: new Date() });
    },

    // Créer une notification
    async createNotification({ user_id, type, title, message, link }, trx = null) {
        const query = trx || db;
        return query('notifications').insert({
            user_id,
            type: type || 'info',
            title,
            message,
            link: link || null
        });
    },

    /**
     * Crée plusieurs notifications en une seule requête.
     * @param {Array<Object>} notifications - Un tableau d'objets de notification.
     * @param {import('knex').Knex.Transaction} [trx=null] - La transaction Knex optionnelle.
     */
    async createBulkNotifications(notifications, trx = null) {
        if (!notifications || notifications.length === 0) {
            return;
        }
        const query = trx || db;
        // Knex gère l'insertion de plusieurs lignes lorsque vous lui passez un tableau d'objets.
        return query('notifications').insert(notifications);
    },

    // Formater le temps relatif
    formatTimeAgo(date) {
        if (!date) return '';
        const now = new Date();
        const diff = now - new Date(date);
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return 'À l\'instant';
        if (minutes < 60) return `Il y a ${minutes} min`;
        if (hours < 24) return `Il y a ${hours} h`;
        if (days < 7) return `Il y a ${days} j`;
        return new Date(date).toLocaleDateString('fr-FR');
    }
};

module.exports = notificationModel;