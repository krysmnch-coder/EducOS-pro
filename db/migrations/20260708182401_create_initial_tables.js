/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    .createTable('users', function (table) {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.string('email').notNullable().unique();
      table.string('password').notNullable();
      table.string('role').notNullable();
      table.boolean('approved').defaultTo(false);
      table.string('subject');
      table.string('student_class');
      table.string('matricule').unique();
      table.text('children'); // JSON
      table.string('avatar_url').defaultTo('/img/user.png');
      table.string('phone_number');
      table.string('date_of_birth');
      table.string('place_of_birth');
      table.string('address');
      table.text('parent_info'); // JSON
      table.integer('created_by').unsigned().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    .createTable('communications', function (table) {
      table.increments('id').primary();
      table.integer('sender_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('subject').notNullable();
      table.text('message').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    .createTable('communication_recipients', function (table) {
      table.increments('id').primary();
      table.integer('communication_id').unsigned().notNullable().references('id').inTable('communications').onDelete('CASCADE');
      table.integer('recipient_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.boolean('is_read').defaultTo(false);
    })
    .createTable('conversations', function (table) {
        table.increments('id').primary();
        table.integer('user1_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.integer('user2_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.unique(['user1_id', 'user2_id']);
    })
    .createTable('chat_messages', function (table) {
        table.increments('id').primary();
        table.integer('conversation_id').unsigned().notNullable().references('id').inTable('conversations').onDelete('CASCADE');
        table.integer('sender_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.text('message').notNullable();
        table.boolean('is_read').defaultTo(false);
        table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    .createTable('notifications', function (table) {
        table.increments('id').primary();
        table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.string('user_role');
        table.string('type').notNullable();
        table.string('title').notNullable();
        table.text('body');
        table.string('link');
        table.boolean('is_read').defaultTo(false);
        table.timestamp('created_at').defaultTo(knex.fn.now());
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  // L'ordre est l'inverse de la création pour respecter les contraintes de clé étrangère
  return knex.schema
    .dropTableIfExists('notifications')
    .dropTableIfExists('chat_messages')
    .dropTableIfExists('conversations')
    .dropTableIfExists('communication_recipients')
    .dropTableIfExists('communications')
    .dropTableIfExists('users');
};
