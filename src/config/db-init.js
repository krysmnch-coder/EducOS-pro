const db = require('../models/db');

async function initializeDatabase() {
  console.log('Vérification et initialisation de la base de données...');

  // Table des établissements
  const hasEstablishments = await db.schema.hasTable('establishments');
  if (!hasEstablishments) {
    console.log('Création de la table "establishments"...');
    await db.schema.createTable('establishments', table => {
      table.increments('id').primary();
      table.string('name').notNullable().unique();
      table.string('subdomain').notNullable().unique();
      table.timestamps(true, true);
    });
  }

  // Table des utilisateurs
  const hasUsers = await db.schema.hasTable('users');
  if (!hasUsers) {
    console.log('Création de la table "users"...');
    await db.schema.createTable('users', table => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.string('email').notNullable(); // La contrainte unique sera ajoutée plus tard si nécessaire pour SQLite
      table.string('password').notNullable();
      table.string('role').notNullable();
      table.integer('establishment_id').unsigned().references('id').inTable('establishments').onDelete('SET NULL');
      table.boolean('approved').defaultTo(false);
      table.string('subject');
      table.string('student_class');
      table.string('matricule').unique();
      table.text('children');
      table.string('avatar_url');
      table.text('manual_parents'); // Ajout de la colonne pour les parents manuels
      table.string('phone_number');
      table.date('date_of_birth');
      table.string('place_of_birth');
      table.string('address');
      table.text('parent_info');
      table.integer('created_by').unsigned().references('id').inTable('users').onDelete('SET NULL');
      table.timestamps(true, true);
      table.boolean('password_reset_required').defaultTo(false);
    });
  } else {
    // Si la table existe déjà, on vérifie si la colonne manque (migration simple)
    const hasPasswordResetCol = await db.schema.hasColumn('users', 'password_reset_required');
    if (!hasPasswordResetCol) {
      console.log('Mise à jour de la table "users": ajout de la colonne "password_reset_required"...');
      await db.schema.alterTable('users', table => {
        table.boolean('password_reset_required').defaultTo(false);
      });
    }
    // Vérifier et ajouter la colonne manual_parents si elle manque
    const hasManualParentsCol = await db.schema.hasColumn('users', 'manual_parents');
    if (!hasManualParentsCol) {
      console.log('Mise à jour de la table "users": ajout de la colonne "manual_parents"...');
      await db.schema.alterTable('users', table => {
        table.text('manual_parents');
      });
    }
  }

  // Table des communications
  const hasCommunications = await db.schema.hasTable('communications');
  if (!hasCommunications) {
    console.log('Création de la table "communications"...');
    await db.schema.createTable('communications', table => {
      table.increments('id').primary();
      table.integer('sender_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('subject').notNullable();
      table.text('message').notNullable();
      table.timestamps(true, true);
    });
  }

  // Table des destinataires de communications
  const hasCommRecipients = await db.schema.hasTable('communication_recipients');
  if (!hasCommRecipients) {
    console.log('Création de la table "communication_recipients"...');
    await db.schema.createTable('communication_recipients', table => {
      table.increments('id').primary();
      table.integer('communication_id').unsigned().notNullable().references('id').inTable('communications').onDelete('CASCADE');
      table.integer('recipient_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.boolean('is_read').defaultTo(false);
      table.unique(['communication_id', 'recipient_id']);
    });
  }

  // Table des conversations de chat
  const hasConversations = await db.schema.hasTable('conversations');
  if (!hasConversations) {
    console.log('Création de la table "conversations"...');
    await db.schema.createTable('conversations', table => {
      table.increments('id').primary();
      table.integer('user1_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('user2_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.timestamps(true, true);
      table.unique(['user1_id', 'user2_id']);
    });
  }

  // Table des messages de chat
  const hasChatMessages = await db.schema.hasTable('chat_messages');
  if (!hasChatMessages) {
    console.log('Création de la table "chat_messages"...');
    await db.schema.createTable('chat_messages', table => {
      table.increments('id').primary();
      table.integer('conversation_id').unsigned().notNullable().references('id').inTable('conversations').onDelete('CASCADE');
      table.integer('sender_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.text('message').notNullable();
      table.boolean('is_read').defaultTo(false);
      table.timestamps(true, true);
    });
  }

  // Table des notifications
  const hasNotifications = await db.schema.hasTable('notifications');
  if (!hasNotifications) {
    console.log('Création de la table "notifications"...');
    await db.schema.createTable('notifications', table => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('user_role');
      table.string('type').notNullable();
      table.string('title').notNullable();
      table.text('body');
      table.string('link');
      table.boolean('is_read').defaultTo(false);
      table.timestamps(true, true);
    });
  }

  // Table des notes
  const hasGrades = await db.schema.hasTable('grades');
  if (!hasGrades) {
    console.log('Création de la table "grades"...');
    await db.schema.createTable('grades', table => {
      table.increments('id').primary();
      table.integer('establishment_id').notNullable().index();
      table.integer('student_id').notNullable();
      table.string('class_name', 100).notNullable();
      table.string('subject').notNullable();
      table.string('period', 10).defaultTo('1');
      table.decimal('nj1', 5, 2);
      table.decimal('nj2', 5, 2);
      table.decimal('examen', 5, 2);
      table.text('comment');
      table.integer('created_by').notNullable();
      table.timestamps(true, true);
      table.unique(['student_id', 'class_name', 'subject', 'period'], 'unique_grade');
    });
  }

  // Table de liaison parent-élève (C'EST LA TABLE MANQUANTE)
  const hasParentStudentLinks = await db.schema.hasTable('parent_student_links');
  if (!hasParentStudentLinks) {
    console.log('Création de la table "parent_student_links"...');
    await db.schema.createTable('parent_student_links', table => {
      table.increments('id').primary();
      table.integer('parent_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('student_matricule').notNullable();
      table.string('student_first_name').notNullable();
      table.string('student_last_name').notNullable();
      table.string('student_class');
      table.timestamps(true, true);
      table.unique(['parent_id', 'student_matricule']);
    });
  }

  console.log('Vérification de la base de données terminée.');
}

module.exports = initializeDatabase;
