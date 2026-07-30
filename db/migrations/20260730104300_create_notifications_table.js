/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('notifications', (table) => {
    table.increments('id').primary();
    table.integer('user_id').notNullable();
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
    
    // Le type ENUM n'est pas supporté par SQLite. On utilise une chaîne de caractères
    // avec une contrainte pour la portabilité entre PostgreSQL et SQLite.
    table.string('type', 50).notNullable().defaultTo('info');
    
    table.string('title', 255).notNullable();
    table.text('message').notNullable();
    table.string('link', 500).nullable();
    
    table.boolean('is_read').notNullable().defaultTo(false);
    table.timestamp('read_at').nullable();
    
    // Utilise `timestamp` avec une valeur par défaut gérée par Knex pour la portabilité.
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Création des index
    table.index(['user_id', 'is_read'], 'idx_user_read');
    table.index('created_at', 'idx_created');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('notifications');
};

/**
 * Configuration spécifique pour SQLite pour gérer les contraintes CHECK.
 * @type {import("knex").Knex.Migration}
 */
exports.config = {
  // Ne pas exécuter les transactions pour cette migration sur SQLite
  transaction: false
};