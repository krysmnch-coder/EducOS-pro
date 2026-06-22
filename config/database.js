const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Dossier database
const dbDir = process.env.FLY_APP_NAME ? '/data' : path.join(__dirname, '..', 'database');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

// Base GLOBALE
const globalDbPath = path.join(dbDir, 'educos_global.db');
const globalDb = new Database(globalDbPath);
globalDb.pragma('journal_mode = WAL');

globalDb.exec(`
    CREATE TABLE IF NOT EXISTS etablissements (
        id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, nom TEXT NOT NULL,
        adresse TEXT DEFAULT '', telephone TEXT DEFAULT '', email TEXT DEFAULT '',
        site_web TEXT DEFAULT '', directeur TEXT DEFAULT '', annee_scolaire TEXT DEFAULT '2024-2025',
        db_name TEXT NOT NULL, max_users INTEGER DEFAULT 1500, actif INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
        nom TEXT NOT NULL, prenom TEXT NOT NULL, etablissement_code TEXT,
        compte_actif INTEGER DEFAULT 1, derniere_connexion DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);
console.log('✅ Base globale prête');

let etablissementDb = null;

function getEtablissementDb() { return etablissementDb; }

function setEtablissementDb(dbPath) {
    if (etablissementDb) try { etablissementDb.close(); } catch(e) {}
    console.log('📁 Ouverture base:', dbPath);
    etablissementDb = new Database(dbPath);
    etablissementDb.pragma('journal_mode = WAL');
    etablissementDb.exec(`
        CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL, nom TEXT NOT NULL, prenom TEXT NOT NULL, telephone TEXT, matiere_principale TEXT, classes_assignees TEXT, date_naissance DATE, compte_actif INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY DEFAULT 1);
        CREATE TABLE IF NOT EXISTS absences (id INTEGER PRIMARY KEY AUTOINCREMENT, eleve_id INTEGER NOT NULL, date_absence DATE NOT NULL, type TEXT NOT NULL, motif TEXT DEFAULT 'Non justifié', justifie INTEGER DEFAULT 0, duree_minutes INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS emploi_du_temps (id INTEGER PRIMARY KEY AUTOINCREMENT, classe TEXT NOT NULL, jour TEXT NOT NULL, heure_debut TIME NOT NULL, heure_fin TIME NOT NULL, matiere TEXT NOT NULL, prof_id INTEGER, salle TEXT);
        CREATE TABLE IF NOT EXISTS pointage (id INTEGER PRIMARY KEY AUTOINCREMENT, prof_id INTEGER NOT NULL, date_pointage DATE NOT NULL, heure_arrivee TIME, heure_depart TIME, statut TEXT, type_contrat TEXT, minutes_retard INTEGER DEFAULT 0, commentaire TEXT);
        CREATE TABLE IF NOT EXISTS sanctions (id INTEGER PRIMARY KEY AUTOINCREMENT, eleve_id INTEGER NOT NULL, type_sanction TEXT NOT NULL, motif TEXT NOT NULL, gravite TEXT NOT NULL, date_sanction DATE NOT NULL);
        CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, expediteur_id INTEGER NOT NULL, destinataire_id INTEGER, destinataire_role TEXT DEFAULT 'all', sujet TEXT NOT NULL, contenu TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT DEFAULT 'message', titre TEXT NOT NULL, message TEXT NOT NULL, lu INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS paiements (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, categorie TEXT NOT NULL, montant INTEGER NOT NULL, description TEXT, date_paiement DATE NOT NULL DEFAULT (date('now')));
        CREATE TABLE IF NOT EXISTS ressources (id INTEGER PRIMARY KEY AUTOINCREMENT, prof_id INTEGER NOT NULL, titre TEXT NOT NULL, type TEXT NOT NULL, description TEXT, fichier TEXT, classe TEXT, matiere TEXT, date_limite DATE);
        CREATE TABLE IF NOT EXISTS devoirs_rendus (id INTEGER PRIMARY KEY AUTOINCREMENT, ressource_id INTEGER NOT NULL, eleve_id INTEGER NOT NULL, fichier TEXT, note REAL);
        CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, eleve_id INTEGER NOT NULL, matiere TEXT NOT NULL, classe TEXT NOT NULL, type_evaluation TEXT NOT NULL, note REAL NOT NULL, coefficient INTEGER DEFAULT 1, trimestre TEXT, prof_id INTEGER);
        CREATE TABLE IF NOT EXISTS fiches_eleves (id INTEGER PRIMARY KEY AUTOINCREMENT, parent_id INTEGER, nom TEXT NOT NULL, prenom TEXT NOT NULL, classe_actuelle TEXT, pere_nom TEXT, pere_telephone TEXT, mere_nom TEXT, mere_telephone TEXT, allergie INTEGER DEFAULT 0, asthme INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS amis (id INTEGER PRIMARY KEY AUTOINCREMENT, eleve_id INTEGER NOT NULL, ami_id INTEGER NOT NULL, statut TEXT DEFAULT 'en_attente');
        CREATE TABLE IF NOT EXISTS groupes (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL, createur_id INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS membres_groupes (id INTEGER PRIMARY KEY AUTOINCREMENT, groupe_id INTEGER NOT NULL, eleve_id INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS messages_groupes (id INTEGER PRIMARY KEY AUTOINCREMENT, groupe_id INTEGER NOT NULL, expediteur_id INTEGER NOT NULL, contenu TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS messages_amis (id INTEGER PRIMARY KEY AUTOINCREMENT, expediteur_id INTEGER NOT NULL, destinataire_id INTEGER NOT NULL, contenu TEXT NOT NULL, lu INTEGER DEFAULT 0);
        INSERT OR IGNORE INTO settings (id) VALUES (1);
    `);
    console.log('✅ Tables établissement créées');
    return etablissementDb;
}

module.exports = { globalDb, getEtablissementDb, setEtablissementDb };