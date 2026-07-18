const db = require('./src/models/db');

async function clearDatabase() {
  console.log('Début du nettoyage de la base de données...');
  console.log('ATTENTION : Cette action est irréversible et va supprimer toutes les données.');

  // Liste des tables à vider. L'ordre est crucial à cause des clés étrangères.
  // On vide les tables "enfants" avant les tables "parents".
  const tables = [
    // Tables dépendantes
    'chat_messages',
    'communication_recipients',
    'grades',
    'parent_student_links', // Table de liaison
    'payments',
    'notifications',
    
    // Tables parentes des précédentes
    'conversations',
    'communications',

    // Table des sessions
    'user_sessions',

    // Table des utilisateurs (dépend de 'establishments')
    'users',

    // Table de base
    'establishments',
  ];

  try {
    for (const table of tables) {
      const tableExists = await db.schema.hasTable(table);
      if (tableExists) {
        console.log(`- Vidage de la table : ${table}...`);
        await db(table).del(); // Utilise Knex pour faire un "DELETE FROM table"
        
        // Pour SQLite, il faut aussi réinitialiser la séquence d'auto-incrémentation
        // Cette partie est spécifique à SQLite et peut échouer sans risque sur PostgreSQL.
        if (db.client.config.client === 'sqlite3') {
            await db('sqlite_sequence').where('name', table).del().catch(() => {
              // Ignore l'erreur si la table n'est pas dans sqlite_sequence (ex: pas d'autoincrement)
            });
        }
      } else {
        console.log(`- La table '${table}' n'existe pas, ignorée.`);
      }
    }

    console.log('\nNettoyage de la base de données terminé avec succès.');
    console.log('Vous pouvez maintenant lancer la commande "npx knex migrate:latest" pour reconstruire la structure.');

  } catch (error) {
    console.error('\nUne erreur est survenue lors du nettoyage de la base de données:', error);
  } finally {
    await db.destroy();
  }
}

clearDatabase();