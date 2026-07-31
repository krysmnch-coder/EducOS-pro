/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('events', function(table) {
    table.increments('id').primary();
    table.integer('establishment_id').unsigned().notNullable();
    table.string('title', 255).notNullable();
    table.text('description');
    table.enum('event_type', ['holiday', 'exam', 'meeting', 'event', 'other']).defaultTo('event');
    table.date('start_date').notNullable();
    table.date('end_date').notNullable();
    table.string('color', 7).defaultTo('#0d6efd');
    table.integer('created_by').unsigned().notNullable();

    // Crée les colonnes `created_at` et `updated_at` automatiquement
    table.timestamps(true, true);

    // Définition des clés étrangères
    table.foreign('establishment_id').references('id').inTable('establishments').onDelete('CASCADE');
    table.foreign('created_by').references('id').inTable('users').onDelete('CASCADE');

    // Définition des index
    table.index('establishment_id', 'idx_establishment');
    table.index(['start_date', 'end_date'], 'idx_dates');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('events');
};
