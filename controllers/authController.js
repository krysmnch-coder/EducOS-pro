const bcrypt = require('bcryptjs');
const { globalDb, setEtablissementDb } = require('../config/database');
const path = require('path');

const authController = {
    // Inscription ADMIN
    registerAdmin: (req, res) => {
        const { nom, prenom, email, password, confirm_password, etablissement_nom } = req.body;
        
        if (!nom || !prenom || !email || !password || !etablissement_nom) {
            return res.redirect('/auth/register?error=Tous les champs obligatoires');
        }
        if (password !== confirm_password) return res.redirect('/auth/register?error=Mots de passe différents');

        const code = 'ETAB_' + etablissement_nom.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 8);
        const dbName = 'educos_' + code.toLowerCase() + '.db';
        const dbDir = path.join(__dirname, '..', 'database');
        const dbPath = path.join(dbDir, dbName);
        
        globalDb.run('INSERT INTO etablissements (code, nom, db_name) VALUES (?, ?, ?)', [code, etablissement_nom, dbName], function(err) {
            if (err) return res.redirect('/auth/register?error=Erreur création établissement');
            
            // Créer la base de l'établissement
            setEtablissementDb(dbPath);
            
            bcrypt.hash(password, 10, (err, hash) => {
                globalDb.run('INSERT INTO admins (nom, prenom, email, password, etablissement_code) VALUES (?,?,?,?,?)',
                    [nom, prenom, email, hash, code], function(err) {
                        if (err) return res.redirect('/auth/register?error=Erreur création admin');
                        res.redirect('/auth/login?success=' + encodeURIComponent('✅ Compte créé ! Code établissement : ' + code + ' | Donnez ce code à vos utilisateurs.'));
                    });
            });
        });
    },

    // Inscription UTILISATEUR (profs, parents, élèves, vie scolaire)
    register: (req, res) => {
        const { nom, prenom, email, password, confirm_password, role, etablissement_id } = req.body;

        if (!nom || !prenom || !email || !password || !role) {
            return res.redirect('/auth/register?error=Tous les champs obligatoires');
        }
        if (password !== confirm_password) return res.redirect('/auth/register?error=Mots de passe différents');
        if (password.length < 8) return res.redirect('/auth/register?error=Minimum 8 caractères');
        if (!etablissement_id) return res.redirect('/auth/register?error=Veuillez sélectionner votre école');

        // Trouver l'établissement
        globalDb.get('SELECT * FROM etablissements WHERE id = ?', [etablissement_id], (err, etab) => {
            if (err || !etab) return res.redirect('/auth/register?error=École non trouvée');

            // Se connecter à la base de l'établissement
            const dbDir = path.join(__dirname, '..', 'database');
            const dbPath = path.join(dbDir, etab.db_name);
            const db = setEtablissementDb(dbPath);
            if (!db) return res.redirect('/auth/register?error=Erreur base de données');

            // Vérifier si l'email existe déjà dans CETTE base
            db.get('SELECT id FROM users WHERE email = ?', [email], (err, user) => {
                if (user) return res.redirect('/auth/register?error=Email déjà utilisé dans cet établissement');

                bcrypt.hash(password, 10, (err, hash) => {
                    const matiere_principale = req.body.matiere_principale || null;
                    const classes_assignees = req.body.classes_assignees || null;
                    const classe_eleve = req.body.classe_eleve || null;
                    const date_naissance = req.body.date_naissance || null;

                    if (role === 'parent') {
                        const noms = req.body.enfant_nom ? (Array.isArray(req.body.enfant_nom) ? req.body.enfant_nom : [req.body.enfant_nom]) : [];
                        const prenoms = req.body.enfant_prenom ? (Array.isArray(req.body.enfant_prenom) ? req.body.enfant_prenom : [req.body.enfant_prenom]) : [];
                        const classes = req.body.enfant_classe ? (Array.isArray(req.body.enfant_classe) ? req.body.enfant_classe : [req.body.enfant_classe]) : [];
                        const enfants = [];
                        for (let i = 0; i < noms.length; i++) {
                            if (noms[i] && prenoms[i]) enfants.push({ nom: noms[i], prenom: prenoms[i], classe: classes[i] || '' });
                        }
                        db.run('INSERT INTO users (nom, prenom, email, password, role, classes_assignees) VALUES (?,?,?,?,?,?)',
                            [nom, prenom, email, hash, role, JSON.stringify(enfants)], function(err) {
                                if (err) return res.redirect('/auth/register?error=Erreur inscription');
                                res.redirect('/auth/login?success=Compte créé ! Connectez-vous.');
                            });
                    } else if (role === 'eleve') {
                        db.run('INSERT INTO users (nom, prenom, email, password, role, classes_assignees, date_naissance) VALUES (?,?,?,?,?,?,?)',
                            [nom, prenom, email, hash, role, classe_eleve, date_naissance], function(err) {
                                if (err) return res.redirect('/auth/register?error=Erreur inscription');
                                res.redirect('/auth/login?success=Compte créé ! Connectez-vous.');
                            });
                    } else if (role === 'prof') {
                        db.run('INSERT INTO users (nom, prenom, email, password, role, matiere_principale, classes_assignees) VALUES (?,?,?,?,?,?,?)',
                            [nom, prenom, email, hash, role, matiere_principale, classes_assignees], function(err) {
                                if (err) return res.redirect('/auth/register?error=Erreur inscription');
                                res.redirect('/auth/login?success=Compte créé ! Connectez-vous.');
                            });
                    } else {
                        db.run('INSERT INTO users (nom, prenom, email, password, role) VALUES (?,?,?,?,?)',
                            [nom, prenom, email, hash, role], function(err) {
                                if (err) return res.redirect('/auth/register?error=Erreur inscription');
                                res.redirect('/auth/login?success=Compte créé ! Connectez-vous.');
                            });
                    }
                });
            });
        });
    },

    // Login UNIFIÉ
    login: (req, res) => {
        const { email, password, role } = req.body;
        if (!email || !password) return res.redirect('/auth/login?error=Email et mot de passe requis');

        // Admin : chercher dans la base globale
        if (role === 'admin') {
            globalDb.get('SELECT * FROM admins WHERE email = ? AND compte_actif = 1', [email], (err, user) => {
                if (err || !user) return res.redirect('/auth/login?error=Email ou mot de passe incorrect');
                bcrypt.compare(password, user.password, (err, isMatch) => {
                    if (err || !isMatch) return res.redirect('/auth/login?error=Email ou mot de passe incorrect');
                    
                    // Charger la base établissement de l'admin
                    if (user.etablissement_code) {
                        globalDb.get('SELECT db_name FROM etablissements WHERE code = ?', [user.etablissement_code], (err, etab) => {
                            if (etab) {
                                const dbPath = path.join(__dirname, '..', 'database', etab.db_name);
                                setEtablissementDb(dbPath);
                            }
                        });
                    }
                    
                    req.session.user = { id: user.id, email: user.email, nom: user.nom, prenom: user.prenom, role: 'admin', etablissement_code: user.etablissement_code || '' };
                    res.redirect('/dashboard');
                });
            });
            return;
        }

        // Autres utilisateurs : chercher dans TOUTES les bases établissements
        globalDb.all('SELECT code, db_name FROM etablissements WHERE actif = 1', [], (err, etabs) => {
            if (err || !etabs.length) return res.redirect('/auth/login?error=Aucun établissement');

            const dbDir = path.join(__dirname, '..', 'database');
            let found = false;
            let checked = 0;

            etabs.forEach((etab) => {
                if (found) return;
                const dbPath = path.join(dbDir, etab.db_name);
                const etabDb = new (require('sqlite3').verbose()).Database(dbPath);
                
                etabDb.get('SELECT * FROM users WHERE email = ? AND compte_actif = 1', [email], (err, user) => {
                    checked++;
                    if (user && !found) {
                        found = true;
                        bcrypt.compare(password, user.password, (err, isMatch) => {
                            etabDb.close();
                            if (err || !isMatch) return res.redirect('/auth/login?error=Mot de passe incorrect');
                            
                            // Charger la base de cet établissement
                            setEtablissementDb(dbPath);
                            
                            req.session.user = { id: user.id, email: user.email, nom: user.nom, prenom: user.prenom, role: user.role, etablissement_code: etab.code };
                            res.redirect('/dashboard');
                        });
                    } else {
                        etabDb.close();
                        if (checked >= etabs.length && !found) {
                            res.redirect('/auth/login?error=Email ou mot de passe incorrect');
                        }
                    }
                });
            });
        });
    },

    getEcoles: (req, res) => {
        globalDb.all('SELECT id, nom, code FROM etablissements WHERE actif = 1 ORDER BY nom', [], (err, rows) => {
            res.json(rows || []);
        });
    },

    logout: (req, res) => {
        req.session.destroy(() => res.redirect('/auth/login'));
    }
};

module.exports = authController;