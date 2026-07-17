/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  // Cette migration crée la table nécessaire pour stocker les sessions
  // utilisateur avec connect-pg-simple, ce qui est la méthode recommandée
  // pour la production.
  return knex.schema.createTable('user_sessions', (table) => {
    table.string('sid').primary();
    table.json('sess').notNullable();
    table.timestamp('expire', { useTz: true }).notNullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('user_sessions');
};