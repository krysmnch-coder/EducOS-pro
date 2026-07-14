const knex = require('knex');

let knexConfig;

// Détecte si l'application est en mode production (ce sera le cas sur Render)
if (process.env.NODE_ENV === 'production') {
  // Configuration pour la production (PostgreSQL sur Render)
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set for production.');
  }
  knexConfig = {
    client: 'pg', // On utilise le client PostgreSQL
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false } // Requis pour les connexions sécurisées sur Render
    },
    pool: {
      min: 2,
      max: 10
    }
  };
} else {
  // Configuration pour le développement (SQLite, comme avant)
  knexConfig = {
    client: 'sqlite3',
    connection: {
      filename: './dev.sqlite3'
    },
    useNullAsDefault: true
  };
}

const db = knex(knexConfig);

console.log(`Instance Knex initialisée pour la base de données en mode : ${process.env.NODE_ENV || 'development'}.`);

module.exports = db;
