const bcrypt = require('bcryptjs');
const { globalDb, setEtablissementDb, getEtablissementDb } = require('../config/database');
const path = require('path');
const fs = require('fs');

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
        const { nom, prenom, email, password, confirm_password, role, etablissement_id } = req.body;

        if (!nom || !prenom || !email || !password || !role) {
            return res.redirect('/auth/register?error=Tous les champs obligatoires');
        }
        if (password !== confirm_password) return res.redirect('/auth/register?error=Mots de passe différents');
        if (password.length < 8) return res.redirect('/auth/register?error=Minimum 8 caractères');

        if (role === 'admin' && req.body.etablissement_nom) {
            return authController.registerAdmin(req, res);
        }

        if (role !== 'admin' && !etablissement_id) {
            return res.redirect('/auth/register?error=Veuillez sélectionner votre école');
        }

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

                    const insert = (fields, values) => {
                        db.run('INSERT INTO users (nom, prenom, email, password, role' + fields + ') VALUES (?,?,?,?,?' + ',?'.repeat(values.length) + ')',
                            [nom, prenom, email, hash, role, ...values], function(err) {
                                if (err) return res.redirect('/auth/register?error=Erreur inscription');
                                res.redirect('/auth/login?success=Compte créé !');
                            });
                    };

                    if (role === 'parent') {
                        const noms = req.body.enfant_nom ? (Array.isArray(req.body.enfant_nom) ? req.body.enfant_nom : [req.body.enfant_nom]) : [];
                        const prenoms = req.body.enfant_prenom ? (Array.isArray(req.body.enfant_prenom) ? req.body.enfant_prenom : [req.body.enfant_prenom]) : [];
                        const classes = req.body.enfant_classe ? (Array.isArray(req.body.enfant_classe) ? req.body.enfant_classe : [req.body.enfant_classe]) : [];
                        const enfants = [];
                        for (let i = 0; i < noms.length; i++) {
                            if (noms[i] && prenoms[i]) enfants.push({ nom: noms[i], prenom: prenoms[i], classe: classes[i] || '' });
                        }
                        insert(', classes_assignees', [JSON.stringify(enfants)]);
                    } else if (role === 'eleve') {
                        insert(', classes_assignees, date_naissance', [classe_eleve || '', date_naissance || '']);
                    } else if (role === 'prof') {
                        insert(', matiere_principale, classes_assignees', [matiere_principale || '', classes_assignees || '']);
                    } else {
                        insert('', []);
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