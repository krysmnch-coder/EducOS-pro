// add_columns.js
const knex = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: './database.sqlite'
  },
  useNullAsDefault: true
});

async function addColumns() {
  try {
    console.log('🔧 Vérification des colonnes de la table grades...');
    
    // Récupérer les colonnes existantes
    const columns = await knex('grades').columnInfo();
    console.log('📊 Colonnes actuelles:', Object.keys(columns));
    
    // Liste des colonnes à ajouter
    const columnsToAdd = [
      { name: 'class_name', type: 'text' },
      { name: 'establishment_id', type: 'integer', default: 1 },
      { name: 'period', type: 'integer', default: 1 },
      { name: 'nj1', type: 'float' },
      { name: 'nj2', type: 'float' },
      { name: 'examen', type: 'float' }
    ];
    
    let addedCount = 0;
    
    for (const col of columnsToAdd) {
      if (!columns[col.name]) {
        try {
          await knex.schema.alterTable('grades', (table) => {
            if (col.default !== undefined) {
              table[col.type](col.name).defaultTo(col.default);
            } else {
              table[col.type](col.name);
            }
          });
          console.log(`✅ Colonne ${col.name} ajoutée`);
          addedCount++;
        } catch (err) {
          console.log(`⚠️ Erreur pour ${col.name}:`, err.message);
        }
      } else {
        console.log(`ℹ️ Colonne ${col.name} existe déjà`);
      }
    }
    
    if (addedCount === 0) {
      console.log('✅ Aucune colonne à ajouter, tout est déjà en place !');
    } else {
      console.log(`✅ ${addedCount} colonne(s) ajoutée(s) avec succès !`);
    }
    
    // Vérifier la structure finale
    const finalColumns = await knex('grades').columnInfo();
    console.log('\n📊 Structure finale:', Object.keys(finalColumns));
    
  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await knex.destroy();
  }
}

addColumns();