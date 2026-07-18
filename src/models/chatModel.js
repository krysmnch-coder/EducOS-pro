const db = require('./db');

// Créer ou récupérer une conversation
async function getOrCreateConversation(user1Id, user2Id, trx = db) {
  // Assure que les IDs sont toujours dans le même ordre pour éviter les doublons
  const u1 = Math.min(Number(user1Id), Number(user2Id));
  const u2 = Math.max(Number(user1Id), Number(user2Id));

  const conversation = await trx('conversations')
    .where({ user1_id: u1, user2_id: u2 })
    .first('id');

  if (conversation) {
    return conversation.id;
  }

  const result = await trx('conversations').insert({
    user1_id: u1,
    user2_id: u2
  }).returning('id');

  if (!result || result.length === 0) {
    throw new Error("La création de la conversation a échoué, aucun ID n'a été retourné.");
  }
  const [newIdObj] = result;

  return newIdObj.id || newIdObj;
}

// Envoyer un message
async function sendMessage(senderId, receiverId, message, trx = db) {
  // La transaction est gérée par l'appelant (le gestionnaire de socket dans index.js)
  const conversationId = await getOrCreateConversation(senderId, receiverId, trx);

  const [messageIdObj] = await trx('chat_messages').insert({
    conversation_id: conversationId,
    sender_id: senderId,
    message: message
  }).returning('id');

  const messageId = messageIdObj.id || messageIdObj;

  return {
    id: messageId,
    conversation_id: conversationId,
    sender_id: senderId,
    message: message,
    created_at: new Date().toISOString()
  };
}

// Récupérer les messages d'une conversation
async function getMessages(user1Id, user2Id, limit = 50) {
  const u1 = Math.min(user1Id, user2Id);
  const u2 = Math.max(user1Id, user2Id);

  // Étape 1: Trouver l'ID de la conversation de manière beaucoup plus efficace.
  const conversation = await db('conversations')
    .where({ user1_id: u1, user2_id: u2 })
    .first('id');

  // S'il n'y a pas de conversation (donc pas de messages), on retourne un tableau vide.
  if (!conversation) {
    return [];
  }

  // Étape 2: Si la conversation existe, récupérer les messages associés.
  return db('chat_messages as m')
    .select('m.*', 'sender.name as sender_name', 'sender.avatar_url as sender_avatar')
    .join('users as sender', 'm.sender_id', 'sender.id')
    .where('m.conversation_id', conversation.id)
    .orderBy('m.created_at', 'asc')
    .limit(limit);
}

// Récupérer les conversations d'un utilisateur
async function getUserConversations(userId) {
  // Sous-requête pour obtenir le dernier message de chaque conversation en utilisant une fonction de fenêtre.
  // C'est beaucoup plus performant que des sous-requêtes corrélées.
  const latestMessageSubquery = db('chat_messages as m')
    .select(
      'm.conversation_id',
      'm.message as last_message_text',
      'm.created_at as last_activity',
      db.raw('ROW_NUMBER() OVER(PARTITION BY m.conversation_id ORDER BY m.created_at DESC) as rn')
    )
    .as('latest_msg');

  // Sous-requête pour compter les messages non lus par conversation.
  const unreadCountsSubquery = db('chat_messages')
    .select('conversation_id')
    .count('* as unread_count')
    .where('is_read', 0)
    .andWhere('sender_id', '!=', userId)
    .groupBy('conversation_id')
    .as('unread');

  // Requête principale qui assemble les informations.
  return db('conversations as c')
    .join('users as u1', 'c.user1_id', 'u1.id')
    .join('users as u2', 'c.user2_id', 'u2.id')
    // Jointure avec le dernier message (on ne garde que la ligne classée n°1).
    .leftJoin(latestMessageSubquery, function() {
      this.on('c.id', '=', 'latest_msg.conversation_id').andOn('latest_msg.rn', '=', 1);
    })
    // Jointure avec les comptes de messages non lus.
    .leftJoin(unreadCountsSubquery, 'c.id', 'unread.conversation_id')
    .select(
      'c.id',
      'c.user1_id',
      'c.user2_id',
      'u1.name as user1_name', 'u1.avatar_url as user1_avatar',
      'u2.name as user2_name', 'u2.avatar_url as user2_avatar',
      'latest_msg.last_message_text',
      'latest_msg.last_activity',
      // Utilise COALESCE pour s'assurer que le compte est 0 si `unread` est null.
      db.raw('COALESCE(unread.unread_count, 0) as unread_count')
    )
    .where(function() { this.where('c.user1_id', userId).orWhere('c.user2_id', userId); })
    // Le tri par 'last_activity' peut mettre les conversations sans message (NULL) à la fin ou au début
    // selon la base de données. 'nulls last' est plus explicite et garantit que les nouvelles
    // conversations apparaissent en bas de la liste triée par date.
    .orderBy('last_activity', 'desc', 'last');
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
  // Cette version utilise une jointure, ce qui est souvent plus performant
  // qu'une sous-requête avec WHERE IN, surtout avec les nouveaux index.
  const result = await db('chat_messages as m')
    .join('conversations as c', 'm.conversation_id', 'c.id')
    .where(function() {
      this.where('c.user1_id', userId).orWhere('c.user2_id', userId);
    })
    .andWhere('m.sender_id', '!=', userId)
    .andWhere('m.is_read', 0)
    .count('m.id as count')
    .first();
  return result ? Number(result.count) : 0;
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
