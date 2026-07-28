const db = require('../config/database'); // Adaptez selon votre configuration de base de données

/**
 * Récupère les utilisateurs avec qui l'utilisateur courant peut chatter
 * (Pour SUPER_ADMIN - tous les utilisateurs sauf lui-même)
 */
const getChatUsers = async (currentUserId) => {
    try {
        const users = await db.query(
            `SELECT id, name, avatar_url, establishment_id 
             FROM users 
             WHERE id != ? 
             ORDER BY name ASC`,
            [currentUserId]
        );
        return users || [];
    } catch (error) {
        console.error('❌ Erreur getChatUsers:', error);
        return [];
    }
};

/**
 * Récupère les utilisateurs du même établissement
 */
const getChatUsersByEstablishment = async (currentUserId, establishmentId) => {
    try {
        const users = await db.query(
            `SELECT id, name, avatar_url, establishment_id 
             FROM users 
             WHERE id != ? AND establishment_id = ? 
             ORDER BY name ASC`,
            [currentUserId, establishmentId]
        );
        return users || [];
    } catch (error) {
        console.error('❌ Erreur getChatUsersByEstablishment:', error);
        return [];
    }
};

/**
 * Récupère la liste des conversations d'un utilisateur
 */
const getUserConversations = async (userId) => {
    try {
        console.log('🔍 getUserConversations pour userId:', userId);
        
        const conversations = await db.query(
            `SELECT 
                c.id as conversation_id,
                c.user1_id,
                c.user2_id,
                u1.name as user1_name,
                u1.avatar_url as user1_avatar,
                u2.name as user2_name,
                u2.avatar_url as user2_avatar,
                (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_text,
                (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
                (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND is_read = 0) as unread_count
             FROM conversations c
             LEFT JOIN users u1 ON c.user1_id = u1.id
             LEFT JOIN users u2 ON c.user2_id = u2.id
             WHERE c.user1_id = ? OR c.user2_id = ?
             ORDER BY last_message_time DESC`,
            [userId, userId, userId]
        );

        console.log('✅ Conversations trouvées:', conversations?.length || 0);
        return conversations || [];

    } catch (error) {
        console.error('❌ Erreur getUserConversations:', error);
        return [];
    }
};

/**
 * Crée une nouvelle conversation ou retourne l'ID de la conversation existante
 */
const getOrCreateConversation = async (userId1, userId2) => {
    try {
        console.log('🔍 getOrCreateConversation:', userId1, userId2);
        
        // Vérifier si la conversation existe déjà
        let conversation = await db.query(
            `SELECT id FROM conversations 
             WHERE (user1_id = ? AND user2_id = ?) 
                OR (user1_id = ? AND user2_id = ?)`,
            [userId1, userId2, userId2, userId1]
        );

        if (conversation && conversation.length > 0) {
            console.log('✅ Conversation existante, ID:', conversation[0].id);
            return conversation[0].id;
        }

        // Créer une nouvelle conversation
        console.log('🆕 Création nouvelle conversation...');
        const result = await db.query(
            `INSERT INTO conversations (user1_id, user2_id, created_at) 
             VALUES (?, ?, NOW())`,
            [Math.min(userId1, userId2), Math.max(userId1, userId2)]
        );

        console.log('✅ Nouvelle conversation créée, ID:', result.insertId);
        return result.insertId;

    } catch (error) {
        console.error('❌ Erreur getOrCreateConversation:', error);
        throw error;
    }
};

/**
 * Récupère les messages entre deux utilisateurs
 */
const getMessages = async (userId1, userId2) => {
    try {
        console.log('🔍 getMessages entre', userId1, 'et', userId2);
        
        // Trouver la conversation
        const conversation = await db.query(
            `SELECT id FROM conversations 
             WHERE (user1_id = ? AND user2_id = ?) 
                OR (user1_id = ? AND user2_id = ?)`,
            [userId1, userId2, userId2, userId1]
        );

        if (!conversation || conversation.length === 0) {
            console.log('⚠️ Aucune conversation trouvée');
            return [];
        }

        const conversationId = conversation[0].id;
        console.log('💬 Conversation ID:', conversationId);

        // Récupérer les messages
        const messages = await db.query(
            `SELECT 
                m.id,
                m.sender_id,
                m.content,
                m.message,
                m.created_at,
                m.conversation_id,
                m.is_read,
                u.name as sender_name,
                u.avatar_url as sender_avatar
             FROM messages m
             LEFT JOIN users u ON m.sender_id = u.id
             WHERE m.conversation_id = ?
             ORDER BY m.created_at ASC`,
            [conversationId]
        );

        console.log('✅ Messages trouvés:', messages?.length || 0);
        return messages || [];

    } catch (error) {
        console.error('❌ Erreur getMessages:', error);
        return [];
    }
};

/**
 * Marque les messages d'une conversation comme lus
 */
const markMessagesAsRead = async (conversationId, userId) => {
    try {
        console.log('📖 Marquage messages lus - Conv:', conversationId, 'User:', userId);
        
        await db.query(
            `UPDATE messages 
             SET is_read = 1 
             WHERE conversation_id = ? 
             AND sender_id != ? 
             AND is_read = 0`,
            [conversationId, userId]
        );

        console.log('✅ Messages marqués comme lus');
    } catch (error) {
        console.error('❌ Erreur markMessagesAsRead:', error);
    }
};

/**
 * Récupère le nombre total de messages non lus pour un utilisateur
 */
const getUnreadCount = async (userId) => {
    try {
        const result = await db.query(
            `SELECT COUNT(*) as count 
             FROM messages m
             JOIN conversations c ON m.conversation_id = c.id
             WHERE (c.user1_id = ? OR c.user2_id = ?)
             AND m.sender_id != ?
             AND m.is_read = 0`,
            [userId, userId, userId]
        );

        const count = result[0]?.count || 0;
        console.log('📊 Unread count pour', userId, ':', count);
        return count;

    } catch (error) {
        console.error('❌ Erreur getUnreadCount:', error);
        return 0;
    }
};

/**
 * Sauvegarde un nouveau message
 */
const saveMessage = async (conversationId, senderId, content) => {
    try {
        const result = await db.query(
            `INSERT INTO messages (conversation_id, sender_id, content, message, created_at, is_read) 
             VALUES (?, ?, ?, ?, NOW(), 0)`,
            [conversationId, senderId, content, content]
        );

        console.log('✅ Message sauvegardé, ID:', result.insertId);
        return result.insertId;

    } catch (error) {
        console.error('❌ Erreur saveMessage:', error);
        throw error;
    }
};

module.exports = {
    getChatUsers,
    getChatUsersByEstablishment,
    getUserConversations,
    getOrCreateConversation,
    getMessages,
    markMessagesAsRead,
    getUnreadCount,
    saveMessage
};