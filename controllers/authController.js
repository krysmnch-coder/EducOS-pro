const bcrypt = require('bcryptjs');
const { globalDb, setEtablissementDb, getEtablissementDb } = require('../config/database');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const authController = {
    // Inscription ADMIN
    registerAdmin: (req, res) => {
        const { nom, prenom, email, password, confirm_password, etablissement_nom, adresse, telephone, directeur, annee_scolaire } = req.body;
        
        if (!nom || !prenom || !email || !password || !etablissement_nom) {
            return res.redirect('/auth/register?error=Tous les champs obligatoires');
        }
        if (password !== confirm_password) return res.redirect('/auth/register?error=Mots de passe différents');
        if (password.length < 8) return res.redirect('/auth/register?error=Minimum 8 caractères');

        globalDb.get('SELECT id FROM admins WHERE email = ?', [email], (err, user) => {
            if (user) return res.redirect('/auth/register?error=Email déjà utilisé');

            const nomClean = etablissement_nom.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            const code = 'ETAB_' + nomClean.substring(0, 10);
            const dbName = 'educos_' + code.toLowerCase() + '.db';
            const dbDir = process.env.RENDER ? '/opt/render/project/src/database' : path.join(__dirname, '..', 'database');
            const dbPath = path.join(dbDir, dbName);

            globalDb.get('SELECT id FROM etablissements WHERE code = ?', [code], (err, exist) => {
                const finalCode = exist ? code + '_' + Date.now().toString(36).toUpperCase().substring(0, 3) : code;
                const finalDbName = 'educos_' + finalCode.toLowerCase() + '.db';
                const finalDbPath = path.join(dbDir, finalDbName);
                
                console.log('🏫 Tentative création établissement:', etablissement_nom);
                console.log('📁 Chemin base:', finalDbPath);
                
                globalDb.run('INSERT INTO etablissements (code, nom, adresse, telephone, directeur, annee_scolaire, db_name) VALUES (?,?,?,?,?,?,?)',
                    [finalCode, etablissement_nom, adresse||'', telephone||'', directeur||'', annee_scolaire||'2024-2025', finalDbName], function(err) {
                    if (err) return res.redirect('/auth/register?error=Erreur création établissement');

                    const db = setEtablissementDb(finalDbPath);

                    bcrypt.hash(password, 10, (err, hash) => {
                        if (err) return res.redirect('/auth/register?error=Erreur serveur');
                        
                        console.log('👤 Tentative création admin:', email, finalCode);
                        
                        // Créer l'admin dans la base établissement (pour interagir avec ses utilisateurs)
                        db.run('INSERT INTO users (nom, prenom, email, password, role) VALUES (?,?,?,?,?)',
                            [nom, prenom, email, hash, 'admin'], function(err) {
                            
                            // Créer l'admin dans la base globale (pour le login)
                            globalDb.run('INSERT INTO admins (nom, prenom, email, password, etablissement_code) VALUES (?,?,?,?,?)',
                                [nom, prenom, email, hash, finalCode], function(err) {
                                    if (err) {
                                        console.error('❌ Erreur création admin:', err.message);
                                        return res.redirect('/auth/register?error=Erreur création compte');
                                    }
                                    console.log('✅ Admin créé avec succès');
                                    res.redirect('/auth/login?success=' + encodeURIComponent('✅ Compte créé ! Code établissement : ' + finalCode));
                                });
                        });
                    });
                });
            });
        });
    },

    // Inscription utilisateur (profs, parents, élèves)
    register: (req, res) => {
    const { nom, prenom, email, password, confirm_password, role, etablissement_code } = req.body;

    if (!nom || !prenom || !email || !password || !role || !etablissement_code) {
        return res.redirect('/auth/register?error=Tous les champs sont obligatoires (dont l\'établissement)');
    }
    if (password !== confirm_password) return res.redirect('/auth/register?error=Les mots de passe ne correspondent pas');
    if (password.length < 8) return res.redirect('/auth/register?error=Minimum 8 caractères');

    const { globalDb, setEtablissementDb } = require('../config/database');
    
    // Trouver l'établissement
    globalDb.get("SELECT * FROM etablissements WHERE code = ? AND actif = 1", [etablissement_code], (err, etab) => {
        if (err || !etab) return res.redirect('/auth/register?error=Établissement non trouvé');
        
        // Connecter la base de l'établissement
        const dbPath = path.join(__dirname, '..', 'database', etab.db_name);
        const db = setEtablissementDb(dbPath);
        if (!db) return res.redirect('/auth/register?error=Erreur connexion base');
        
        // Vérifier les paramètres
        db.get("SELECT allow_registration, max_users FROM settings WHERE id = 1", [], (err, settings) => {
            if (err) return res.redirect('/auth/register?error=Erreur serveur');
            
            // Vérifier si inscriptions autorisées
            if (settings && settings.allow_registration == 0) {
                return res.redirect('/auth/register?error=⛔ Les inscriptions sont désactivées pour cet établissement');
            }
            
            // Vérifier limite utilisateurs
            db.get("SELECT COUNT(*) as total FROM users", [], (err, row) => {
                if (settings && settings.max_users && row && row.total >= settings.max_users) {
                    return res.redirect('/auth/register?error=⛔ Nombre maximum d\'utilisateurs atteint (' + settings.max_users + ')');
                }
                
                // Vérifier email
                db.get('SELECT id FROM users WHERE email = ?', [email], (err, user) => {
                    if (user) return res.redirect('/auth/register?error=Email déjà utilisé');
                    
                    bcrypt.hash(password, 10, (err, hashedPassword) => {
                        if (err) return res.redirect('/auth/register?error=Erreur serveur');
                        
                        const matiere_principale = req.body.matiere_principale || null;
                        const classes_assignees = req.body.classes_assignees || null;
                        const classe_eleve = req.body.classe_eleve || null;
                        const date_naissance = req.body.date_naissance || null;

                        if (role === 'parent') {
                            const enfantsNoms = [].concat(req.body.enfant_nom || []).filter(Boolean);
                            const enfantsPrenoms = [].concat(req.body.enfant_prenom || []).filter(Boolean);
                            const enfantsClasses = [].concat(req.body.enfant_classe || []).filter(Boolean);
                            const enfants = [];
                            for (let i = 0; i < enfantsNoms.length; i++) {
                                if (enfantsNoms[i] && enfantsPrenoms[i]) {
                                    enfants.push({ nom: enfantsNoms[i], prenom: enfantsPrenoms[i], classe: enfantsClasses[i] || '' });
                                }
                            }
                            db.run('INSERT INTO users (nom, prenom, email, password, role, classes_assignees) VALUES (?,?,?,?,?,?)',
                                [nom, prenom, email, hashedPassword, role, JSON.stringify(enfants)], function(err) {
                                    if (err) return res.redirect('/auth/register?error=Erreur inscription');
                                    res.redirect('/auth/login?success=Compte créé !');
                                });
                        } else if (role === 'eleve') {
                            db.run('INSERT INTO users (nom, prenom, email, password, role, classes_assignees, date_naissance) VALUES (?,?,?,?,?,?,?)',
                                [nom, prenom, email, hashedPassword, role, classe_eleve, date_naissance], function(err) {
                                    if (err) return res.redirect('/auth/register?error=Erreur inscription');
                                    res.redirect('/auth/login?success=Compte créé !');
                                });
                        } else if (role === 'prof') {
                            db.run('INSERT INTO users (nom, prenom, email, password, role, matiere_principale, classes_assignees) VALUES (?,?,?,?,?,?,?)',
                                [nom, prenom, email, hashedPassword, role, matiere_principale, classes_assignees], function(err) {
                                    if (err) return res.redirect('/auth/register?error=Erreur inscription');
                                    res.redirect('/auth/login?success=Compte créé !');
                                });
                        } else {
                            db.run('INSERT INTO users (nom, prenom, email, password, role) VALUES (?,?,?,?,?)',
                                [nom, prenom, email, hashedPassword, role], function(err) {
                                    if (err) return res.redirect('/auth/register?error=Erreur inscription');
                                    res.redirect('/auth/login?success=Compte créé !');
                                });
                        }
                        // Pour l'admin : créer l'établissement
if (role === 'admin') {
    const etablissement_nom = req.body.etablissement_nom;
    if (!etablissement_nom) return res.redirect('/auth/register?error=Nom de l\'établissement requis');
    
    // Générer un code unique
    const code = 'ETAB-' + Date.now().toString(36).toUpperCase();
    const dbName = 'educos_' + code.toLowerCase() + '.db';
    
    // Insérer dans la base globale
    globalDb.run(
        'INSERT INTO etablissements (code, nom, email, telephone, adresse, directeur, db_name) VALUES (?,?,?,?,?,?,?)',
        [code, etablissement_nom, req.body.etablissement_email || '', req.body.etablissement_telephone || '', req.body.etablissement_adresse || '', req.body.etablissement_directeur || '', dbName],
        function(err) {
            if (err) return res.redirect('/auth/register?error=Erreur création établissement');
            
            // Créer la base de l'établissement
            const dbPath = path.join(__dirname, '..', 'database', dbName);
            const db = setEtablissementDb(dbPath);
            
            // Créer le compte admin dans cette base
            bcrypt.hash(password, 10, (err, hash) => {
                db.run('INSERT INTO users (nom, prenom, email, password, role) VALUES (?,?,?,?,?)',
                    [nom, prenom, email, hash, 'admin'], function(err) {
                        if (err) return res.redirect('/auth/register?error=Erreur création admin');
                        res.redirect('/auth/login?success=🏫 Établissement créé ! Connectez-vous.');
                    });
            });
        }
    );
    return; // Important : sortir de la fonction
}
                    });
                });
            });
        });
    });
},

    getEcoles: (req, res) => {
        globalDb.all('SELECT id, nom, code FROM etablissements WHERE actif = 1 ORDER BY nom', [], (err, rows) => {
            res.json(rows || []);
        });
    },

    // Login
    login: (req, res) => {
        const { email, password, role } = req.body;
        if (!email || !password) return res.redirect('/auth/login?error=Email et mot de passe requis');

        if (role === 'admin') {
            globalDb.get('SELECT * FROM admins WHERE email = ? AND compte_actif = 1', [email], (err, user) => {
                if (user) {
                    bcrypt.compare(password, user.password, (err, isMatch) => {
                        if (err || !isMatch) return res.redirect('/auth/login?error=Email ou mot de passe incorrect');
                        if (user.etablissement_code) {
                            globalDb.get('SELECT db_name FROM etablissements WHERE code = ?', [user.etablissement_code], (err, etab) => {
                                if (etab) {
                                    const dbDir = process.env.RENDER ? '/opt/render/project/src/database' : path.join(__dirname, '..', 'database');
                                    setEtablissementDb(path.join(dbDir, etab.db_name));
                                }
                            });
                        }
                        req.session.user = { id: user.id, email: user.email, nom: user.nom, prenom: user.prenom, role: 'admin', etablissement_code: user.etablissement_code || '' };
                        res.redirect('/dashboard');
                    });
                } else {
                    // Chercher dans les bases établissements
                    loginInEtablissements(req, res, email, password, 'admin');
                }
            });
        } else {
            loginInEtablissements(req, res, email, password, role);
        }
    },

    logout: (req, res) => { req.session.destroy(() => res.redirect('/auth/login')); }
};

