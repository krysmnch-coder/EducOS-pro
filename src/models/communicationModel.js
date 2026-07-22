const db = require('./db');

/**
 * Enregistre une nouvelle communication et l'associe à ses destinataires.
 * Utilise une transaction pour garantir l'atomicité de l'opération.
 */
async function sendCommunication({ senderId, subject, message, recipientType, recipientId, recipientRole }) {
  return db.transaction(async trx => {
    // 1. Insérer le message principal
    const [commIdObj] = await trx('communications')
      .insert({ sender_id: senderId, subject, message })
      .returning('id');
    const communicationId = commIdObj.id || commIdObj;

    // 2. Déterminer les IDs des destinataires
    let recipientIds = [];
    if (recipientType === 'user') {
      recipientIds.push(recipientId);
    } else if (recipientType === 'role') {
      const query = trx('users')
        .where('approved', 1)
        .andWhereNot('id', senderId)
        .select('id');

      if (recipientRole !== 'all') {
        query.andWhere('role', recipientRole);
      }
      const users = await query;
      recipientIds = users.map(u => u.id);
    }

    // 3. Insérer les destinataires en masse
    if (recipientIds.length > 0) {
      const recipientsData = recipientIds.map(id => ({
        communication_id: communicationId,
        recipient_id: id
      }));
      await trx('communication_recipients').insert(recipientsData);
    }

    return { communicationId, recipientIds };
  });
}

/**
 * Récupère toutes les communications pour un utilisateur donné.
 */
function getCommunicationsForUser(userId) {
  return db('communications as c')
    .select(
      'c.*',
      'u.name as sender_name',
      'u.avatar_url as sender_avatar_url'
    )
    .join('communication_recipients as cr', 'c.id', 'cr.communication_id')
    .join('users as u', 'c.sender_id', 'u.id')
    .where('cr.recipient_id', userId)
    .orderBy('c.created_at', 'desc');
}

/**
 * Compte le nombre total de messages.
 */
async function countTotalMessages() {
  const result = await db('communications').count('id as count').first();
  return result ? result.count : 0;
}

/**
 * Supprime une communication pour un utilisateur spécifique.
 * Cela ne supprime pas le message lui-même, mais seulement l'entrée
 * qui le lie à ce destinataire.
 */
function deleteCommunicationForUser(communicationId, userId) {
  return db('communication_recipients')
    .where({
      communication_id: communicationId,
      recipient_id: userId
    })
    .del();
}

module.exports = {
  sendCommunication,
  getCommunicationsForUser,
  countTotalMessages,
  deleteCommunicationForUser
};