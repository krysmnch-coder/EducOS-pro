const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Utiliser le dossier du projet sur Render
const dbDir = path.join(__dirname, '..', 'database');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'educos.db');
console.log('📁 Database path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Erreur database:', err.message);
    } else {
        console.log('✅ Connecté à SQLite');
        createTables();
    }
});

function createTables() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT CHECK(role IN ('admin', 'vie_scolaire', 'prof', 'parent', 'eleve')) NOT NULL, nom TEXT NOT NULL, prenom TEXT NOT NULL, civilite TEXT DEFAULT 'M.', date_naissance DATE, telephone TEXT, adresse TEXT, matiere_principale TEXT, classes_assignees TEXT, photo TEXT DEFAULT 'default.png', google_id TEXT, facebook_id TEXT, email_verified INTEGER DEFAULT 0, compte_actif INTEGER DEFAULT 1, derniere_connexion DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

        db.run(`CREATE TABLE IF NOT EXISTS etablissement (id INTEGER PRIMARY KEY DEFAULT 1, nom TEXT DEFAULT 'Mon Établissement', adresse TEXT DEFAULT '', telephone TEXT DEFAULT '', email TEXT DEFAULT '', site_web TEXT DEFAULT '', directeur TEXT DEFAULT '', annee_scolaire TEXT DEFAULT '2024-2025', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

        db.run(`CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY DEFAULT 1, app_name TEXT DEFAULT 'EducOS-pro', max_users INTEGER DEFAULT 5000, default_role TEXT DEFAULT 'eleve', maintenance_mode INTEGER DEFAULT 0, allow_registration INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

        db.run(`CREATE TABLE IF NOT EXISTS absences (id INTEGER PRIMARY KEY AUTOINCREMENT, eleve_id INTEGER NOT NULL, date_absence DATE NOT NULL, type TEXT NOT NULL CHECK(type IN ('absence', 'retard')), motif TEXT DEFAULT 'Non justifié', justifie INTEGER DEFAULT 0, duree_minutes INTEGER DEFAULT 0, signale_par TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

        db.run(`CREATE TABLE IF NOT EXISTS emploi_du_temps (id INTEGER PRIMARY KEY AUTOINCREMENT, classe TEXT NOT NULL, jour TEXT NOT NULL, heure_debut TIME NOT NULL, heure_fin TIME NOT NULL, matiere TEXT NOT NULL, prof_id INTEGER, salle TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

        db.run(`CREATE TABLE IF NOT EXISTS pointage (id INTEGER PRIMARY KEY AUTOINCREMENT, prof_id INTEGER NOT NULL, date_pointage DATE NOT NULL, heure_arrivee TIME, heure_depart TIME, statut TEXT, type_contrat TEXT, minutes_retard INTEGER DEFAULT 0, commentaire TEXT, modifie_par TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

        db.run(`CREATE TABLE IF NOT EXISTS avertissements (id INTEGER PRIMARY KEY AUTOINCREMENT, prof_id INTEGER NOT NULL, mois TEXT NOT NULL, total_minutes_retard INTEGER DEFAULT 0, avertissement_active INTEGER DEFAULT 0, message_avertissement TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

        db.run(`CREATE TABLE IF NOT EXISTS sanctions (id INTEGER PRIMARY KEY AUTOINCREMENT, eleve_id INTEGER NOT NULL, type_sanction TEXT NOT NULL, motif TEXT NOT NULL, gravite TEXT NOT NULL, date_sanction DATE NOT NULL, duree TEXT, notifie_parent INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

        db.run(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, expediteur_id INTEGER NOT NULL, destinataire_id INTEGER, destinataire_role TEXT DEFAULT 'all', sujet TEXT NOT NULL, contenu TEXT NOT NULL, fichier TEXT, lu INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

        db.run(`CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT DEFAULT 'message', titre TEXT NOT NULL, message TEXT NOT NULL, lu INTEGER DEFAULT 0, message_id INTEGER, lien TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

        db.run(`CREATE TABLE IF NOT EXISTS paiements (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, categorie TEXT NOT NULL, montant INTEGER NOT NULL, description TEXT, date_paiement DATE NOT NULL DEFAULT (date('now')), beneficiaire TEXT, mode_paiement TEXT DEFAULT 'especes', reference TEXT, user_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

        db.run(`CREATE TABLE IF NOT EXISTS ressources (id INTEGER PRIMARY KEY AUTOINCREMENT, prof_id INTEGER NOT NULL, titre TEXT NOT NULL, type TEXT NOT NULL, description TEXT, fichier TEXT, classe TEXT, matiere TEXT, date_limite DATE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

        db.run(`CREATE TABLE IF NOT EXISTS devoirs_rendus (id INTEGER PRIMARY KEY AUTOINCREMENT, ressource_id INTEGER NOT NULL, eleve_id INTEGER NOT NULL, fichier TEXT, commentaire TEXT, note REAL, rendu_le DATETIME DEFAULT CURRENT_TIMESTAMP)`);

        db.run(`CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, eleve_id INTEGER NOT NULL, matiere TEXT NOT NULL, classe TEXT NOT NULL, type_evaluation TEXT NOT NULL, note REAL NOT NULL, coefficient INTEGER DEFAULT 1, trimestre TEXT, annee_scolaire TEXT DEFAULT '2024-2025', prof_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

        db.run(`CREATE TABLE IF NOT EXISTS amis (id INTEGER PRIMARY KEY AUTOINCREMENT, eleve_id INTEGER NOT NULL, ami_id INTEGER NOT NULL, statut TEXT DEFAULT 'en_attente', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

        db.run(`CREATE TABLE IF NOT EXISTS groupes (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL, photo TEXT, createur_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

        db.run(`CREATE TABLE IF NOT EXISTS membres_groupes (id INTEGER PRIMARY KEY AUTOINCREMENT, groupe_id INTEGER NOT NULL, eleve_id INTEGER NOT NULL)`);

        db.run(`CREATE TABLE IF NOT EXISTS messages_groupes (id INTEGER PRIMARY KEY AUTOINCREMENT, groupe_id INTEGER NOT NULL, expediteur_id INTEGER NOT NULL, contenu TEXT NOT NULL, fichier TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

        db.run(`CREATE TABLE IF NOT EXISTS messages_amis (id INTEGER PRIMARY KEY AUTOINCREMENT, expediteur_id INTEGER NOT NULL, destinataire_id INTEGER NOT NULL, contenu TEXT NOT NULL, fichier TEXT, lu INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

        db.run(`INSERT OR IGNORE INTO etablissement (id) VALUES (1)`);
        db.run(`INSERT OR IGNORE INTO settings (id) VALUES (1)`);

        console.log('✅ Base de données initialisée');
    });
}
// Table settings
db.run(`CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    app_name TEXT DEFAULT 'EducOS-pro',
    max_users INTEGER DEFAULT 500,
    default_role TEXT DEFAULT 'eleve',
    maintenance_mode INTEGER DEFAULT 0,
    allow_registration INTEGER DEFAULT 1,
    notifications_active INTEGER DEFAULT 1,
    messagerie_active INTEGER DEFAULT 1,
    chat_eleves_active INTEGER DEFAULT 1,
    paiements_online_active INTEGER DEFAULT 0,
    email_verification INTEGER DEFAULT 0,
    session_duration INTEGER DEFAULT 24,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Insérer les valeurs par défaut si la table est vide
db.get('SELECT COUNT(*) as count FROM settings', [], (err, row) => {
    if (row && row.count === 0) {
        db.run(`INSERT INTO settings (id, app_name, max_users, default_role, maintenance_mode, allow_registration, notifications_active, messagerie_active, chat_eleves_active, paiements_online_active, email_verification, session_duration) VALUES (1, 'EducOS-pro', 500, 'eleve', 0, 1, 1, 1, 1, 0, 0, 24)`);
    }
});
module.exports = db;