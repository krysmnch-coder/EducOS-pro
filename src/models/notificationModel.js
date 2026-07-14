const db = require('./db');

async function createNotification({ user_id = null, user_role = 'all', type, title, body = null, link = null }) {
  if (user_id) {
    // Cible un utilisateur unique
    return db('notifications').insert({
      user_id,
      user_role,
      type,
      title,
      body,
      link,
      is_read: 0
    });
  } else {
    // Cible un groupe d'utilisateurs
    const usersQuery = db('users').select('id', 'role').where('approved', 1);
    if (user_role !== 'all') {
      usersQuery.andWhere('role', user_role);
    }
    const users = await usersQuery;

    if (users.length === 0) {
      return { changes: 0 };
    }

    const notificationsData = users.map(user => ({
      user_id: user.id,
      user_role: user.role,
      type,
      title,
      body,
      link,
      is_read: 0
    }));

    return db('notifications').insert(notificationsData);
  }
}

function getNotificationsForUser(user) {
  return db('notifications')
    .where({ user_id: user.id })
    .orderBy('created_at', 'desc');
}

async function getUnreadNotificationCountForUser(user) {
  const result = await db('notifications')
    .where({ is_read: 0, user_id: user.id })
    .count('id as count')
    .first();
  return result ? result.count : 0;
}

function markNotificationsReadForUser(user) {
  return db('notifications')
    .where({ is_read: 0, user_id: user.id })
    .update({ is_read: 1 });
}

function deleteNotificationForUser(id, userId) {
  return db('notifications')
    .where({ id: id, user_id: userId })
    .del();
}

function markNotificationAsReadById(notificationId, userId) {
  return db('notifications')
    .where({ id: notificationId, user_id: userId, is_read: 0 })
    .update({ is_read: 1 });
}

// La fonction createMessageNotifications est redondante, la logique est maintenant gérée directement
// dans les contrôleurs ou les gestionnaires de sockets qui appellent createNotification.

function createSystemNotification({ userId = null, userRole = 'all', type, title, body = null, link = null }) {
  return createNotification({ user_id: userId, user_role: userRole, type, title, body, link });
}

module.exports = {
  createNotification,
  createSystemNotification,
  getNotificationsForUser,
  getUnreadNotificationCountForUser,
  markNotificationsReadForUser,
  deleteNotificationForUser,
  markNotificationAsReadById
};