/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  // Crée la table pour stocker les sessions utilisateur
  return knex.schema.createTable('user_sessions', function(table) {
    table.string('sid').primary();
    table.json('sess').notNullable();
    // Utilise un timestamp avec fuseau horaire pour la compatibilité avec PostgreSQL
    table.timestamp('expire', { useTz: true }).notNullable().index();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  // Supprime la table des sessions
  return knex.schema.dropTableIfExists('user_sessions');
};
