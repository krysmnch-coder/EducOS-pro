// @ts-check

/**
 * @type { import('knex').Knex.Config }
 */
module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: './database.sqlite' // Utilise le même fichier que votre projet
    },
    useNullAsDefault: true, // Recommandé pour SQLite
    migrations: {
      directory: './db/migrations' // Dossier où seront stockées les migrations
    },
    seeds: {
      directory: './db/seeds' // Dossier pour les données de test (optionnel)
    }
  },

  production: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false } // Requis pour les connexions sécurisées sur Render
    },
    migrations: {
      directory: './db/migrations'
    },
    seeds: {
      directory: './db/seeds'
    }
  }
};