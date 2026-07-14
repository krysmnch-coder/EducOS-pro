const db = require('./db');

// Créer ou récupérer une conversation
async function getOrCreateConversation(user1Id, user2Id) {
  // Assure que les IDs sont toujours dans le même ordre pour éviter les doublons
  const u1 = Math.min(user1Id, user2Id);
  const u2 = Math.max(user1Id, user2Id);

  const conversation = await db('conversations')
    .where({ user1_id: u1, user2_id: u2 })
    .first('id');

  if (conversation) {
    return conversation.id;
  }

  // .returning() avec sqlite3 retourne un tableau d'IDs
  const [newId] = await db('conversations').insert({
    user1_id: u1,
    user2_id: u2
  }).returning('id');

  return newId.id || newId;
}

// Envoyer un message
async function sendMessage(senderId, receiverId, message) {
  const conversationId = await getOrCreateConversation(senderId, receiverId);

  // Utilise une transaction pour garantir que les deux opérations réussissent
  return db.transaction(async trx => {
    const [messageId] = await trx('chat_messages').insert({
      conversation_id: conversationId,
      sender_id: senderId,
      message: message
    }).returning('id');

    return {
      id: messageId.id || messageId,
      conversation_id: conversationId,
      sender_id: senderId,
      message: message,
      created_at: new Date().toISOString()
    };
  });
}

// Récupérer les messages d'une conversation
function getMessages(user1Id, user2Id, limit = 50) {
  const u1 = Math.min(user1Id, user2Id);
  const u2 = Math.max(user1Id, user2Id);

  return db('chat_messages as m')
    .select('m.*', 'sender.name as sender_name')
    .join('conversations as c', 'm.conversation_id', 'c.id')
    .join('users as sender', 'm.sender_id', 'sender.id')
    .where('c.user1_id', u1)
    .andWhere('c.user2_id', u2)
    .orderBy('m.created_at', 'asc')
    .limit(limit);
}

// Récupérer les conversations d'un utilisateur
function getUserConversations(userId) {  
  const unreadSubquery = db('chat_messages')
    .count('*')
    .where('conversation_id', db.raw('c.id'))
    .andWhere('sender_id', '!=', userId)
    .andWhere('is_read', 0)
    .as('unread_count');

  const lastMessageSubquery = db('chat_messages')
    .select('message')
    .where('conversation_id', db.raw('c.id'))
    .orderBy('created_at', 'desc')
    .limit(1)
    .as('last_message_text');

  return db('conversations as c')
    .select(
      'c.*',
      'u1.name as user1_name', 'u1.avatar_url as user1_avatar',
      'u2.name as user2_name', 'u2.avatar_url as user2_avatar',
      unreadSubquery,
      db.raw('(SELECT MAX(created_at) FROM chat_messages WHERE conversation_id = c.id) as last_activity'),
      lastMessageSubquery
    )
    .join('users as u1', 'c.user1_id', 'u1.id')
    .join('users as u2', 'c.user2_id', 'u2.id')
    .where('c.user1_id', userId)
    .orWhere('c.user2_id', userId)
    .orderBy('last_activity', 'desc');
}

// Marquer les messages comme lus
function markMessagesAsRead(conversationId, userId) {
  return db('chat_messages')
    .where('conversation_id', conversationId)
    .andWhere('sender_id', '!=', userId)
    .andWhere('is_read', 0)
    .update({ is_read: 1 });
}

// Récupérer le nombre de messages non lus
async function getUnreadCount(userId) {
  const result = await db('chat_messages')
    .where('is_read', 0)
    .andWhere('sender_id', '!=', userId)
    .whereIn('conversation_id', function() {
      this.select('id').from('conversations')
        .where('user1_id', userId)
        .orWhere('user2_id', userId);
    })
    .count('id as count')
    .first();
  return result ? result.count : 0;
}

// Récupérer les utilisateurs pour le chat (sauf soi-même)
function getChatUsers(currentUserId) {
  return db('users')
    .select('id', 'name', 'email', 'role', 'avatar_url')
    .whereNot('id', currentUserId)
    .orderBy('name', 'asc');
}

/**
 * Récupère tous les utilisateurs d'un établissement avec qui l'utilisateur actuel peut discuter.
 * @param {number} currentUserId - L'ID de l'utilisateur qui fait la requête.
 * @param {number} establishmentId - L'ID de l'établissement.
 * @returns {Promise<Array>}
 */
async function getChatUsersByEstablishment(currentUserId, establishmentId) {
  return db('users')
    .select('id', 'name', 'role', 'avatar_url')
    .where({
      establishment_id: establishmentId,
      approved: 1 // On ne peut discuter qu'avec les utilisateurs approuvés
    })
    .whereNot('id', currentUserId) // Exclut l'utilisateur actuel de la liste
    .orderBy('name', 'asc');
}

module.exports = {
  getOrCreateConversation,
  sendMessage,
  getMessages,
  getUserConversations,
  markMessagesAsRead,
  getUnreadCount,
  getChatUsers,
  getChatUsersByEstablishment
};
