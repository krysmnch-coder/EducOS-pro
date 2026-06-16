const db = require('../config/database');
const bcrypt = require('bcryptjs');

const adminController = {
    getStats: (req, res) => {
        const stats = {};
        db.get('SELECT COUNT(*) as total FROM users', [], (err, row) => {
            stats.totalUsers = row?.total || 0;
            db.get("SELECT COUNT(*) as total FROM users WHERE role = 'eleve'", [], (err, row) => {
                stats.totalEleves = row?.total || 0;
                db.get("SELECT COUNT(*) as total FROM users WHERE role = 'prof'", [], (err, row) => {
                    stats.totalProfs = row?.total || 0;
                    db.get("SELECT COUNT(*) as total FROM users WHERE role = 'admin'", [], (err, row) => {
                        stats.totalAdmins = row?.total || 0;
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
        db.get(`SELECT COUNT(*) as total FROM users ${wc}`, params, (err, row) => {
            db.all(`SELECT * FROM users ${wc} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset], (err, users) => {
                res.json({ users, pagination: { currentPage: page, totalPages: Math.ceil((row?.total||0)/limit), total: row?.total||0 } });
            });
        });
    },

    createUser: (req, res) => {
        const { nom, prenom, email, password, role } = req.body;
        if (!nom || !prenom || !email || !password || !role) return res.status(400).json({ error: 'Tous les champs obligatoires' });
        db.get('SELECT id FROM users WHERE email = ?', [email], (err, user) => {
            if (user) return res.status(400).json({ error: 'Email déjà utilisé' });
            bcrypt.hash(password, 10, (err, hash) => {
                if (err) return res.status(500).json({ error: 'Erreur' });
                db.run('INSERT INTO users (nom, prenom, email, password, role) VALUES (?,?,?,?,?)', [nom, prenom, email, hash, role], function(err) {
                    if (err) return res.status(500).json({ error: 'Erreur création' });
                    res.json({ success: true, message: 'Utilisateur créé' });
                });
            });
        });
    },

    updateUser: (req, res) => {
        const { nom, prenom, email, role, compte_actif } = req.body;
        db.run('UPDATE users SET nom=?, prenom=?, email=?, role=?, compte_actif=? WHERE id=?', [nom, prenom, email, role, compte_actif, req.params.id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Modifié' });
        });
    },

    deleteUser: (req, res) => {
        if (req.params.id == req.session.user.id) return res.status(400).json({ error: 'Action impossible' });
        db.run('DELETE FROM users WHERE id=?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Supprimé' });
        });
    },

    toggleUserStatus: (req, res) => {
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
            db.run('UPDATE users SET password=? WHERE id=?', [hash, req.params.id], (err) => {
                if (err) return res.status(500).json({ error: 'Erreur' });
                res.json({ success: true, message: 'MDP réinitialisé', tempPassword: np });
            });
        });
    },

    getEtablissement: (req, res) => db.get('SELECT * FROM etablissement WHERE id=1', [], (err, row) => res.json(row || {})),
    updateEtablissement: (req, res) => {
        const { nom, adresse, telephone, email, site_web, directeur, annee_scolaire } = req.body;
        db.get('SELECT id FROM etablissement WHERE id=1', [], (err, row) => {
            if (row) {
                db.run('UPDATE etablissement SET nom=?,adresse=?,telephone=?,email=?,site_web=?,directeur=?,annee_scolaire=? WHERE id=1', [nom, adresse, telephone, email, site_web, directeur, annee_scolaire], (err) => {
                    if (err) return res.status(500).json({ error: 'Erreur' });
                    res.json({ success: true, message: 'Enregistré' });
                });
            } else {
                db.run('INSERT INTO etablissement (id,nom,adresse,telephone,email,site_web,directeur,annee_scolaire) VALUES (1,?,?,?,?,?,?,?)', [nom, adresse, telephone, email, site_web, directeur, annee_scolaire], (err) => {
                    if (err) return res.status(500).json({ error: 'Erreur' });
                    res.json({ success: true, message: 'Créé' });
                });
            }
        });
    },

    getSettings: (req, res) => db.get('SELECT * FROM settings WHERE id=1', [], (err, row) => res.json(row || {})),
    updateSettings: (req, res) => {
        const { app_name, max_users, default_role, maintenance_mode, allow_registration } = req.body;
        db.get('SELECT id FROM settings WHERE id=1', [], (err, row) => {
            if (row) {
                db.run('UPDATE settings SET app_name=?,max_users=?,default_role=?,maintenance_mode=?,allow_registration=? WHERE id=1', [app_name, max_users, default_role, maintenance_mode, allow_registration], (err) => {
                    if (err) return res.status(500).json({ error: 'Erreur' });
                    res.json({ success: true, message: 'Paramètres mis à jour' });
                });
            } else {
                db.run('INSERT INTO settings (id,app_name,max_users,default_role,maintenance_mode,allow_registration) VALUES (1,?,?,?,?,?)', [app_name, max_users, default_role, maintenance_mode, allow_registration], (err) => {
                    if (err) return res.status(500).json({ error: 'Erreur' });
                    res.json({ success: true, message: 'Créé' });
                });
            }
        });
    },

    getPaiements: (req, res) => {
        const page = parseInt(req.query.page) || 1, limit = 15, offset = (page - 1) * limit;
        const type = req.query.type || '', categorie = req.query.categorie || '', search = req.query.search || '';
        let where = [], params = [];
        if (type) { where.push('p.type = ?'); params.push(type); }
        if (categorie) { where.push('p.categorie = ?'); params.push(categorie); }
        if (search) { where.push('(p.description LIKE ? OR p.beneficiaire LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
        const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
        db.get(`SELECT COUNT(*) as total FROM paiements p ${wc}`, params, (err, row) => {
            db.all(`SELECT p.*, u.nom, u.prenom FROM paiements p LEFT JOIN users u ON p.user_id = u.id ${wc} ORDER BY p.date_paiement DESC LIMIT ? OFFSET ?`, [...params, limit, offset], (err, paiements) => {
                res.json({ paiements, pagination: { currentPage: page, totalPages: Math.ceil((row?.total||0)/limit), total: row?.total||0 } });
            });
        });
    },

    getPaiementStats: (req, res) => {
        db.get("SELECT SUM(montant) as total FROM paiements WHERE type='recette'", [], (err, row) => {
            const recettes = row?.total || 0;
            db.get("SELECT SUM(montant) as total FROM paiements WHERE type='depense'", [], (err, row) => {
                const depenses = row?.total || 0;
                res.json({ totalRecettes: recettes, totalDepenses: depenses, solde: recettes - depenses });
            });
        });
    },

    createPaiement: (req, res) => {
        const { type, categorie, montant, description, date_paiement, beneficiaire, mode_paiement, reference, user_id } = req.body;
        db.run('INSERT INTO paiements (type,categorie,montant,description,date_paiement,beneficiaire,mode_paiement,reference,user_id) VALUES (?,?,?,?,?,?,?,?,?)',
            [type, categorie, montant, description, date_paiement, beneficiaire, mode_paiement||'especes', reference, user_id||null], function(err) {
                if (err) return res.status(500).json({ error: 'Erreur' });
                res.json({ success: true, message: 'Paiement enregistré' });
            });
    },

    updatePaiement: (req, res) => {
        const { type, categorie, montant, description, date_paiement, beneficiaire, mode_paiement, reference } = req.body;
        db.run('UPDATE paiements SET type=?,categorie=?,montant=?,description=?,date_paiement=?,beneficiaire=?,mode_paiement=?,reference=? WHERE id=?',
            [type, categorie, montant, description, date_paiement, beneficiaire, mode_paiement, reference, req.params.id], (err) => {
                if (err) return res.status(500).json({ error: 'Erreur' });
                res.json({ success: true, message: 'Modifié' });
            });
    },

    deletePaiement: (req, res) => {
        db.run('DELETE FROM paiements WHERE id=?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Supprimé' });
        });
    },

    getMessages: (req, res) => {
        db.all(`SELECT m.*, u.nom as exp_nom, u.prenom as exp_prenom FROM messages m LEFT JOIN users u ON m.expediteur_id = u.id WHERE m.destinataire_id = ? OR m.destinataire_role = 'all' OR m.destinataire_role = ? ORDER BY m.created_at DESC LIMIT 30`,
            [req.session.user.id, req.session.user.role], (err, messages) => res.json(messages || []));
    },

    sendMessage: (req, res) => {
        const { destinataire_id, destinataire_role, sujet, contenu } = req.body;
        if (!sujet || !contenu) return res.status(400).json({ error: 'Sujet et contenu requis' });
        const fichier = req.file ? req.file.filename : null;
        db.run('INSERT INTO messages (expediteur_id, destinataire_id, destinataire_role, sujet, contenu, fichier) VALUES (?,?,?,?,?,?)',
            [req.session.user.id, destinataire_id||null, destinataire_role||'all', sujet, contenu, fichier], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                if (destinataire_id) db.run("INSERT INTO notifications (user_id, type, titre, message, message_id) VALUES (?, 'message', ?, ?, ?)", [destinataire_id, sujet, contenu.substring(0, 100), this.lastID]);
                res.json({ success: true, message: 'Message envoyé' });
            });
    },

    getMessageDetail: (req, res) => {
        db.get('SELECT m.*, u.nom as exp_nom, u.prenom as exp_prenom FROM messages m LEFT JOIN users u ON m.expediteur_id = u.id WHERE m.id = ?', [req.params.id], (err, msg) => {
            if (err || !msg) return res.status(404).json({ error: 'Message non trouvé' });
            res.json(msg);
        });
    },

    getUsersList: (req, res) => {
        db.all('SELECT id, nom, prenom, email, role FROM users WHERE compte_actif=1 ORDER BY nom', [], (err, users) => res.json(users || []));
    },

    getNotifications: (req, res) => {
        db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [req.session.user.id], (err, rows) => res.json(rows || []));
    },

    markNotificationRead: (req, res) => {
        db.run('UPDATE notifications SET lu = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id], (err) => res.json({ success: true }));
    },

    viderNotificationsGeneral: (req, res) => {
        db.run('DELETE FROM notifications WHERE user_id = ?', [req.session.user.id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Notifications vidées' });
        });
    }
};

module.exports = adminController;