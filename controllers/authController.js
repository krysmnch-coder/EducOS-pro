const bcrypt = require('bcryptjs');
const { globalDb, setEtablissementDb } = require('../config/database');
const path = require('path');

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

            // Nettoyer le nom pour le code
            const nomClean = etablissement_nom.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            const code = 'ETAB_' + nomClean.substring(0, 10);
            const dbName = 'educos_' + code.toLowerCase() + '.db';
            const dbDir = process.env.RENDER ? '/opt/render/project/src/database' : path.join(__dirname, '..', 'database');
            const dbPath = path.join(dbDir, dbName);

            // Vérifier si le code existe déjà, sinon ajouter un suffixe
            globalDb.get('SELECT id FROM etablissements WHERE code = ?', [code], (err, exist) => {
                const finalCode = exist ? code + '_' + Date.now().toString(36).toUpperCase().substring(0, 3) : code;
                const finalDbName = 'educos_' + finalCode.toLowerCase() + '.db';
                const finalDbPath = path.join(dbDir, finalDbName);

                globalDb.run('INSERT INTO etablissements (code, nom, adresse, telephone, directeur, annee_scolaire, db_name) VALUES (?,?,?,?,?,?,?)',
                    [finalCode, etablissement_nom, adresse||'', telephone||'', directeur||'', annee_scolaire||'2024-2025', finalDbName], function(err) {
                    if (err) return res.redirect('/auth/register?error=Erreur création établissement');

                    setEtablissementDb(finalDbPath);

                    bcrypt.hash(password, 10, (err, hash) => {
                        globalDb.run('INSERT INTO admins (nom, prenom, email, password, etablissement_code) VALUES (?,?,?,?,?)',
                            [nom, prenom, email, hash, finalCode], function(err) {
                                if (err) return res.redirect('/auth/register?error=Erreur création compte');
                                res.redirect('/auth/login?success=' + encodeURIComponent('✅ Compte créé ! Code établissement : ' + finalCode));
                            });
                    });
                });
            });
        });
    },

    // Inscription utilisateur (profs, parents, élèves)
    register: (req, res) => {
        const { nom, prenom, email, password, confirm_password, role, etablissement_id } = req.body;

        if (!nom || !prenom || !email || !password || !role) {
            return res.redirect('/auth/register?error=Tous les champs obligatoires');
        }
        if (password !== confirm_password) return res.redirect('/auth/register?error=Mots de passe différents');
        if (password.length < 8) return res.redirect('/auth/register?error=Minimum 8 caractères');
        if (!etablissement_id) return res.redirect('/auth/register?error=Veuillez sélectionner votre école');

        // Récupérer l'établissement choisi
        globalDb.get('SELECT * FROM etablissements WHERE id = ?', [etablissement_id], (err, etab) => {
            if (err || !etab) return res.redirect('/auth/register?error=École non trouvée');

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
                            res.redirect('/auth/login?success=Compte créé ! École : ' + etab.nom);
                        });
                    } else if (role === 'eleve') {
                        db.run('INSERT INTO users (nom, prenom, email, password, role, classes_assignees, date_naissance) VALUES (?,?,?,?,?,?,?)', [nom, prenom, email, hash, role, classe_eleve, date_naissance], function(err) {
                            if (err) return res.redirect('/auth/register?error=Erreur inscription');
                            res.redirect('/auth/login?success=Compte créé ! École : ' + etab.nom);
                        });
                    } else if (role === 'prof') {
                        db.run('INSERT INTO users (nom, prenom, email, password, role, matiere_principale, classes_assignees) VALUES (?,?,?,?,?,?,?)', [nom, prenom, email, hash, role, matiere_principale, classes_assignees], function(err) {
                            if (err) return res.redirect('/auth/register?error=Erreur inscription');
                            res.redirect('/auth/login?success=Compte créé ! École : ' + etab.nom);
                        });
                    } else {
                        db.run('INSERT INTO users (nom, prenom, email, password, role) VALUES (?,?,?,?,?)', [nom, prenom, email, hash, role], function(err) {
                            if (err) return res.redirect('/auth/register?error=Erreur inscription');
                            res.redirect('/auth/login?success=Compte créé ! École : ' + etab.nom);
                        });
                    }
                });
            });
        });
    },

    // Récupérer la liste des écoles pour le formulaire
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
                if (err || !user) return res.redirect('/auth/login?error=Email ou mot de passe incorrect');
                bcrypt.compare(password, user.password, (err, isMatch) => {
                    if (err || !isMatch) return res.redirect('/auth/login?error=Email ou mot de passe incorrect');
                    if (user.etablissement_code) {
                        globalDb.get('SELECT db_name FROM etablissements WHERE code = ?', [user.etablissement_code], (err, etab) => {
                            if (etab) setEtablissementDb(path.join(process.env.RENDER ? '/opt/render/project/src/database' : path.join(__dirname, '..', 'database'), etab.db_name));
                        });
                    }
                    req.session.user = { id: user.id, email: user.email, nom: user.nom, prenom: user.prenom, role: 'admin', etablissement_code: user.etablissement_code || '' };
                    res.redirect('/dashboard');
                });
            });
        } else {
            const etablissement_id = req.body.etablissement_id;
            if (!etablissement_id) return res.redirect('/auth/login?error=Sélectionnez votre école');

            globalDb.get('SELECT * FROM etablissements WHERE id = ?', [etablissement_id], (err, etab) => {
                if (err || !etab) return res.redirect('/auth/login?error=École non trouvée');

                const dbDir = process.env.RENDER ? '/opt/render/project/src/database' : path.join(__dirname, '..', 'database');
                const dbPath = path.join(dbDir, etab.db_name);
                const etabDb = new (require('sqlite3').verbose()).Database(dbPath);

                etabDb.get('SELECT * FROM users WHERE email = ? AND compte_actif = 1', [email], (err, user) => {
                    if (err || !user) { etabDb.close(); return res.redirect('/auth/login?error=Email ou mot de passe incorrect'); }
                    bcrypt.compare(password, user.password, (err, isMatch) => {
                        if (err || !isMatch) { etabDb.close(); return res.redirect('/auth/login?error=Email ou mot de passe incorrect'); }
                        etabDb.close();
                        setEtablissementDb(dbPath);
                        req.session.user = { id: user.id, email: user.email, nom: user.nom, prenom: user.prenom, role: user.role, etablissement_code: etab.code, etablissement_db: etab.db_name };
                        res.redirect('/dashboard');
                    });
                });
            });
        }
    },

    logout: (req, res) => { req.session.destroy(() => res.redirect('/auth/login')); }
};

module.exports = authController;