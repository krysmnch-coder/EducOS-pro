const listNotifications = (req, res) => {
  // TODO: Récupérer les notifications depuis la base de données
  res.render('notifications', {
    title: 'Mes notifications | EducOS-pro'
  });
};

const getJsonNotifications = (req, res) => {
  res.json([]);
};

const getUnreadCount = (req, res) => {
  res.json({ count: 0 });
};

const markAllRead = (req, res) => {
  res.json({ success: true, message: 'Placeholder: Toutes les notifications marquées comme lues.' });
};

const markOneAsRead = (req, res) => {
  res.json({ success: true, message: `Placeholder: Notification ${req.params.id} marquée comme lue.` });
};

const deleteNotification = (req, res) => {
  res.json({ success: true, message: `Placeholder: Notification ${req.params.id} supprimée.` });
};

module.exports = {
  listNotifications,
  getJsonNotifications,
  getUnreadCount,
  markAllRead,
  markOneAsRead,
  deleteNotification
};