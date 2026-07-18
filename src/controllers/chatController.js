const userModel = require('../models/userModel');
const chatModel = require('../models/chatModel');
const { ROLES } = require('../../constants');

/**
 * Affiche la page principale du chat.
 * Cette page peut lister les utilisateurs avec qui démarrer une conversation.
 */
const renderChat = async (req, res) => {
  try {
    let otherUsers;
    // Le SUPER_ADMIN peut voir et interagir avec tout le monde.
    if (req.user.role === ROLES.SUPER_ADMIN) {
      otherUsers = await chatModel.getChatUsers(req.user.id);
    } 
    // Les autres utilisateurs (admins, profs, élèves) ne voient que les membres de leur établissement.
    else if (req.user.establishment_id) {
      // NOTE: Ceci nécessite une nouvelle fonction `getChatUsersByEstablishment` dans votre `chatModel`.
      otherUsers = await chatModel.getChatUsersByEstablishment(req.user.id, req.user.establishment_id);
    } else {
      // Cas de secours : un utilisateur sans rôle spécifique ou sans établissement ne voit personne.
      otherUsers = [];
    }

    // Note : cette ligne suppose que vous avez une vue nommée 'chat.ejs' dans votre dossier 'views'.
    // Si ce n'est pas le cas, ce sera probablement la prochaine erreur à corriger.
    res.render('chat', {
      title: 'Chat | EducOS-pro',
      otherUsers: otherUsers,
      user: req.user // Ajout de l'objet utilisateur pour la vue
    });
  } catch (error) {
    console.error('Erreur lors du rendu de la page de chat:', error);
    req.flash('error_msg', 'Impossible de charger la page de chat.');
    res.redirect('/dashboard');
  }
};

/**
 * Point d'API pour récupérer le nombre de messages non lus pour le badge.
 */
const getUnreadApi = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Non authentifié' });
        }
        const count = await chatModel.getUnreadCount(req.user.id);
        res.json({ count });
    } catch (error) {
        console.error('Erreur API getUnreadApi:', error);
        res.status(500).json({ error: 'Impossible de récupérer le nombre de messages non lus.' });
    }
};

/**
 * Récupère les messages d'une conversation.
 * C'est un point d'API qui sera probablement appelé par le client pour charger l'historique.
 */
const getMessages = async (req, res) => {
    try {
        const otherUserId = req.params.userId;
        const currentUserId = req.user.id;

        if (!otherUserId) {
            return res.status(400).json({ error: 'User ID manquant.' });
        }

        // --- VÉRIFICATION DE SÉCURITÉ ---
        // On s'assure que l'utilisateur ne peut voir que les messages des conversations autorisées.
        const otherUser = await userModel.getUserById(otherUserId);
        if (!otherUser) {
            return res.status(404).json({ error: 'Utilisateur introuvable.' });
        }

        const canInteract = 
            req.user.role === ROLES.SUPER_ADMIN ||
            (req.user.establishment_id && req.user.establishment_id === otherUser.establishment_id);

        if (!canInteract) {
            return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à voir cette conversation.' });
        }
        // --- FIN DE LA VÉRIFICATION ---

        // La logique est optimisée pour la clarté et la performance :
        // 1. On trouve ou crée la conversation pour obtenir son ID.
        const conversationId = await chatModel.getOrCreateConversation(currentUserId, otherUserId);
        
        // 2. On marque les messages de cette conversation comme lus.
        await chatModel.markMessagesAsRead(conversationId, currentUserId);

        // 3. On récupère l'historique des messages en utilisant la nouvelle fonction optimisée.
        const messages = await chatModel.getMessages(currentUserId, otherUserId);

        // Mettre à jour le badge de l'utilisateur via socket pour refléter la lecture
        const authIo = req.app.get('authIo');
        if (authIo) {
            const unreadCount = await chatModel.getUnreadCount(currentUserId);
            authIo.to(`user_${currentUserId}`).emit('unreadChatUpdate', { count: unreadCount });
        }

        res.json(messages);
    } catch (error) {
        console.error('Erreur API getMessages:', error);
        res.status(500).json({ error: 'Impossible de récupérer les messages.' });
    }
};

/**
 * Récupère la liste des conversations récentes pour un utilisateur.
 */
const getConversations = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Non authentifié' });
        }
        const currentUserId = req.user.id;
        const rawConversations = await chatModel.getUserConversations(currentUserId);

        // Transformer les données pour le frontend. Pour chaque conversation,
        // on extrait les informations de l'autre utilisateur.
        const conversations = rawConversations.map(convo => {
            // Comparaison robuste des IDs, qui peuvent être des nombres ou des chaînes de caractères
            // en fonction du pilote de base de données.
            const isUser1 = Number(convo.user1_id) === Number(currentUserId);
            const otherUser = {
                id: isUser1 ? convo.user2_id : convo.user1_id,
                name: isUser1 ? convo.user2_name : convo.user1_name,
                avatar_url: isUser1 ? convo.user2_avatar : convo.user1_avatar,
            };

            return {
                id: otherUser.id, // ID de l'autre utilisateur
                name: otherUser.name,
                avatar_url: otherUser.avatar_url,
                last_message: convo.last_message_text,
                unread_count: Number(convo.unread_count) || 0
            };
        });

        res.json(conversations);
    } catch (error) {
        console.error('Erreur API getConversations:', error);
        res.status(500).json({ error: 'Impossible de récupérer les conversations.' });
    }
};

module.exports = {
  renderChat,
  getUnreadApi,
  getMessages,
  getConversations,
};