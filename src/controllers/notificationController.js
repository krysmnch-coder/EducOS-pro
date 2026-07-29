const notificationModel = require('../models/notificationModel');

/**
 * Simple helper to format date strings into a "time ago" format in French.
 * @param {string | Date} date - The date to format.
 * @returns {string} Formatted time ago string.
 */
function timeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 5) return 'à l\'instant';

    const intervals = {
        an: 31536000,
        mois: 2592000,
        jour: 86400,
        heure: 3600,
        minute: 60,
        seconde: 1
    };

    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            let plural = '';
            if (interval > 1 && unit !== 'mois') {
                plural = 's';
            }
            return `il y a ${interval} ${unit}${plural}`;
        }
    }
    return 'à l\'instant';
}

/**
 * Helper to format notification timestamps.
 * @param {Array} notifications - Array of notification objects.
 * @returns {Array} Notifications with an added 'timeAgo' property.
 */
const formatNotificationTimes = (notifications) => {
  if (!notifications) return [];
  return notifications.map(notif => ({
    ...notif,
    timeAgo: timeAgo(notif.created_at)
  }));
};

/**
 * Renders the main notifications page with a list of all user notifications.
 */
exports.listNotifications = async (req, res) => {
  try {
    const rawNotifications = await notificationModel.getNotificationsForUser(req.user.id);
    const notifications = formatNotificationTimes(rawNotifications);
    
    res.render('notifications', {
      title: 'Notifications',
      notifications: notifications
    });
  } catch (error) {
    console.error('Error fetching notifications for page:', error);
    req.flash('error_msg', 'Impossible de charger les notifications.');
    res.redirect('/dashboard');
  }
};

/**
 * API Endpoint: Returns all user notifications as JSON.
 */
exports.getJsonNotifications = async (req, res) => {
  try {
    const rawNotifications = await notificationModel.getNotificationsForUser(req.user.id);
    const notifications = formatNotificationTimes(rawNotifications);
    res.json(notifications);
  } catch (error) {
    console.error('Error fetching JSON notifications:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * API Endpoint: Returns the count of unread notifications.
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await notificationModel.getUnreadNotificationCountForUser(req.user);
    res.json({ count });
  } catch (error) {
    console.error('Error fetching unread notification count:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * API Endpoint: Marks all notifications for the user as read.
 */
exports.markAllRead = async (req, res) => {
  try {
    await notificationModel.markAllAsReadForUser(req.user.id);
    res.json({ success: true, message: 'Toutes les notifications ont été marquées comme lues.' });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * API Endpoint: Marks a single notification as read.
 */
exports.markOneAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await notificationModel.markAsRead(id, req.user.id);
    if (result > 0) {
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, message: 'Notification non trouvée ou non autorisée.' });
    }
  } catch (error) {
    console.error(`Error marking notification ${req.params.id} as read:`, error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * API Endpoint: Deletes a single notification.
 */
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await notificationModel.deleteNotification(id, req.user.id);
    if (result > 0) {
        res.json({ success: true, message: 'Notification supprimée.' });
    } else {
        res.status(404).json({ success: false, message: 'Notification non trouvée ou non autorisée.' });
    }
  } catch (error) {
    console.error(`Error deleting notification ${req.params.id}:`, error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};