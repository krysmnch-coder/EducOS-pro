const bcrypt = require('bcryptjs');
const { globalDb, setEtablissementDb } = require('../config/database');
const path = require('path');

const authController = {
    // Inscription admin : crée le compte admin + l'établissement + la base en une seule étape
    registerAdmin: (req, res) => {
        const { nom, prenom, email, password, confirm_password, etablissement_nom, adresse, telephone, directeur, annee_scolaire } = req.body;
        
        if (!nom || !prenom || !email || !password || !etablissement_nom) {
            return res.redirect('/auth/register?error=Tous les champs obligatoires (nom, prénom, email, mot de passe, nom établissement)');
        }
        if (password !== confirm_password) return res.redirect('/auth/register?error=Mots de passe différents');
        if (password.length < 8) return res.redirect('/auth/register?error=Minimum 8 caractères');

        // Vérifier si l'email existe déjà
        globalDb.get('SELECT id FROM admins WHERE email = ?', [email], (err, user) => {
            if (user) return res.redirect('/auth/register?error=Email déjà utilisé');

            // Générer le code établissement
            const nomCode = etablissement_nom.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase();
            const code = 'ETAB_' + nomCode + '_' + Date.now().toString(36).toUpperCase().substring(0, 4);
            const dbName = 'educos_' + code.toLowerCase() + '.db';
            
            const dbDir = process.env.RENDER ? '/opt/render/project/src/database' : path.join(__dirname, '..', 'database');
            const dbPath = path.join(dbDir, dbName);

            // Créer l'établissement dans la base globale
            globalDb.run('INSERT INTO etablissements (code, nom, adresse, telephone, directeur, annee_scolaire, db_name) VALUES (?,?,?,?,?,?,?)',
                [code, etablissement_nom, adresse||'', telephone||'', directeur||'', annee_scolaire||'2024-2025', dbName], function(err) {
                
                if (err) return res.redirect('/auth/register?error=Erreur création établissement');

                // Créer la base de données de l'établissement
                setEtablissementDb(dbPath);

                // Créer le compte admin dans la base globale
                bcrypt.hash(password, 10, (err, hash) => {
                    if (err) return res.redirect('/auth/register?error=Erreur serveur');

                    globalDb.run('INSERT INTO admins (nom, prenom, email, password, etablissement_code) VALUES (?,?,?,?,?)',
                        [nom, prenom, email, hash, code], function(err) {
                            if (err) return res.redirect('/auth/register?error=Erreur création compte admin');

                            // Message de succès avec le code
                            const message = '✅ COMPTE ADMIN ET ÉTABLISSEMENT CRÉÉS !\n\n' +
                                '🏫 Établissement : ' + etablissement_nom + '\n' +
                                '🔑 Code établissement : ' + code + '\n' +
                                '📁 Base de données : ' + dbName + '\n\n' +
                                '⚠️ Gardez ce code précieusement ! Il sera demandé à vos utilisateurs pour s\'inscrire.';
                            
                            res.redirect('/auth/login?success=' + encodeURIComponent(message));
                        });
                });
            });
        });
    },

    // Inscription utilisateur standard (dans la base établissement)
    register: (req, res) => {
        const { nom, prenom, email, password, confirm_password, role, etablissement_nom, etablissement_code } = req.body;

        if (!nom || !prenom || !email || !password || !role) return res.redirect('/auth/register?error=Tous les champs obligatoires');
        if (password !== confirm_password) return res.redirect('/auth/register?error=Mots de passe différents');
        if (password.length < 8) return res.redirect('/auth/register?error=Minimum 8 caractères');
        if (role !== 'admin' && (!etablissement_nom || !etablissement_code)) return res.redirect('/auth/register?error=Nom de l\'école et code établissement obligatoires');

        const code = etablissement_code ? etablissement_code.trim().toUpperCase() : '';
        
        // Vérifier le code établissement
        globalDb.get('SELECT * FROM etablissements WHERE code = ?', [code], (err, etab) => {
            if (!etab) return res.redirect('/auth/register?error=Code établissement invalide. Contactez votre administration.');
            
            // Vérifier que le nom correspond
            if (!etab.nom.toLowerCase().includes(etablissement_nom.toLowerCase().trim())) {
                return res.redirect('/auth/register?error=Le nom de l\'école ne correspond pas au code.');
            }

            const dbDir = process.env.RENDER ? '/opt/render/project/src/database' : path.join(__dirname, '..', 'database');
            const dbPath = path.join(dbDir, etab.db_name);
            const db = setEtablissementDb(dbPath);
            if (!db) return res.redirect('/auth/register?error=Erreur base de données');

            db.get('SELECT id FROM users WHERE email = ?', [email], (err, user) => {
                if (user) return res.redirect('/auth/register?error=Email déjà utilisé');

                bcrypt.hash(password, 10, (err, hash) => {
                    const matiere_principale = req.body.matiere_principale || null;
                    const classes_assignees = req.body.classes_assignees || null;
                    const classe_eleve = req.body.classe_eleve || null;
                    const date_naissance = req.body.date_naissance || null;

                    if (role === 'parent') {
                        const enfantsNoms = req.body.enfant_nom ? (Array.isArray(req.body.enfant_nom) ? req.body.enfant_nom : [req.body.enfant_nom]) : [];
                        const enfantsPrenoms = req.body.enfant_prenom ? (Array.isArray(req.body.enfant_prenom) ? req.body.enfant_prenom : [req.body.enfant_prenom]) : [];
                        const enfantsClasses = req.body.enfant_classe ? (Array.isArray(req.body.enfant_classe) ? req.body.enfant_classe : [req.body.enfant_classe]) : [];
                        const enfants = [];
                        for (let i = 0; i < enfantsNoms.length; i++) {
                            if (enfantsNoms[i] && enfantsPrenoms[i]) enfants.push({ nom: enfantsNoms[i], prenom: enfantsPrenoms[i], classe: enfantsClasses[i] || '' });
                        }
                        db.run('INSERT INTO users (nom, prenom, email, password, role, classes_assignees) VALUES (?,?,?,?,?,?)', [nom, prenom, email, hash, role, JSON.stringify(enfants)], function(err) {
                            if (err) return res.redirect('/auth/register?error=Erreur inscription');
                            res.redirect('/auth/login?success=Compte créé avec succès !');
                        });
                    } else if (role === 'eleve') {
                        db.run('INSERT INTO users (nom, prenom, email, password, role, classes_assignees, date_naissance) VALUES (?,?,?,?,?,?,?)', [nom, prenom, email, hash, role, classe_eleve, date_naissance], function(err) {
                            if (err) return res.redirect('/auth/register?error=Erreur inscription');
                            res.redirect('/auth/login?success=Compte créé avec succès !');
                        });
                    } else if (role === 'prof') {
                        db.run('INSERT INTO users (nom, prenom, email, password, role, matiere_principale, classes_assignees) VALUES (?,?,?,?,?,?,?)', [nom, prenom, email, hash, role, matiere_principale, classes_assignees], function(err) {
                            if (err) return res.redirect('/auth/register?error=Erreur inscription');
                            res.redirect('/auth/login?success=Compte créé avec succès !');
                        });
                    } else {
                        db.run('INSERT INTO users (nom, prenom, email, password, role) VALUES (?,?,?,?,?)', [nom, prenom, email, hash, role], function(err) {
                            if (err) return res.redirect('/auth/register?error=Erreur inscription');
                            res.redirect('/auth/login?success=Compte créé avec succès !');
                        });
                    }
                });
            });
        });
    },

    // Login
    login: (req, res) => {
        const { email, password, role } = req.body;
        if (!email || !password) return res.redirect('/auth/login?error=Email et mot de passe requis');

        // Admin : chercher dans la base globale
        if (role === 'admin') {
            globalDb.get('SELECT * FROM admins WHERE email = ? AND compte_actif = 1', [email], (err, user) => {
                if (err || !user) return res.redirect('/auth/login?error=Email ou mot de passe incorrect');
                bcrypt.compare(password, user.password, (err, isMatch) => {
                    if (err || !isMatch) return res.redirect('/auth/login?error=Email ou mot de passe incorrect');
                    globalDb.run('UPDATE admins SET derniere_connexion = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
                    
                    // Charger la base établissement de l'admin
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
            });
        } else {
            // Autres utilisateurs : chercher dans toutes les bases établissements
            globalDb.all('SELECT code, db_name FROM etablissements WHERE actif = 1', [], (err, etabs) => {
                if (err || !etabs.length) return res.redirect('/auth/login?error=Aucun établissement trouvé');
                
                const dbDir = process.env.RENDER ? '/opt/render/project/src/database' : path.join(__dirname, '..', 'database');
                let found = false;
                let checkedCount = 0;

                etabs.forEach((etab) => {
                    const dbPath = path.join(dbDir, etab.db_name);
                    const etabDb = new (require('sqlite3').verbose()).Database(dbPath);
                    
                    etabDb.get('SELECT * FROM users WHERE email = ? AND compte_actif = 1', [email], (err, user) => {
                        checkedCount++;
                        if (user && !found) {
                            found = true;
                            bcrypt.compare(password, user.password, (err, isMatch) => {
                                if (err || !isMatch) {
                                    etabDb.close();
                                    return res.redirect('/auth/login?error=Email ou mot de passe incorrect');
                                }
                                etabDb.close();
                                setEtablissementDb(dbPath);
                                req.session.user = { id: user.id, email: user.email, nom: user.nom, prenom: user.prenom, role: user.role, etablissement_code: etab.code, etablissement_db: etab.db_name };
                                res.redirect('/dashboard');
                            });
                        } else {
                            etabDb.close();
                            if (checkedCount === etabs.length && !found) {
                                res.redirect('/auth/login?error=Email ou mot de passe incorrect');
                            }
                        }
                    });
                });
            });
        }
    },

    logout: (req, res) => {
        req.session.destroy(() => res.redirect('/auth/login'));
    }
};

module.exports = authController;