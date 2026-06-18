const bcrypt = require('bcryptjs');
const path = require('path');
const { globalDb, setEtablissementDb, getEtablissementDb } = require('../config/database');

const authController = {
    // Afficher la page d'inscription
    registerPage: (req, res) => {
        res.render('auth/register', { title: 'Inscription | EducOS-pro', error: req.query.error || null });
    },

    // Traiter l'inscription
    register: (req, res) => {
        const { nom, prenom, email, password, confirm_password, role, nom_ecole, code_etablissement } = req.body;

        if (!nom || !prenom || !email || !password || !role) {
            return res.redirect('/auth/register?error=Tous les champs sont obligatoires');
        }
        if (password !== confirm_password) return res.redirect('/auth/register?error=Mots de passe différents');
        if (password.length < 8) return res.redirect('/auth/register?error=Minimum 8 caractères');

        // Pour l'admin : inscription dans la base globale
        if (role === 'admin') {
            if (!nom_ecole) return res.redirect('/auth/register?error=Nom de l\'école obligatoire');
            
            const code = 'ETAB_' + nom_ecole.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 10);
            const dbName = 'educos_' + code.toLowerCase() + '.db';
            
            globalDb.get('SELECT id FROM admins WHERE email = ?', [email], (err, user) => {
                if (user) return res.redirect('/auth/register?error=Email déjà utilisé');
                
                bcrypt.hash(password, 10, (err, hash) => {
                    if (err) return res.redirect('/auth/register?error=Erreur');
                    
                    globalDb.run('INSERT INTO admins (nom, prenom, email, password, etablissement_code) VALUES (?,?,?,?,?)',
                        [nom, prenom, email, hash, code], function(err) {
                            if (err) return res.redirect('/auth/register?error=Erreur inscription admin');
                            
                            // Créer l'établissement dans la table globale
                            globalDb.run('INSERT OR IGNORE INTO etablissements (code, nom, db_name) VALUES (?,?,?)',
                                [code, nom_ecole, dbName]);
                            
                            // Créer la base établissement
                            setEtablissementDb(dbName);
                            
                            res.redirect('/auth/login?success=Compte admin créé ! Votre code établissement : ' + code);
                        });
                });
            });
            return;
        }

        // Pour les autres rôles : vérifier le code établissement
        if (!code_etablissement || !nom_ecole) {
            return res.redirect('/auth/register?error=Nom d\'école et code établissement obligatoires');
        }

        // Vérifier que le code correspond bien au nom d'école
        const codeAttendu = 'ETAB_' + nom_ecole.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 10);
        if (code_etablissement.toUpperCase() !== codeAttendu) {
            return res.redirect('/auth/register?error=Code établissement invalide pour cette école');
        }

        // Vérifier que l'établissement existe
        globalDb.get('SELECT * FROM etablissements WHERE code = ?', [code_etablissement.toUpperCase()], (err, etab) => {
            if (!etab) return res.redirect('/auth/register?error=Établissement non trouvé');

            const dbName = etab.db_name;
            const etabDb = setEtablissementDb(dbName);
            
            if (!etabDb) return res.redirect('/auth/register?error=Erreur base de données établissement');

            // Vérifier si l'email existe déjà dans cet établissement
            etabDb.get('SELECT id FROM users WHERE email = ?', [email], (err, user) => {
                if (user) return res.redirect('/auth/register?error=Email déjà utilisé dans cet établissement');

                bcrypt.hash(password, 10, (err, hash) => {
                    if (err) return res.redirect('/auth/register?error=Erreur');

                    const matiere_principale = req.body.matiere_principale || null;
                    const classes_assignees = req.body.classes_assignees || req.body.classe_eleve || null;
                    const date_naissance = req.body.date_naissance || null;

                    if (role === 'parent') {
                        const enfantsNoms = req.body.enfant_nom ? (Array.isArray(req.body.enfant_nom) ? req.body.enfant_nom : [req.body.enfant_nom]) : [];
                        const enfantsPrenoms = req.body.enfant_prenom ? (Array.isArray(req.body.enfant_prenom) ? req.body.enfant_prenom : [req.body.enfant_prenom]) : [];
                        const enfantsClasses = req.body.enfant_classe ? (Array.isArray(req.body.enfant_classe) ? req.body.enfant_classe : [req.body.enfant_classe]) : [];
                        const enfants = [];
                        for (let i = 0; i < enfantsNoms.length; i++) {
                            if (enfantsNoms[i] && enfantsPrenoms[i]) {
                                enfants.push({ nom: enfantsNoms[i], prenom: enfantsPrenoms[i], classe: enfantsClasses[i] || '' });
                            }
                        }
                        etabDb.run('INSERT INTO users (nom, prenom, email, password, role, classes_assignees) VALUES (?,?,?,?,?,?)',
                            [nom, prenom, email, hash, role, JSON.stringify(enfants)], function(err) {
                                if (err) return res.redirect('/auth/register?error=Erreur inscription');
                                res.redirect('/auth/login?success=Compte parent créé !');
                            });
                    } else {
                        etabDb.run('INSERT INTO users (nom, prenom, email, password, role, matiere_principale, classes_assignees, date_naissance) VALUES (?,?,?,?,?,?,?,?)',
                            [nom, prenom, email, hash, role, matiere_principale, classes_assignees, date_naissance], function(err) {
                                if (err) return res.redirect('/auth/register?error=Erreur inscription');
                                res.redirect('/auth/login?success=Compte créé !');
                            });
                    }
                });
            });
        });
    },

    // Connexion
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
                    
                    // Charger la base établissement
                    const dbName = 'educos_' + user.etablissement_code.toLowerCase() + '.db';
                    setEtablissementDb(dbName);
                    
                    req.session.user = {
                        id: user.id, email: user.email, nom: user.nom, prenom: user.prenom,
                        role: 'admin', etablissement_code: user.etablissement_code
                    };
                    res.redirect('/dashboard');
                });
            });
            return;
        }

        // Autres rôles : chercher dans la base établissement
        const etablissementDb = getEtablissementDb();
        if (!etablissementDb) return res.redirect('/auth/login?error=Base établissement non initialisée');

        etablissementDb.get('SELECT * FROM users WHERE email = ? AND role = ? AND compte_actif = 1', [email, role], (err, user) => {
            if (err || !user) return res.redirect('/auth/login?error=Email ou mot de passe incorrect');
            bcrypt.compare(password, user.password, (err, isMatch) => {
                if (err || !isMatch) return res.redirect('/auth/login?error=Email ou mot de passe incorrect');
                etablissementDb.run('UPDATE users SET derniere_connexion = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
                req.session.user = {
                    id: user.id, email: user.email, nom: user.nom, prenom: user.prenom,
                    role: user.role, etablissement_code: req.session.etablissement_code || ''
                };
                res.redirect('/dashboard');
            });
        });
    },

    logout: (req, res) => {
        req.session.destroy(() => res.redirect('/auth/login'));
    }
};

module.exports = authController;