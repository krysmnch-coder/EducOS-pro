const db = require('./src/models/db');

async function clearDatabase() {
  console.log('Début du nettoyage de la base de données...');
  console.log('ATTENTION : Cette action est irréversible et va supprimer toutes les données.');

  // Liste des tables à vider. L'ordre peut être important à cause des clés étrangères.
  // On vide les tables qui dépendent des autres en premier.
  const tables = [
    'notifications',
    'chat_messages',
    'conversations',
    'communication_recipients',
    'communications',
    'grades',
    'users',
    'establishments',
    'payments' // Ajout de la table des paiements au cas où elle existerait
  ];

  try {
    for (const table of tables) {
      const tableExists = await db.schema.hasTable(table);
      if (tableExists) {
        console.log(`- Vidage de la table : ${table}...`);
        await db(table).del(); // Utilise Knex pour faire un "DELETE FROM table"
        
        // Pour SQLite, il faut aussi réinitialiser la séquence d'auto-incrémentation
        await db('sqlite_sequence').where('name', table).del().catch(() => {
          // Ignore l'erreur si la table n'est pas dans sqlite_sequence (ex: pas d'autoincrement)
        });
      }
    }

    console.log('\nNettoyage de la base de données terminé avec succès.');
    console.log('Vous pouvez maintenant démarrer le serveur et vous inscrire pour devenir le super-administrateur.');

  } catch (error) {
    console.error('\nUne erreur est survenue lors du nettoyage de la base de données:', error);
  } finally {
    await db.destroy();
  }
}

clearDatabase();