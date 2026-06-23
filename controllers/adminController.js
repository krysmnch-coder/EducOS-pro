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
            res.json({ totalUsers: row?.total || 0, totalEleves: 0, totalProfs: 0, totalAdmins: 0, notificationsNonLues: 0 });
        });
    },

    getUsers: (req, res) => {
        const db = getDb();
        if (!db) return res.json({ users: [], pagination: { currentPage: 1, totalPages: 0 } });
        db.all('SELECT * FROM users ORDER BY created_at DESC', [], (err, users) => {
            res.json({ users: users || [], pagination: { currentPage: 1, totalPages: 1 } });
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
                db.run('INSERT INTO users (nom, prenom, email, password, role, telephone, matiere_principale, classes_assignees, date_naissance) VALUES (?,?,?,?,?,?,?,?,?)',
                    [nom, prenom, email, hash, role, telephone||null, matiere_principale||null, classes_assignees||null, date_naissance||null], function(err) {
                        if (err) return res.status(500).json({ error: 'Erreur: ' + err.message });
                        res.json({ success: true, message: 'Utilisateur créé' });
                    });
            });
        });
    },

    updateUser: (req, res) => { res.json({ success: true }); },
    deleteUser: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        db.run('DELETE FROM users WHERE id = ?', [req.params.id], (err) => res.json({ success: true }));
    },
    toggleUserStatus: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        db.get('SELECT compte_actif FROM users WHERE id = ?', [req.params.id], (err, user) => {
            if (!user) return res.status(404).json({ error: 'Non trouvé' });
            db.run('UPDATE users SET compte_actif = ? WHERE id = ?', [user.compte_actif ? 0 : 1, req.params.id], (err) => res.json({ success: true }));
        });
    },
    resetPassword: (req, res) => { res.json({ success: true, tempPassword: 'EducOS2024!' }); },

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
                    [adresse||'', telephone||'', email||'', site_web||'', directeur||'', annee_scolaire||'', code], (err) => {
                    res.json({ success: true, message: '✅ Mis à jour ! Code : ' + code, code: code });
                });
            } else {
                databaseModule.globalDb.run('INSERT INTO etablissements (code, nom, adresse, telephone, email, site_web, directeur, annee_scolaire, db_name) VALUES (?,?,?,?,?,?,?,?,?)',
                    [code, nom, adresse||'', telephone||'', email||'', site_web||'', directeur||'', annee_scolaire||'', dbName], (err) => {
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
        db.get('SELECT * FROM settings WHERE id=1', [], (err, row) => res.json(row || {}));
    },
    updateSettings: (req, res) => { res.json({ success: true, message: '✅ Paramètres enregistrés' }); },

    getPaiements: (req, res) => { res.json({ paiements: [], pagination: { currentPage: 1, totalPages: 0 } }); },
    getPaiementStats: (req, res) => { res.json({ totalRecettes: 0, totalDepenses: 0, solde: 0 }); },
    createPaiement: (req, res) => { res.json({ success: true }); },
    updatePaiement: (req, res) => { res.json({ success: true }); },
    deletePaiement: (req, res) => { res.json({ success: true }); },

    getMessages: (req, res) => {
        const db = getDb();
        if (!db) return res.json([]);
        const userId = req.session.user.id;
        db.all(`SELECT m.*, u.nom as exp_nom, u.prenom as exp_prenom FROM messages m LEFT JOIN users u ON m.expediteur_id = u.id WHERE m.destinataire_id = ? OR m.destinataire_role = 'all' OR m.destinataire_role = 'admin' ORDER BY m.created_at DESC LIMIT 30`,
            [userId], (err, messages) => res.json(messages || []));
    },

    sendMessage: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
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