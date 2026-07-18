/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  // Cette migration crée la table nécessaire pour stocker les sessions utilisateur en base de données,
  // ce qui est requis par `connect-pg-simple` en production.
  return knex.schema.createTable('user_sessions', (table) => {
    table.string('sid').primary(); // Identifiant de session
    table.json('sess').notNullable(); // Données de session au format JSON
    table.timestamp('expire', { useTz: true }).notNullable().index(); // Date d'expiration, avec un index pour la performance
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('user_sessions');
};