// Fonction helper pour chercher dans toutes les bases établissements
function loginInEtablissements(req, res, email, password, role) {
    const dbDir = process.env.RENDER ? '/opt/render/project/src/database' : path.join(__dirname, '..', 'database');
    
    globalDb.all('SELECT code, db_name FROM etablissements WHERE actif = 1', [], (err, etabs) => {
        if (err || !etabs.length) return res.redirect('/auth/login?error=Aucun établissement trouvé');

        let found = false;
        let checked = 0;

        etabs.forEach((etab) => {
            if (found) return;
            const dbPath = path.join(dbDir, etab.db_name);
            
            if (!fs.existsSync(dbPath)) {
                checked++;
                if (checked === etabs.length && !found) res.redirect('/auth/login?error=Base non trouvée');
                return;
            }

            const etabDb = new (require('sqlite3').verbose()).Database(dbPath);
            
            etabDb.get('SELECT * FROM users WHERE email = ? AND compte_actif = 1', [email], (err, user) => {
                checked++;
                if (user && !found) {
                    found = true;
                    bcrypt.compare(password, user.password, (err, isMatch) => {
                        etabDb.close();
                        if (err || !isMatch) return res.redirect('/auth/login?error=Email ou mot de passe incorrect');
                        setEtablissementDb(dbPath);
                        req.session.user = { 
                            id: user.id, email: user.email, nom: user.nom, prenom: user.prenom, 
                            role: user.role, etablissement_code: etab.code 
                        };
                        res.redirect('/dashboard');
                    });
                } else {
                    etabDb.close();
                    if (checked === etabs.length && !found) {
                        res.redirect('/auth/login?error=Email ou mot de passe incorrect');
                    }
                }
            });
        });
    });
}

module.exports = authController;