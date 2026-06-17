const db = require('../config/database');
const bcrypt = require('bcryptjs');
const path = require('path');

const adminController = {
    getStats: (req, res) => {
        const stats = {};
        const etablissementDb = require('../config/database').getEtablissementDb();
        const dbToUse = etablissementDb || db;
        
        dbToUse.get('SELECT COUNT(*) as total FROM users', [], (err, row) => {
            stats.totalUsers = row?.total || 0;
            dbToUse.get("SELECT COUNT(*) as total FROM users WHERE role = 'eleve'", [], (err, row) => {
                stats.totalEleves = row?.total || 0;
                dbToUse.get("SELECT COUNT(*) as total FROM users WHERE role = 'prof'", [], (err, row) => {
                    stats.totalProfs = row?.total || 0;
                    dbToUse.get("SELECT COUNT(*) as total FROM users WHERE role = 'admin'", [], (err, row) => {
                        stats.totalAdmins = row?.total || 0;
                        dbToUse.get("SELECT COUNT(*) as total FROM notifications WHERE user_id = ? AND lu = 0", [req.session.user.id], (err, row) => {
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
        
        const { globalDb } = require('../config/database');
        globalDb.get(`SELECT COUNT(*) as total FROM users ${wc}`, params, (err, row) => {
            globalDb.all(`SELECT * FROM users ${wc} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset], (err, users) => {
                res.json({ users, pagination: { currentPage: page, totalPages: Math.ceil((row?.total||0)/limit), total: row?.total||0 } });
            });
        });
    },

    createUser: (req, res) => {
        const { nom, prenom, email, password, role } = req.body;
        if (!nom || !prenom || !email || !password || !role) return res.status(400).json({ error: 'Tous les champs obligatoires' });
        
        const { globalDb } = require('../config/database');
        globalDb.get('SELECT id FROM users WHERE email = ?', [email], (err, user) => {
            if (user) return res.status(400).json({ error: 'Email déjà utilisé' });
            bcrypt.hash(password, 10, (err, hash) => {
                if (err) return res.status(500).json({ error: 'Erreur' });
                const etablissementCode = req.session.user.etablissement_code || '';
                globalDb.run('INSERT INTO users (nom, prenom, email, password, role, etablissement_code) VALUES (?,?,?,?,?,?)',
                    [nom, prenom, email, hash, role, etablissementCode], function(err) {
                        if (err) return res.status(500).json({ error: 'Erreur création' });
                        res.json({ success: true, message: 'Utilisateur créé' });
                    });
            });
        });
    },

    updateUser: (req, res) => {
        const { nom, prenom, email, role, compte_actif } = req.body;
        const { globalDb } = require('../config/database');
        globalDb.run('UPDATE users SET nom=?, prenom=?, email=?, role=?, compte_actif=? WHERE id=?',
            [nom, prenom, email, role, compte_actif, req.params.id], (err) => {
                if (err) return res.status(500).json({ error: 'Erreur' });
                res.json({ success: true, message: 'Modifié' });
            });
    },

    deleteUser: (req, res) => {
        if (req.params.id == req.session.user.id) return res.status(400).json({ error: 'Action impossible' });
        const { globalDb } = require('../config/database');
        globalDb.run('DELETE FROM users WHERE id=?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Supprimé' });
        });
    },

    toggleUserStatus: (req, res) => {
        const { globalDb } = require('../config/database');
        globalDb.get('SELECT compte_actif FROM users WHERE id=?', [req.params.id], (err, user) => {
            if (err || !user) return res.status(404).json({ error: 'Non trouvé' });
            const ns = user.compte_actif ? 0 : 1;
            globalDb.run('UPDATE users SET compte_actif=? WHERE id=?', [ns, req.params.id], (err) => {
                if (err) return res.status(500).json({ error: 'Erreur' });
                res.json({ success: true, message: ns ? 'Activé' : 'Désactivé' });
            });
        });
    },

    resetPassword: (req, res) => {
        const np = 'EducOS2024!';
        bcrypt.hash(np, 10, (err, hash) => {
            const { globalDb } = require('../config/database');
            globalDb.run('UPDATE users SET password=? WHERE id=?', [hash, req.params.id], (err) => {
                if (err) return res.status(500).json({ error: 'Erreur' });
                res.json({ success: true, message: 'MDP réinitialisé', tempPassword: np });
            });
        });
    },

    getEtablissement: (req, res) => {
        const { globalDb } = require('../config/database');
        const code = req.session.user.etablissement_code || '';
        if (!code) return res.json({});
        globalDb.get('SELECT * FROM etablissements WHERE code = ?', [code], (err, row) => {
            res.json(row || {});
        });
    },

    updateEtablissement: (req, res) => {
        const { nom, adresse, telephone, email, site_web, directeur, annee_scolaire } = req.body;
        
        if (!nom) {
            return res.json({ success: false, error: 'Le nom est obligatoire' });
        }

        const code = req.session.user.etablissement_code || 'ETAB_' + Date.now().toString(36).toUpperCase();
        const dbName = 'educos_' + code.toLowerCase() + '.db';
        const dbPath = path.join(__dirname, '..', 'database', dbName);
        
        const { globalDb, setEtablissementDb } = require('../config/database');
        
        // Créer/initialiser la base de l'établissement immédiatement
        setEtablissementDb(dbPath);
        
        globalDb.get('SELECT id FROM etablissements WHERE code = ?', [code], (err, row) => {
            if (row) {
                // Mise à jour
                globalDb.run('UPDATE etablissements SET nom=?, adresse=?, telephone=?, email=?, site_web=?, directeur=?, annee_scolaire=?, updated_at=CURRENT_TIMESTAMP WHERE code=?',
                    [nom, adresse||'', telephone||'', email||'', site_web||'', directeur||'', annee_scolaire||'', code], function(err) {
                    
                    const message = '✅ ÉTABLISSEMENT MIS À JOUR !\n\n' +
                        'Nom : ' + nom + '\n' +
                        'Base de données : ' + dbName + '\n' +
                        'Code : ' + code + '\n' +
                        'Statut : ' + (err ? 'ERREUR' : 'SUCCÈS');
                    
                    console.log(message);
                    res.json({ success: true, message: message, code: code, dbName: dbName });
                });
            } else {
                // Création
                globalDb.run('INSERT INTO etablissements (code, nom, adresse, telephone, email, site_web, directeur, annee_scolaire, db_name) VALUES (?,?,?,?,?,?,?,?,?)',
                    [code, nom, adresse||'', telephone||'', email||'', site_web||'', directeur||'', annee_scolaire||'', dbName], function(err) {
                    
                    req.session.user.etablissement_code = code;
                    req.session.save();
                    
                    const message = '✅ NOUVEL ÉTABLISSEMENT CRÉÉ !\n\n' +
                        'Nom : ' + nom + '\n' +
                        'Base de données : ' + dbName + '\n' +
                        'Code : ' + code + '\n' +
                        'Tables : ' + (err ? 'ERREUR' : 'CRÉÉES AVEC SUCCÈS') + '\n\n' +
                        '🔒 Vos données sont isolées des autres établissements.';
                    
                    console.log(message);
                    res.json({ success: true, message: message, code: code, dbName: dbName });
                });
            }
        });
    },

    getSettings: (req, res) => {
        const etablissementDb = require('../config/database').getEtablissementDb();
        const dbToUse = etablissementDb || db;
        dbToUse.get('SELECT * FROM settings WHERE id=1', [], (err, row) => {
            if (!row) {
                dbToUse.run('INSERT INTO settings (id) VALUES (1)', [], (err) => {});
                return res.json({ max_users: 500, default_role: 'eleve', maintenance_mode: 0, allow_registration: 1, notifications_active: 1, messagerie_active: 1, chat_eleves_active: 1, paiements_online_active: 0, email_verification: 0, session_duration: 24 });
            }
            res.json(row);
        });
    },

    updateSettings: (req, res) => {
        const { max_users, default_role, maintenance_mode, allow_registration, notifications_active, messagerie_active, chat_eleves_active, paiements_online_active, email_verification, session_duration } = req.body;
        const maxUsers = Math.min(parseInt(max_users) || 500, 1500);
        
        const etablissementDb = require('../config/database').getEtablissementDb();
        const dbToUse = etablissementDb || db;
        
        dbToUse.get('SELECT id FROM settings WHERE id=1', [], (err, row) => {
            if (row) {
                dbToUse.run('UPDATE settings SET max_users=?, default_role=?, maintenance_mode=?, allow_registration=?, notifications_active=?, messagerie_active=?, chat_eleves_active=?, paiements_online_active=?, email_verification=?, session_duration=? WHERE id=1',
                    [maxUsers, default_role||'eleve', maintenance_mode||0, allow_registration!=0?1:0, notifications_active!=0?1:0, messagerie_active!=0?1:0, chat_eleves_active!=0?1:0, paiements_online_active!=0?1:0, email_verification||0, session_duration||24], (err) => {
                    if (err) return res.json({ success: false, error: 'Erreur' });
                    res.json({ success: true, message: '✅ Paramètres enregistrés avec succès' });
                });
            } else {
                dbToUse.run('INSERT INTO settings (id, max_users, default_role, maintenance_mode, allow_registration, notifications_active, messagerie_active, chat_eleves_active, paiements_online_active, email_verification, session_duration) VALUES (1,?,?,?,?,?,?,?,?,?,?)',
                    [maxUsers, default_role||'eleve', maintenance_mode||0, allow_registration!=0?1:0, notifications_active!=0?1:0, messagerie_active!=0?1:0, chat_eleves_active!=0?1:0, paiements_online_active!=0?1:0, email_verification||0, session_duration||24], (err) => {
                    if (err) return res.json({ success: false, error: 'Erreur' });
                    res.json({ success: true, message: '✅ Paramètres créés avec succès' });
                });
            }
        });
    },

    getPaiements: (req, res) => {
        const page = parseInt(req.query.page) || 1, limit = 15, offset = (page - 1) * limit;
        const type = req.query.type || '', search = req.query.search || '';
        let where = [], params = [];
        if (type) { where.push('p.type = ?'); params.push(type); }
        if (search) { where.push('(p.description LIKE ? OR p.beneficiaire LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
        const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
        
        const etablissementDb = require('../config/database').getEtablissementDb();
        const dbToUse = etablissementDb || db;
        
        dbToUse.get(`SELECT COUNT(*) as total FROM paiements p ${wc}`, params, (err, row) => {
            dbToUse.all(`SELECT p.*, u.nom, u.prenom FROM paiements p LEFT JOIN users u ON p.user_id = u.id ${wc} ORDER BY p.date_paiement DESC LIMIT ? OFFSET ?`, [...params, limit, offset], (err, paiements) => {
                res.json({ paiements, pagination: { currentPage: page, totalPages: Math.ceil((row?.total||0)/limit), total: row?.total||0 } });
            });
        });
    },

    getPaiementStats: (req, res) => {
        const etablissementDb = require('../config/database').getEtablissementDb();
        const dbToUse = etablissementDb || db;
        dbToUse.get("SELECT SUM(montant) as total FROM paiements WHERE type='recette'", [], (err, row) => {
            const recettes = row?.total || 0;
            dbToUse.get("SELECT SUM(montant) as total FROM paiements WHERE type='depense'", [], (err, row) => {
                const depenses = row?.total || 0;
                res.json({ totalRecettes: recettes, totalDepenses: depenses, solde: recettes - depenses, totalEleves: 0, elevesPayeurs: 0 });
            });
        });
    },

    createPaiement: (req, res) => {
        const { type, categorie, montant, description, date_paiement, beneficiaire, mode_paiement, reference, user_id } = req.body;
        const etablissementDb = require('../config/database').getEtablissementDb();
        const dbToUse = etablissementDb || db;
        dbToUse.run('INSERT INTO paiements (type,categorie,montant,description,date_paiement,beneficiaire,mode_paiement,reference,user_id) VALUES (?,?,?,?,?,?,?,?,?)',
            [type, categorie, montant, description, date_paiement, beneficiaire, mode_paiement||'especes', reference, user_id||null], function(err) {
                if (err) return res.status(500).json({ error: 'Erreur' });
                res.json({ success: true, message: 'Paiement enregistré' });
            });
    },

    updatePaiement: (req, res) => {
        const { type, categorie, montant, description, date_paiement, beneficiaire, mode_paiement, reference } = req.body;
        const etablissementDb = require('../config/database').getEtablissementDb();
        const dbToUse = etablissementDb || db;
        dbToUse.run('UPDATE paiements SET type=?,categorie=?,montant=?,description=?,date_paiement=?,beneficiaire=?,mode_paiement=?,reference=? WHERE id=?',
            [type, categorie, montant, description, date_paiement, beneficiaire, mode_paiement, reference, req.params.id], (err) => {
                if (err) return res.status(500).json({ error: 'Erreur' });
                res.json({ success: true, message: 'Modifié' });
            });
    },

    deletePaiement: (req, res) => {
        const etablissementDb = require('../config/database').getEtablissementDb();
        const dbToUse = etablissementDb || db;
        dbToUse.run('DELETE FROM paiements WHERE id=?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Supprimé' });
        });
    },

    getMessages: (req, res) => {
        const etablissementDb = require('../config/database').getEtablissementDb();
        const dbToUse = etablissementDb || db;
        dbToUse.all(`SELECT m.*, u.nom as exp_nom, u.prenom as exp_prenom FROM messages m LEFT JOIN users u ON m.expediteur_id = u.id WHERE m.destinataire_id = ? OR m.destinataire_role = 'all' OR m.destinataire_role = ? ORDER BY m.created_at DESC LIMIT 30`,
            [req.session.user.id, req.session.user.role], (err, messages) => res.json(messages || []));
    },

    sendMessage: (req, res) => {
        const { destinataire_id, destinataire_role, sujet, contenu } = req.body;
        if (!sujet || !contenu) return res.status(400).json({ error: 'Sujet et contenu requis' });
        const expediteur_id = req.session.user.id;
        const fichier = req.file ? req.file.filename : null;
        
        const etablissementDb = require('../config/database').getEtablissementDb();
        const dbToUse = etablissementDb || db;
        
        dbToUse.run('INSERT INTO messages (expediteur_id, destinataire_id, destinataire_role, sujet, contenu, fichier) VALUES (?,?,?,?,?,?)',
            [expediteur_id, destinataire_id||null, destinataire_role||'all', sujet, contenu, fichier], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                const messageId = this.lastID;
                if (destinataire_id) {
                    dbToUse.run("INSERT INTO notifications (user_id, type, titre, message, message_id) VALUES (?, 'message', ?, ?, ?)", [destinataire_id, sujet, contenu.substring(0, 100), messageId]);
                }
                res.json({ success: true, message: 'Message envoyé' });
            });
    },

    getUsersList: (req, res) => {
        const { globalDb } = require('../config/database');
        globalDb.all('SELECT id, nom, prenom, email, role FROM users WHERE compte_actif=1 ORDER BY nom', [], (err, users) => res.json(users || []));
    },

    getNotifications: (req, res) => {
        const etablissementDb = require('../config/database').getEtablissementDb();
        const dbToUse = etablissementDb || db;
        dbToUse.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [req.session.user.id], (err, rows) => res.json(rows || []));
    },

    markNotificationRead: (req, res) => {
        const etablissementDb = require('../config/database').getEtablissementDb();
        const dbToUse = etablissementDb || db;
        dbToUse.run('UPDATE notifications SET lu = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id], (err) => res.json({ success: true }));
    },

    viderNotificationsGeneral: (req, res) => {
        const etablissementDb = require('../config/database').getEtablissementDb();
        const dbToUse = etablissementDb || db;
        dbToUse.run('DELETE FROM notifications WHERE user_id = ?', [req.session.user.id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Notifications vidées' });
        });
    }
};

module.exports = adminController;