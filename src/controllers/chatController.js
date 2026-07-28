const userModel = require('../models/userModel');
const chatModel = require('../models/chatModel');
const { ROLES } = require('../../constants');

/**
 * Affiche la page principale du chat.
 */
const renderChat = async (req, res) => {
    try {
        let otherUsers;
        
        // Le SUPER_ADMIN peut voir et interagir avec tout le monde.
        if (req.user.role === ROLES.SUPER_ADMIN) {
            otherUsers = await chatModel.getChatUsers(req.user.id);
        } 
        // Les autres utilisateurs ne voient que les membres de leur établissement.
        else if (req.user.establishment_id) {
            otherUsers = await chatModel.getChatUsersByEstablishment(req.user.id, req.user.establishment_id);
        } else {
            otherUsers = [];
        }

        console.log('📋 renderChat - Utilisateurs disponibles:', otherUsers?.length || 0);
        console.log('👤 Utilisateur courant:', req.user.id, req.user.name);

        res.render('chat', {
            title: 'Chat | EducOS-pro',
            otherUsers: otherUsers || [],
            user: req.user
        });
    } catch (error) {
        console.error('❌ Erreur renderChat:', error);
        req.flash('error_msg', 'Impossible de charger la page de chat.');
        res.redirect('/dashboard');
    }
};

/**
 * API - Récupère la liste des conversations pour l'utilisateur connecté
 */
const getConversations = async (req, res) => {
    try {
        console.log('═══════════════════════════════════════');
        console.log('📥 GET /api/conversations');
        console.log('👤 User:', req.user.id, req.user.name);
        
        if (!req.user) {
            return res.status(401).json({ 
                success: false,
                error: 'Non authentifié' 
            });
        }

        const currentUserId = req.user.id;
        const rawConversations = await chatModel.getUserConversations(currentUserId);

        console.log('📋 Conversations brutes trouvées:', rawConversations?.length || 0);

        if (!rawConversations || rawConversations.length === 0) {
            console.log('⚠️ Aucune conversation trouvée');
            console.log('═══════════════════════════════════════');
            return res.json([]);
        }

        // Transformer les données pour le frontend
        const conversations = rawConversations.map(convo => {
            const isUser1 = Number(convo.user1_id) === Number(currentUserId);
            const otherUser = {
                id: isUser1 ? convo.user2_id : convo.user1_id,
                name: isUser1 ? convo.user2_name : convo.user1_name,
                avatar_url: isUser1 ? convo.user2_avatar : convo.user1_avatar,
            };

            return {
                id: otherUser.id,
                name: otherUser.name || 'Utilisateur inconnu',
                avatar_url: otherUser.avatar_url || '/img/user.png',
                last_message: convo.last_message_text || '',
                unread_count: Number(convo.unread_count) || 0
            };
        });

        console.log('✅ Conversations formatées:', conversations.length);
        console.log('📝 Première conversation:', conversations[0]);
        console.log('═══════════════════════════════════════');

        res.json(conversations);

    } catch (error) {
        console.error('❌ Erreur getConversations:', error);
        console.error('❌ Stack:', error.stack);
        console.log('═══════════════════════════════════════');
        res.status(500).json({ 
            success: false,
            error: 'Impossible de récupérer les conversations.',
            details: error.message 
        });
    }
};

/**
 * API - Récupère les messages d'une conversation
 */
const getMessages = async (req, res) => {
    try {
        const otherUserId = req.params.userId;
        const currentUserId = req.user.id;

        console.log('═══════════════════════════════════════');
        console.log('📥 GET /api/messages/' + otherUserId);
        console.log('👤 Current User:', currentUserId, req.user.name);
        console.log('👤 Other User ID:', otherUserId);

        if (!otherUserId) {
            console.log('❌ otherUserId manquant');
            return res.status(400).json({ 
                success: false,
                error: 'User ID manquant.' 
            });
        }

        // Vérifier que l'autre utilisateur existe
        const otherUser = await userModel.getUserById(otherUserId);
        console.log('🔍 Other User trouvé:', otherUser ? 'OUI - ' + otherUser.name : 'NON');
        
        if (!otherUser) {
            console.log('❌ Utilisateur introuvable');
            return res.status(404).json({ 
                success: false,
                error: 'Utilisateur introuvable.' 
            });
        }

        // Vérification de sécurité - les utilisateurs doivent être du même établissement
        // sauf pour le SUPER_ADMIN
        const canInteract = 
            req.user.role === ROLES.SUPER_ADMIN ||
            (req.user.establishment_id && req.user.establishment_id === otherUser.establishment_id);

        console.log('🔒 Can Interact:', canInteract);
        console.log('🏫 User Establishment:', req.user.establishment_id);
        console.log('🏫 Other Establishment:', otherUser.establishment_id);

        if (!canInteract) {
            console.log('❌ Accès non autorisé - établissements différents');
            return res.status(403).json({ 
                success: false,
                error: 'Vous n\'êtes pas autorisé à voir cette conversation.' 
            });
        }

        // Créer ou récupérer la conversation
        const conversationId = await chatModel.getOrCreateConversation(currentUserId, otherUserId);
        console.log('💬 Conversation ID:', conversationId);

        // Marquer les messages comme lus
        await chatModel.markMessagesAsRead(conversationId, currentUserId);
        console.log('✓ Messages marqués comme lus');

        // Récupérer les messages
        const messages = await chatModel.getMessages(currentUserId, otherUserId);
        console.log('📨 Messages trouvés:', messages ? messages.length : 0);

        // Formater les messages pour le frontend
        const formattedMessages = (messages || []).map(msg => ({
            id: msg.id,
            sender_id: parseInt(msg.sender_id),
            content: msg.content || msg.message || '',
            message: msg.message || msg.content || '',
            created_at: msg.created_at,
            is_read: msg.is_read || 0,
            sender_name: msg.sender_name || '',
            sender_avatar: msg.sender_avatar || ''
        }));

        // Mettre à jour le badge de messages non lus via Socket.io
        const authIo = req.app.get('authIo');
        if (authIo) {
            const unreadCount = await chatModel.getUnreadCount(currentUserId);
            authIo.to(`user_${currentUserId}`).emit('unreadChatUpdate', { count: unreadCount });
        }

        console.log('✅ Envoi de', formattedMessages.length, 'messages');
        console.log('═══════════════════════════════════════');

        res.json(formattedMessages);

    } catch (error) {
        console.error('❌ ERREUR getMessages:', error);
        console.error('❌ Stack:', error.stack);
        console.log('═══════════════════════════════════════');
        res.status(500).json({ 
            success: false,
            error: 'Impossible de récupérer les messages.',
            details: error.message 
        });
    }
};

/**
 * API - Récupère le nombre de messages non lus
 */
const getUnreadApi = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ 
                success: false,
                error: 'Non authentifié' 
            });
        }

        const count = await chatModel.getUnreadCount(req.user.id);
        console.log('📊 Unread count pour user', req.user.id, ':', count);
        
        res.json({ 
            success: true,
            count: count || 0 
        });

    } catch (error) {
        console.error('❌ Erreur getUnreadApi:', error);
        res.status(500).json({ 
            success: false,
            error: 'Impossible de récupérer le nombre de messages non lus.' 
        });
    }
};

module.exports = {
    renderChat,
    getConversations,
    getMessages,
    getUnreadApi
};