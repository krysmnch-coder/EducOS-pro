/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('conversations', function(table) {
    // Index pour accélérer la recherche de conversations par utilisateur
    table.index(['user1_id', 'user2_id']);
  }).table('chat_messages', function(table) {
    // Index pour récupérer rapidement les messages d'une conversation
    table.index('conversation_id');
    // Index pour les requêtes de comptage de messages non lus
    table.index(['sender_id', 'is_read']);
    // Index pour le tri par date
    table.index('created_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('conversations', function(table) {
    table.dropIndex(['user1_id', 'user2_id']);
  }).table('chat_messages', function(table) {
    table.dropIndex('conversation_id');
    table.dropIndex(['sender_id', 'is_read']);
    table.dropIndex('created_at');
  });
};