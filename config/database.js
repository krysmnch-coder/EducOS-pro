const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '..', 'database');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

// Base GLOBALE
const globalDbPath = path.join(dbDir, 'educos_global.db');
const globalDb = new sqlite3.Database(globalDbPath, (err) => {
    if (err) console.error('❌ Erreur globale:', err.message);
    else {
        console.log('✅ Base globale connectée');
        globalDb.serialize(() => {
            globalDb.run(`CREATE TABLE IF NOT EXISTS etablissements (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, nom TEXT NOT NULL, adresse TEXT DEFAULT '', telephone TEXT DEFAULT '', email TEXT DEFAULT '', site_web TEXT DEFAULT '', directeur TEXT DEFAULT '', annee_scolaire TEXT DEFAULT '2024-2025', db_name TEXT NOT NULL, max_users INTEGER DEFAULT 1500, actif INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            globalDb.run(`CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, nom TEXT NOT NULL, prenom TEXT NOT NULL, etablissement_code TEXT, compte_actif INTEGER DEFAULT 1, derniere_connexion DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            console.log('✅ Tables globales créées');
        });
    }
});

// Base ÉTABLISSEMENT
let etablissementDb = null;

function getEtablissementDb() { return etablissementDb; }

function setEtablissementDb(dbPath) {
    if (etablissementDb) try { etablissementDb.close(); } catch(e) {}
    console.log('📁 Ouverture base:', dbPath);
    
    etablissementDb = new sqlite3.Database(dbPath, (err) => {
        if (err) { 
            console.error('❌ Erreur:', err.message); 
            etablissementDb = null; 
            return;
        }
        
        console.log('✅ Base établissement connectée');
        
        etablissementDb.serialize(() => {
            // Table users
            etablissementDb.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL, nom TEXT NOT NULL, prenom TEXT NOT NULL, civilite TEXT DEFAULT 'M.', telephone TEXT, matiere_principale TEXT, classes_assignees TEXT, date_naissance DATE, photo TEXT DEFAULT 'default.png', google_id TEXT, facebook_id TEXT, email_verified INTEGER DEFAULT 0, compte_actif INTEGER DEFAULT 1, derniere_connexion DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            
            // Table settings
            etablissementDb.run(`CREATE TABLE IF NOT EXISTS settings (
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
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            
            // Insérer les valeurs par défaut si la table est vide
            etablissementDb.run(`INSERT OR IGNORE INTO settings (id, max_users, default_role, allow_registration, maintenance_mode, notifications_active, messagerie_active, chat_eleves_active, paiements_online_active) VALUES (1, 500, 'eleve', 1, 0, 1, 1, 1, 0)`);
            
            // Tables absences
            etablissementDb.run(`CREATE TABLE IF NOT EXISTS absences (id INTEGER PRIMARY KEY AUTOINCREMENT, eleve_id INTEGER NOT NULL, date_absence DATE NOT NULL, type TEXT NOT NULL, motif TEXT DEFAULT 'Non justifié', justifie INTEGER DEFAULT 0, duree_minutes INTEGER DEFAULT 0, signale_par TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            
            // Tables EDT
            etablissementDb.run(`CREATE TABLE IF NOT EXISTS emploi_du_temps (id INTEGER PRIMARY KEY AUTOINCREMENT, classe TEXT NOT NULL, jour TEXT NOT NULL, heure_debut TIME NOT NULL, heure_fin TIME NOT NULL, matiere TEXT NOT NULL, prof_id INTEGER, salle TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            
            // Tables pointage
            etablissementDb.run(`CREATE TABLE IF NOT EXISTS pointage (id INTEGER PRIMARY KEY AUTOINCREMENT, prof_id INTEGER NOT NULL, date_pointage DATE NOT NULL, heure_arrivee TIME, heure_depart TIME, statut TEXT, type_contrat TEXT, minutes_retard INTEGER DEFAULT 0, commentaire TEXT, modifie_par TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            
            // Tables avertissements
            etablissementDb.run(`CREATE TABLE IF NOT EXISTS avertissements (id INTEGER PRIMARY KEY AUTOINCREMENT, prof_id INTEGER NOT NULL, mois TEXT NOT NULL, total_minutes_retard INTEGER DEFAULT 0, avertissement_active INTEGER DEFAULT 0, message_avertissement TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            
            // Tables sanctions
            etablissementDb.run(`CREATE TABLE IF NOT EXISTS sanctions (id INTEGER PRIMARY KEY AUTOINCREMENT, eleve_id INTEGER NOT NULL, type_sanction TEXT NOT NULL, motif TEXT NOT NULL, gravite TEXT NOT NULL, date_sanction DATE NOT NULL, duree TEXT, notifie_parent INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            
            // Tables messages
            etablissementDb.run(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, expediteur_id INTEGER NOT NULL, destinataire_id INTEGER, destinataire_role TEXT DEFAULT 'all', sujet TEXT NOT NULL, contenu TEXT NOT NULL, fichier TEXT, lu INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            
            // Tables notifications
            etablissementDb.run(`CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT DEFAULT 'message', titre TEXT NOT NULL, message TEXT NOT NULL, lu INTEGER DEFAULT 0, message_id INTEGER, lien TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            
            // Tables paiements
            etablissementDb.run(`CREATE TABLE IF NOT EXISTS paiements (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, categorie TEXT NOT NULL, montant INTEGER NOT NULL, description TEXT, date_paiement DATE NOT NULL DEFAULT (date('now')), beneficiaire TEXT, mode_paiement TEXT DEFAULT 'especes', reference TEXT, user_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            
            // Tables ressources
            etablissementDb.run(`CREATE TABLE IF NOT EXISTS ressources (id INTEGER PRIMARY KEY AUTOINCREMENT, prof_id INTEGER NOT NULL, titre TEXT NOT NULL, type TEXT NOT NULL, description TEXT, fichier TEXT, classe TEXT, matiere TEXT, date_limite DATE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            
            // Tables devoirs_rendus
            etablissementDb.run(`CREATE TABLE IF NOT EXISTS devoirs_rendus (id INTEGER PRIMARY KEY AUTOINCREMENT, ressource_id INTEGER NOT NULL, eleve_id INTEGER NOT NULL, fichier TEXT, commentaire TEXT, note REAL, rendu_le DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            
            // Tables notes
            etablissementDb.run(`CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, eleve_id INTEGER NOT NULL, matiere TEXT NOT NULL, classe TEXT NOT NULL, type_evaluation TEXT NOT NULL, note REAL NOT NULL, coefficient INTEGER DEFAULT 1, trimestre TEXT, annee_scolaire TEXT DEFAULT '2024-2025', prof_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            
            // Tables fiches_eleves
            etablissementDb.run(`CREATE TABLE IF NOT EXISTS fiches_eleves (id INTEGER PRIMARY KEY AUTOINCREMENT, parent_id INTEGER, nom TEXT NOT NULL, prenom TEXT NOT NULL, date_naissance TEXT, lieu_naissance TEXT, adresse TEXT, classe_actuelle TEXT, numero_matricule TEXT, ecole_precedente TEXT, annee_inscription TEXT, reinscription INTEGER DEFAULT 0, pere_nom TEXT, pere_prenom TEXT, pere_profession TEXT, pere_lieu_travail TEXT, pere_email TEXT, pere_telephone TEXT, mere_nom TEXT, mere_prenom TEXT, mere_profession TEXT, mere_lieu_travail TEXT, mere_email TEXT, mere_telephone TEXT, allergie INTEGER DEFAULT 0, allergie_detail TEXT, asthme INTEGER DEFAULT 0, diabete INTEGER DEFAULT 0, convulsion INTEGER DEFAULT 0, autres_maladies TEXT, mesure_crise TEXT, contact1_nom TEXT, contact1_telephone TEXT, contact2_nom TEXT, contact2_telephone TEXT, antecedent_personnel TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            
            // Tables amis
            etablissementDb.run(`CREATE TABLE IF NOT EXISTS amis (id INTEGER PRIMARY KEY AUTOINCREMENT, eleve_id INTEGER NOT NULL, ami_id INTEGER NOT NULL, statut TEXT DEFAULT 'en_attente', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            
            // Tables groupes
            etablissementDb.run(`CREATE TABLE IF NOT EXISTS groupes (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL, photo TEXT, createur_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            
            // Tables membres_groupes
            etablissementDb.run(`CREATE TABLE IF NOT EXISTS membres_groupes (id INTEGER PRIMARY KEY AUTOINCREMENT, groupe_id INTEGER NOT NULL, eleve_id INTEGER NOT NULL)`);
            
            // Tables messages_groupes
            etablissementDb.run(`CREATE TABLE IF NOT EXISTS messages_groupes (id INTEGER PRIMARY KEY AUTOINCREMENT, groupe_id INTEGER NOT NULL, expediteur_id INTEGER NOT NULL, contenu TEXT NOT NULL, fichier TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            
            // Tables messages_amis
            etablissementDb.run(`CREATE TABLE IF NOT EXISTS messages_amis (id INTEGER PRIMARY KEY AUTOINCREMENT, expediteur_id INTEGER NOT NULL, destinataire_id INTEGER NOT NULL, contenu TEXT NOT NULL, fichier TEXT, lu INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            
            console.log('✅ Tables établissement créées');
        });
    });
    
    return etablissementDb;
}

module.exports = { globalDb, getEtablissementDb, setEtablissementDb };