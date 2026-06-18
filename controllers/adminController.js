const path = require('path');
const bcrypt = require('bcryptjs');
const { globalDb, getEtablissementDb, setEtablissementDb } = require('../config/database');

const adminController = {
    getStats: (req, res) => {
        const db = getEtablissementDb() || globalDb;
        const stats = {};
        db.get('SELECT COUNT(*) as total FROM users', [], (err, row) => {
            stats.totalUsers = row?.total || 0;
            db.get("SELECT COUNT(*) as total FROM users WHERE role = 'eleve'", [], (err, row) => {
                stats.totalEleves = row?.total || 0;
                db.get("SELECT COUNT(*) as total FROM users WHERE role = 'prof'", [], (err, row) => {
                    stats.totalProfs = row?.total || 0;
                    db.get("SELECT COUNT(*) as total FROM users WHERE role = 'vie_scolaire'", [], (err, row) => {
                        stats.totalVieScolaire = row?.total || 0;
                        db.get("SELECT COUNT(*) as total FROM notifications WHERE user_id = ? AND lu = 0", [req.session.user.id], (err, row) => {
                            stats.notificationsNonLues = row?.total || 0;
                            res.json(stats);
                        });
                    });
                });
            });
        });
    },

    getChartData: (req, res) => res.json({ usersData: [], paiementsData: [], niveauxData: [] }),

    getUsers: (req, res) => {
        const page = parseInt(req.query.page) || 1, limit = 10, offset = (page - 1) * limit;
        const search = req.query.search || '', role = req.query.role || '';
        let where = [], params = [];
        if (search) { where.push('(nom LIKE ? OR prenom LIKE ? OR email LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
        if (role) { where.push('role = ?'); params.push(role); }
        const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
        
        const db = getEtablissementDb() || globalDb;
        db.get(`SELECT COUNT(*) as total FROM users ${wc}`, params, (err, row) => {
            db.all(`SELECT * FROM users ${wc} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset], (err, users) => {
                res.json({ users, pagination: { currentPage: page, totalPages: Math.ceil((row?.total||0)/limit), total: row?.total||0 } });
            });
        });
    },

    createUser: (req, res) => {
        const { nom, prenom, email, password, role, telephone, matiere_principale, classes_assignees, date_naissance, enfants } = req.body;
        
        if (!nom || !prenom || !email || !password || !role) {
            return res.status(400).json({ error: 'Tous les champs obligatoires sont requis' });
        }

        const db = getEtablissementDb() || globalDb;
        db.get('SELECT id FROM users WHERE email = ?', [email], (err, user) => {
            if (user) return res.status(400).json({ error: 'Email déjà utilisé' });
            
            bcrypt.hash(password, 10, (err, hash) => {
                if (err) return res.status(500).json({ error: 'Erreur serveur' });
                
                const classesData = classes_assignees || (enfants ? JSON.stringify(enfants) : '');
                
                db.run(
                    'INSERT INTO users (nom, prenom, email, password, role, telephone, matiere_principale, classes_assignees, date_naissance) VALUES (?,?,?,?,?,?,?,?,?)',
                    [nom, prenom, email, hash, role, telephone || '', matiere_principale || '', classesData, date_naissance || ''],
                    function(err) {
                        if (err) return res.status(500).json({ error: 'Erreur création: ' + err.message });
                        
                        if (role === 'parent' && enfants && enfants.length > 0) {
                            enfants.forEach(enfant => {
                                db.get("SELECT id FROM users WHERE nom = ? AND prenom = ? AND role = 'eleve'", [enfant.nom, enfant.prenom], (err, row) => {
                                    if (!row) {
                                        bcrypt.hash('educos2024', 10, (err, hash) => {
                                            db.run("INSERT INTO users (nom, prenom, email, password, role, classes_assignees) VALUES (?,?,?,?,?,?)",
                                                [enfant.nom, enfant.prenom, enfant.prenom.toLowerCase()+'.'+enfant.nom.toLowerCase()+'@eleve.educos.com', hash, 'eleve', enfant.classe || '']);
                                        });
                                    }
                                });
                            });
                        }
                        
                        res.json({ success: true, message: 'Utilisateur créé avec succès' });
                    }
                );
            });
        });
    },

    updateUser: (req, res) => {
        const { nom, prenom, email, role, compte_actif, telephone, matiere_principale, classes_assignees, date_naissance } = req.body;
        const db = getEtablissementDb() || globalDb;
        db.run(
            'UPDATE users SET nom=?, prenom=?, email=?, role=?, compte_actif=?, telephone=?, matiere_principale=?, classes_assignees=?, date_naissance=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
            [nom, prenom, email, role, compte_actif != 0 ? 1 : 0, telephone || '', matiere_principale || '', classes_assignees || '', date_naissance || '', req.params.id],
            (err) => {
                if (err) return res.status(500).json({ error: 'Erreur modification' });
                res.json({ success: true, message: 'Utilisateur modifié avec succès' });
            }
        );
    },

    deleteUser: (req, res) => {
        if (req.params.id == req.session.user.id) return res.status(400).json({ error: 'Action impossible' });
        const db = getEtablissementDb() || globalDb;
        db.run('DELETE FROM users WHERE id=?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Supprimé' });
        });
    },

    toggleUserStatus: (req, res) => {
        const db = getEtablissementDb() || globalDb;
        db.get('SELECT compte_actif FROM users WHERE id=?', [req.params.id], (err, user) => {
            if (err || !user) return res.status(404).json({ error: 'Non trouvé' });
            const ns = user.compte_actif ? 0 : 1;
            db.run('UPDATE users SET compte_actif=? WHERE id=?', [ns, req.params.id], (err) => {
                if (err) return res.status(500).json({ error: 'Erreur' });
                res.json({ success: true, message: ns ? 'Activé' : 'Désactivé' });
            });
        });
    },

    resetPassword: (req, res) => {
        const np = 'EducOS2024!';
        bcrypt.hash(np, 10, (err, hash) => {
            const db = getEtablissementDb() || globalDb;
            db.run('UPDATE users SET password=? WHERE id=?', [hash, req.params.id], (err) => {
                if (err) return res.status(500).json({ error: 'Erreur' });
                res.json({ success: true, message: 'MDP réinitialisé', tempPassword: np });
            });
        });
    },

    getEtablissement: (req, res) => {
        const code = req.session.user.etablissement_code || '';
        if (!code) return res.json({});
        globalDb.get('SELECT * FROM etablissements WHERE code = ?', [code], (err, row) => {
            res.json(row || {});
        });
    },

    updateEtablissement: (req, res) => {
        const { nom, adresse, telephone, email, site_web, directeur, annee_scolaire } = req.body;
        if (!nom) return res.json({ success: false, error: 'Le nom est obligatoire' });

        // Générer le code à partir du nom
        const codeBase = nom.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 10);
        const code = 'ETAB_' + codeBase.toUpperCase();
        const dbName = 'educos_' + code.toLowerCase() + '.db';
        const dbPath = path.join(__dirname, '..', 'database', dbName);
        
        setEtablissementDb(dbPath);
        
        globalDb.get('SELECT id FROM etablissements WHERE code = ?', [code], (err, row) => {
            if (row) {
                globalDb.run('UPDATE etablissements SET nom=?, adresse=?, telephone=?, email=?, site_web=?, directeur=?, annee_scolaire=?, updated_at=CURRENT_TIMESTAMP WHERE code=?',
                    [nom, adresse||'', telephone||'', email||'', site_web||'', directeur||'', annee_scolaire||'', code], function(err) {
                    res.json({ success: true, message: '✅ ÉTABLISSEMENT MIS À JOUR ! Code: ' + code + ' | Base: ' + dbName, code: code, dbName: dbName });
                });
            } else {
                globalDb.run('INSERT INTO etablissements (code, nom, adresse, telephone, email, site_web, directeur, annee_scolaire, db_name) VALUES (?,?,?,?,?,?,?,?,?)',
                    [code, nom, adresse||'', telephone||'', email||'', site_web||'', directeur||'', annee_scolaire||'', dbName], function(err) {
                    req.session.user.etablissement_code = code;
                    req.session.save();
                    res.json({ success: true, message: '✅ ÉTABLISSEMENT CRÉÉ ! Code: ' + code + ' | Base: ' + dbName, code: code, dbName: dbName });
                });
            }
        });
    },

    getSettings: (req, res) => {
        const db = getEtablissementDb() || globalDb;
        db.get('SELECT * FROM settings WHERE id=1', [], (err, row) => {
            if (!row) {
                db.run('INSERT INTO settings (id) VALUES (1)');
                return res.json({ max_users: 500, default_role: 'eleve', maintenance_mode: 0, allow_registration: 1 });
            }
            res.json(row);
        });
    },

    updateSettings: (req, res) => {
        const db = getEtablissementDb() || globalDb;
        const { max_users, default_role, maintenance_mode, allow_registration } = req.body;
        const maxUsers = Math.min(parseInt(max_users) || 500, 1500);
        
        db.get('SELECT id FROM settings WHERE id=1', [], (err, row) => {
            if (row) {
                db.run('UPDATE settings SET max_users=?, default_role=?, maintenance_mode=?, allow_registration=? WHERE id=1',
                    [maxUsers, default_role||'eleve', maintenance_mode||0, allow_registration!=0?1:0], (err) => {
                    if (err) return res.json({ success: false, error: 'Erreur' });
                    res.json({ success: true, message: '✅ Paramètres enregistrés' });
                });
            } else {
                db.run('INSERT INTO settings (id, max_users, default_role, maintenance_mode, allow_registration) VALUES (1,?,?,?,?)',
                    [maxUsers, default_role||'eleve', maintenance_mode||0, allow_registration!=0?1:0], (err) => {
                    if (err) return res.json({ success: false, error: 'Erreur' });
                    res.json({ success: true, message: '✅ Paramètres créés' });
                });
            }
        });
    },

    getPaiements: (req, res) => {
        const db = getEtablissementDb() || globalDb;
        const page = parseInt(req.query.page) || 1, limit = 15, offset = (page - 1) * limit;
        db.get('SELECT COUNT(*) as total FROM paiements', [], (err, row) => {
            db.all('SELECT p.*, u.nom, u.prenom FROM paiements p LEFT JOIN users u ON p.user_id = u.id ORDER BY p.date_paiement DESC LIMIT ? OFFSET ?', [limit, offset], (err, paiements) => {
                res.json({ paiements, pagination: { currentPage: page, totalPages: Math.ceil((row?.total||0)/limit), total: row?.total||0 } });
            });
        });
    },

    getPaiementStats: (req, res) => {
        const db = getEtablissementDb() || globalDb;
        db.get("SELECT SUM(montant) as total FROM paiements WHERE type='recette'", [], (err, row) => {
            const recettes = row?.total || 0;
            db.get("SELECT SUM(montant) as total FROM paiements WHERE type='depense'", [], (err, row) => {
                res.json({ totalRecettes: recettes, totalDepenses: row?.total || 0, solde: recettes - (row?.total || 0) });
            });
        });
    },

    createPaiement: (req, res) => {
        const db = getEtablissementDb() || globalDb;
        const { type, categorie, montant, description, date_paiement, beneficiaire, mode_paiement, reference, user_id } = req.body;
        db.run('INSERT INTO paiements (type,categorie,montant,description,date_paiement,beneficiaire,mode_paiement,reference,user_id) VALUES (?,?,?,?,?,?,?,?,?)',
            [type, categorie, montant, description, date_paiement, beneficiaire, mode_paiement||'especes', reference, user_id||null], function(err) {
                if (err) return res.status(500).json({ error: 'Erreur' });
                res.json({ success: true, message: 'Paiement enregistré' });
            });
    },

    updatePaiement: (req, res) => {
        const db = getEtablissementDb() || globalDb;
        const { type, categorie, montant, description, date_paiement, beneficiaire, mode_paiement, reference } = req.body;
        db.run('UPDATE paiements SET type=?,categorie=?,montant=?,description=?,date_paiement=?,beneficiaire=?,mode_paiement=?,reference=? WHERE id=?',
            [type, categorie, montant, description, date_paiement, beneficiaire, mode_paiement, reference, req.params.id], (err) => {
                if (err) return res.status(500).json({ error: 'Erreur' });
                res.json({ success: true, message: 'Modifié' });
            });
    },

    deletePaiement: (req, res) => {
        const db = getEtablissementDb() || globalDb;
        db.run('DELETE FROM paiements WHERE id=?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Supprimé' });
        });
    },

    getMessages: (req, res) => {
        const db = getEtablissementDb() || globalDb;
        db.all(`SELECT m.*, u.nom as exp_nom, u.prenom as exp_prenom FROM messages m LEFT JOIN users u ON m.expediteur_id = u.id WHERE m.destinataire_id = ? OR m.destinataire_role = 'all' OR m.destinataire_role = ? ORDER BY m.created_at DESC LIMIT 30`,
            [req.session.user.id, req.session.user.role], (err, messages) => res.json(messages || []));
    },

    getMessageDetail: (req, res) => {
        const db = getEtablissementDb() || globalDb;
        db.get('SELECT m.*, u.nom as exp_nom, u.prenom as exp_prenom FROM messages m LEFT JOIN users u ON m.expediteur_id = u.id WHERE m.id = ?', [req.params.id], (err, msg) => {
            if (err || !msg) return res.status(404).json({ error: 'Message non trouvé' });
            res.json(msg);
        });
    },

    sendMessage: (req, res) => {
        const db = getEtablissementDb() || globalDb;
        const { destinataire_id, destinataire_role, sujet, contenu } = req.body;
        if (!sujet || !contenu) return res.status(400).json({ error: 'Sujet et contenu requis' });
        const fichier = req.file ? req.file.filename : null;
        db.run('INSERT INTO messages (expediteur_id, destinataire_id, destinataire_role, sujet, contenu, fichier) VALUES (?,?,?,?,?,?)',
            [req.session.user.id, destinataire_id||null, destinataire_role||'all', sujet, contenu, fichier], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Message envoyé' });
            });
    },

    getUsersList: (req, res) => {
        const db = getEtablissementDb() || globalDb;
        db.all('SELECT id, nom, prenom, email, role FROM users WHERE compte_actif=1 ORDER BY nom', [], (err, users) => res.json(users || []));
    },

    getNotifications: (req, res) => {
        const db = getEtablissementDb() || globalDb;
        db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [req.session.user.id], (err, rows) => res.json(rows || []));
    },

    markNotificationRead: (req, res) => {
        const db = getEtablissementDb() || globalDb;
        db.run('UPDATE notifications SET lu = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id], (err) => res.json({ success: true }));
    },

    viderNotificationsGeneral: (req, res) => {
        const db = getEtablissementDb() || globalDb;
        db.run('DELETE FROM notifications WHERE user_id = ?', [req.session.user.id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Notifications vidées' });
        });
    }
};

module.exports = adminController;