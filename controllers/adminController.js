const bcrypt = require('bcryptjs');
const path = require('path');
const databaseModule = require('../config/database');

function getDb() {
    return databaseModule.getEtablissementDb() || databaseModule.globalDb;
}

const adminController = {
    getStats: (req, res) => {
        const db = getDb();
        if (!db) return res.json({ totalUsers: 0, totalEleves: 0, totalProfs: 0, totalAdmins: 0, notificationsNonLues: 0 });
        db.get('SELECT COUNT(*) as total FROM users', [], (err, row) => {
            db.get("SELECT COUNT(*) as total FROM users WHERE role = 'eleve'", [], (err, r2) => {
                db.get("SELECT COUNT(*) as total FROM users WHERE role = 'prof'", [], (err, r3) => {
                    db.get("SELECT COUNT(*) as total FROM users WHERE role = 'admin'", [], (err, r4) => {
                        res.json({
                            totalUsers: row?.total || 0,
                            totalEleves: r2?.total || 0,
                            totalProfs: r3?.total || 0,
                            totalAdmins: r4?.total || 0,
                            notificationsNonLues: 0
                        });
                    });
                });
            });
        });
    },

    getUsers: (req, res) => {
        const db = getDb();
        if (!db) return res.json({ users: [], pagination: { currentPage: 1, totalPages: 0 } });
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const role = req.query.role || '';
        let where = [];
        let params = [];
        if (search) { where.push('(nom LIKE ? OR prenom LIKE ? OR email LIKE ?)'); params.push('%' + search + '%', '%' + search + '%', '%' + search + '%'); }
        if (role) { where.push('role = ?'); params.push(role); }
        const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
        db.get(`SELECT COUNT(*) as total FROM users ${wc}`, params, (err, row) => {
            db.all(`SELECT * FROM users ${wc} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset], (err, users) => {
                res.json({ users: users || [], pagination: { currentPage: page, totalPages: Math.ceil((row?.total || 0) / limit), total: row?.total || 0 } });
            });
        });
    },

    getUserById: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        db.get('SELECT * FROM users WHERE id = ?', [req.params.id], (err, user) => {
            if (err || !user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
            res.json(user);
        });
    },

    createUser: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        const { nom, prenom, email, password, role, telephone, matiere_principale, classes_assignees, date_naissance } = req.body;
        if (!nom || !prenom || !email || !password || !role) return res.status(400).json({ error: 'Champs obligatoires' });
        db.get('SELECT id FROM users WHERE email = ?', [email], (err, user) => {
            if (user) return res.status(400).json({ error: 'Email déjà utilisé' });
            bcrypt.hash(password, 10, (err, hash) => {
                if (err) return res.status(500).json({ error: 'Erreur hashage' });
                db.run('INSERT INTO users (nom, prenom, email, password, role, telephone, matiere_principale, classes_assignees, date_naissance) VALUES (?,?,?,?,?,?,?,?,?)',
                    [nom, prenom, email, hash, role, telephone || null, matiere_principale || null, classes_assignees || null, date_naissance || null], function (err) {
                        if (err) return res.status(500).json({ error: 'Erreur création: ' + err.message });
                        res.json({ success: true, message: '✅ Utilisateur créé avec succès', userId: this.lastID });
                    });
            });
        });
    },

    updateUser: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        const { nom, prenom, email, role, telephone, matiere_principale, classes_assignees, date_naissance, compte_actif } = req.body;
        db.run('UPDATE users SET nom=?, prenom=?, email=?, role=?, telephone=?, matiere_principale=?, classes_assignees=?, date_naissance=?, compte_actif=? WHERE id=?',
            [nom, prenom, email, role, telephone || null, matiere_principale || null, classes_assignees || null, date_naissance || null, compte_actif !== undefined ? compte_actif : 1, req.params.id], (err) => {
                if (err) return res.status(500).json({ error: 'Erreur modification: ' + err.message });
                res.json({ success: true, message: '✅ Utilisateur modifié avec succès' });
            });
    },

    deleteUser: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        if (req.params.id == req.session.user.id) return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
        db.run('DELETE FROM users WHERE id = ?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur suppression' });
            res.json({ success: true, message: '✅ Utilisateur supprimé' });
        });
    },

    toggleUserStatus: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        db.get('SELECT compte_actif FROM users WHERE id = ?', [req.params.id], (err, user) => {
            if (!user) return res.status(404).json({ error: 'Non trouvé' });
            const newStatus = user.compte_actif ? 0 : 1;
            db.run('UPDATE users SET compte_actif = ? WHERE id = ?', [newStatus, req.params.id], (err) => {
                if (err) return res.status(500).json({ error: 'Erreur' });
                res.json({ success: true, message: newStatus ? '✅ Compte activé' : '🚫 Compte désactivé', compte_actif: newStatus });
            });
        });
    },

    resetPassword: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        const newPassword = 'EducOS' + Math.random().toString(36).substring(2, 8).toUpperCase();
        bcrypt.hash(newPassword, 10, (err, hash) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            db.run('UPDATE users SET password = ? WHERE id = ?', [hash, req.params.id], (err) => {
                if (err) return res.status(500).json({ error: 'Erreur' });
                // Récupérer l'email pour l'envoyer (simulation)
                db.get('SELECT email FROM users WHERE id = ?', [req.params.id], (err, user) => {
                    const message = '✅ Mot de passe réinitialisé';
                    console.log('📧 Nouveau MDP pour ' + (user?.email || 'inconnu') + ' : ' + newPassword);
                    res.json({ success: true, message: message, tempPassword: newPassword, email: user?.email });
                });
            });
        });
    },

    getEtablissement: (req, res) => {
        const code = req.session.user?.etablissement_code || '';
        if (!code) return res.json({});
        databaseModule.globalDb.get('SELECT * FROM etablissements WHERE code = ?', [code], (err, row) => res.json(row || {}));
    },

    updateEtablissement: (req, res) => {
        const { nom, adresse, telephone, email, site_web, directeur, annee_scolaire } = req.body;
        if (!nom) return res.json({ success: false, error: 'Nom obligatoire' });
        const code = req.session.user?.etablissement_code || 'ETAB_' + nom.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 8);
        const dbName = 'educos_' + code.toLowerCase() + '.db';
        const dbPath = path.join(__dirname, '..', 'database', dbName);
        databaseModule.globalDb.get('SELECT id FROM etablissements WHERE code = ?', [code], (err, row) => {
            if (row) {
                databaseModule.globalDb.run('UPDATE etablissements SET adresse=?, telephone=?, email=?, site_web=?, directeur=?, annee_scolaire=? WHERE code=?',
                    [adresse || '', telephone || '', email || '', site_web || '', directeur || '', annee_scolaire || '', code], (err) => {
                        res.json({ success: true, message: '✅ Mis à jour !', code: code });
                    });
            } else {
                databaseModule.globalDb.run('INSERT INTO etablissements (code, nom, adresse, telephone, email, site_web, directeur, annee_scolaire, db_name) VALUES (?,?,?,?,?,?,?,?,?)',
                    [code, nom, adresse || '', telephone || '', email || '', site_web || '', directeur || '', annee_scolaire || '', dbName], (err) => {
                        req.session.user.etablissement_code = code;
                        req.session.save();
                        databaseModule.setEtablissementDb(dbPath);
                        res.json({ success: true, message: '✅ Base créée ! Code : ' + code, code: code, dbName: dbName });
                    });
            }
        });
    },

    getSettings: (req, res) => {
        const db = getDb();
        if (!db) return res.json({});
        db.get('SELECT * FROM settings WHERE id=1', [], (err, row) => {
            if (!row) {
                db.run('INSERT INTO settings (id) VALUES (1)');
                return res.json({ max_users: 500, default_role: 'eleve', maintenance_mode: 0, allow_registration: 1, notifications_active: 1, messagerie_active: 1, chat_eleves_active: 1, paiements_online_active: 0 });
            }
            res.json(row);
        });
    },

    updateSettings: (req, res) => {
        const db = getDb();
        if (!db) return res.json({ success: false, error: 'Base non disponible' });
        const { max_users, default_role, maintenance_mode, allow_registration, notifications_active, messagerie_active, chat_eleves_active, paiements_online_active } = req.body;
        const maxUsers = Math.min(parseInt(max_users) || 500, 1500);
        db.get('SELECT id FROM settings WHERE id=1', [], (err, row) => {
            if (row) {
                db.run('UPDATE settings SET max_users=?, default_role=?, maintenance_mode=?, allow_registration=?, notifications_active=?, messagerie_active=?, chat_eleves_active=?, paiements_online_active=? WHERE id=1',
                    [maxUsers, default_role || 'eleve', maintenance_mode || 0, allow_registration ? 1 : 0, notifications_active ? 1 : 0, messagerie_active ? 1 : 0, chat_eleves_active ? 1 : 0, paiements_online_active ? 1 : 0], (err) => {
                        if (err) return res.json({ success: false, error: 'Erreur' });
                        res.json({ success: true, message: '✅ Paramètres enregistrés avec succès' });
                    });
            } else {
                db.run('INSERT INTO settings (id, max_users, default_role, maintenance_mode, allow_registration, notifications_active, messagerie_active, chat_eleves_active, paiements_online_active) VALUES (1,?,?,?,?,?,?,?,?)',
                    [maxUsers, default_role || 'eleve', maintenance_mode || 0, allow_registration ? 1 : 0, notifications_active ? 1 : 0, messagerie_active ? 1 : 0, chat_eleves_active ? 1 : 0, paiements_online_active ? 1 : 0], (err) => {
                        if (err) return res.json({ success: false, error: 'Erreur' });
                        res.json({ success: true, message: '✅ Paramètres créés avec succès' });
                    });
            }
        });
    },

    getPaiements: (req, res) => {
        const db = getDb();
        if (!db) return res.json({ paiements: [], pagination: { currentPage: 1, totalPages: 0 } });
        const page = parseInt(req.query.page) || 1;
        const limit = 15;
        const offset = (page - 1) * limit;
        const type = req.query.type || '';
        const search = req.query.search || '';
        let where = [];
        let params = [];
        if (type) { where.push('p.type = ?'); params.push(type); }
        if (search) { where.push('(p.description LIKE ? OR p.beneficiaire LIKE ?)'); params.push('%' + search + '%', '%' + search + '%'); }
        const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
        db.get(`SELECT COUNT(*) as total FROM paiements p ${wc}`, params, (err, row) => {
            db.all(`SELECT p.*, u.nom, u.prenom FROM paiements p LEFT JOIN users u ON p.user_id = u.id ${wc} ORDER BY p.date_paiement DESC LIMIT ? OFFSET ?`, [...params, limit, offset], (err, paiements) => {
                res.json({ paiements: paiements || [], pagination: { currentPage: page, totalPages: Math.ceil((row?.total || 0) / limit), total: row?.total || 0 } });
            });
        });
    },

    getPaiementStats: (req, res) => {
        const db = getDb();
        if (!db) return res.json({ totalRecettes: 0, totalDepenses: 0, solde: 0 });
        db.get("SELECT SUM(montant) as total FROM paiements WHERE type='recette'", [], (err, row) => {
            const recettes = row?.total || 0;
            db.get("SELECT SUM(montant) as total FROM paiements WHERE type='depense'", [], (err, row) => {
                const depenses = row?.total || 0;
                res.json({ totalRecettes: recettes, totalDepenses: depenses, solde: recettes - depenses });
            });
        });
    },

    createPaiement: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        const { type, categorie, montant, description, date_paiement, beneficiaire, mode_paiement, reference, user_id } = req.body;
        if (!type || !categorie || !montant) return res.status(400).json({ error: 'Type, catégorie et montant requis' });
        db.run('INSERT INTO paiements (type, categorie, montant, description, date_paiement, beneficiaire, mode_paiement, reference, user_id) VALUES (?,?,?,?,?,?,?,?,?)',
            [type, categorie, montant, description, date_paiement || new Date().toISOString().split('T')[0], beneficiaire || '', mode_paiement || 'especes', reference || '', user_id || null], function (err) {
                if (err) return res.status(500).json({ error: 'Erreur: ' + err.message });
                res.json({ success: true, message: '✅ Paiement enregistré' });
            });
    },

    updatePaiement: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        const { type, categorie, montant, description, date_paiement, beneficiaire, mode_paiement, reference } = req.body;
        db.run('UPDATE paiements SET type=?, categorie=?, montant=?, description=?, date_paiement=?, beneficiaire=?, mode_paiement=?, reference=? WHERE id=?',
            [type, categorie, montant, description, date_paiement, beneficiaire, mode_paiement, reference, req.params.id], (err) => {
                if (err) return res.status(500).json({ error: 'Erreur' });
                res.json({ success: true, message: '✅ Paiement modifié' });
            });
    },

    deletePaiement: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        db.run('DELETE FROM paiements WHERE id = ?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: '✅ Paiement supprimé' });
        });
    },

    getMessages: (req, res) => {
        const db = getDb();
        if (!db) return res.json([]);
        db.all(`SELECT m.*, u.nom as exp_nom, u.prenom as exp_prenom FROM messages m LEFT JOIN users u ON m.expediteur_id = u.id WHERE m.destinataire_id = ? OR m.destinataire_role = 'all' OR m.destinataire_role = 'admin' ORDER BY m.created_at DESC LIMIT 30`,
            [req.session.user.id], (err, messages) => res.json(messages || []));
    },

    sendMessage: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        const { destinataire_id, destinataire_role, sujet, contenu } = req.body;
        if (!sujet || !contenu) return res.status(400).json({ error: 'Sujet et contenu requis' });
        db.run('INSERT INTO messages (expediteur_id, destinataire_id, destinataire_role, sujet, contenu) VALUES (?,?,?,?,?)',
            [req.session.user.id, destinataire_id || null, destinataire_role || 'all', sujet, contenu], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Message envoyé' });
            });
    },

    getUsersList: (req, res) => {
        const db = getDb();
        if (!db) return res.json([]);
        db.all('SELECT id, nom, prenom, email, role FROM users WHERE compte_actif=1 ORDER BY nom', [], (err, users) => res.json(users || []));
    },

    getNotifications: (req, res) => {
        const db = getDb();
        if (!db) return res.json([]);
        db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [req.session.user.id], (err, rows) => res.json(rows || []));
    },

    markNotificationRead: (req, res) => {
        const db = getDb();
        if (!db) return res.json({ success: false });
        db.run('UPDATE notifications SET lu = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id], (err) => res.json({ success: true }));
    },

    viderNotificationsGeneral: (req, res) => {
        const db = getDb();
        if (!db) return res.json({ success: false });
        db.run('DELETE FROM notifications WHERE user_id = ?', [req.session.user.id], (err) => res.json({ success: true, message: 'Notifications vidées' }));
    }
};

module.exports = adminController;