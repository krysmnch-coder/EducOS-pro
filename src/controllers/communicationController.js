const communicationModel = require('../models/communicationModel');
const userModel = require('../models/userModel');
const notificationModel = require('../models/notificationModel');
const { ROLES } = require('../../constants');
const db = require('../models/db');

const listMessages = async (req, res) => {
  try {
    const communications = await communicationModel.getCommunicationsForUser(req.user.id);
    const allUsers = await userModel.getAllUsers();
    // Exclure l'utilisateur actuel et ne garder que les utilisateurs approuvés
    const allOtherUsers = allUsers.filter(u => u.id !== req.user.id && u.approved);

    res.render('communications', {
      title: 'Communications | EducOS-pro',
      communications: communications,
      allUsers: allOtherUsers, // Fournir les utilisateurs pour la vue TomSelect
      user: req.user,
      ROLES: ROLES
    });
  } catch (error) {
    console.error('Erreur lors du chargement de la page des communications:', error);
    req.flash('error_msg', 'Impossible de charger la page des communications.');
    res.redirect('/dashboard');
  }
};

const sendMessage = async (req, res) => {
  try {
    const { recipient, subject, message } = req.body;
    const sender = req.user;

    if (!recipient || !subject || !message) {
      req.flash('error_msg', 'Tous les champs sont obligatoires.');
      return res.redirect('/communications');
    }

    let recipientInfo = {};
    if (recipient.startsWith('user_')) {
      recipientInfo = { recipientType: 'user', recipientId: recipient.split('_')[1] };
    } else if (recipient.startsWith('role_')) {
      recipientInfo = { recipientType: 'role', recipientRole: recipient.split('_')[1] };
    } else if (recipient === 'all') {
      recipientInfo = { recipientType: 'role', recipientRole: 'all' };
    } else {
      req.flash('error_msg', 'Destinataire invalide.');
      return res.redirect('/communications');
    }

    const { recipientIds } = await communicationModel.sendCommunication({
      senderId: sender.id,
      subject,
      message,
      ...recipientInfo
    });

    // Créer les notifications et animer les raccourcis pour les destinataires
    if (recipientIds && recipientIds.length > 0) {
        const notificationTitle = `Nouveau message de ${sender.name}`;
        const notificationLink = '/communications';

        // 1. Créer les notifications en masse
        const notifications = recipientIds.map(id => ({
            user_id: id,
            type: 'message',
            title: notificationTitle,
            body: subject,
            link: notificationLink
        }));
        await notificationModel.createBulkNotifications(notifications);

        // 2. Animer le raccourci pour les administrateurs qui ont reçu le message
        const authIo = req.app.get('authIo');
        if (authIo) {
            const admins = await db('users')
                .whereIn('id', recipientIds)
                .andWhere(function() {
                    this.where('role', ROLES.ADMINISTRATOR).orWhere('role', ROLES.SUPER_ADMIN)
                });
            
            admins.forEach(admin => {
                authIo.to(`user_${admin.id}`).emit('shortcutHighlight', { shortcutKey: 'mass_communication' });
            });
        }
    }

    req.flash('success_msg', 'Votre communication a été envoyée avec succès.');
    res.redirect('/communications');
  } catch (error) {
    console.error("Erreur lors de l'envoi de la communication:", error);
    req.flash('error_msg', "Une erreur est survenue lors de l'envoi.");
    res.redirect('/communications');
  }
};

const getUnreadCommunicationCount = (req, res) => {
  res.json({ count: 0 });
};

const deleteMessage = async (req, res) => {
  try {
    const communicationId = req.params.id;
    const userId = req.user.id;

    await communicationModel.deleteCommunicationForUser(communicationId, userId);

    req.flash('success_msg', 'Le message a été supprimé.');
    res.redirect('/communications');
  } catch (error) {
    console.error("Erreur lors de la suppression de la communication:", error);
    req.flash('error_msg', "Une erreur est survenue lors de la suppression du message.");
    res.redirect('/communications');
  }
};

module.exports = { listMessages, sendMessage, getUnreadCommunicationCount, deleteMessage };