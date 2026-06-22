const bcrypt = require('bcryptjs');
const { globalDb, getEtablissementDb, setEtablissementDb } = require('../config/database');
const path = require('path');

const adminController = {
    getStats: (req, res) => {
        // Utiliser la base établissement si disponible, sinon la globale
        const db = getEtablissementDb() || globalDb;
        
        db.get('SELECT COUNT(*) as total FROM users', [], (err, row) => {
            res.json({ 
                totalUsers: row?.total || 0, 
                totalEleves: 0, 
                totalProfs: 0, 
                totalAdmins: 0,
                notificationsNonLues: 0
            });
        });
    },

    getUsers: (req, res) => {
        const db = getEtablissementDb() || globalDb;
        
        db.all('SELECT * FROM users ORDER BY created_at DESC', [], (err, users) => {
            res.json({ users: users || [], pagination: { currentPage: 1, totalPages: 1 } });
        });
    },

    createUser: (req, res) => {
        const db = getEtablissementDb();
        if (!db) return res.status(500).json({ error: 'Base établissement non disponible' });
        
        const { nom, prenom, email, password, role } = req.body;
        if (!nom || !prenom || !email || !password || !role) return res.status(400).json({ error: 'Champs obligatoires' });
        
        db.get('SELECT id FROM users WHERE email = ?', [email], (err, user) => {
            if (user) return res.status(400).json({ error: 'Email déjà utilisé' });
            bcrypt.hash(password, 10, (err, hash) => {
                db.run('INSERT INTO users (nom, prenom, email, password, role) VALUES (?,?,?,?,?)',
                    [nom, prenom, email, hash, role], function(err) {
                        if (err) return res.status(500).json({ error: 'Erreur' });
                        res.json({ success: true, message: 'Utilisateur créé' });
                    });
            });
        });
    },

    updateUser: (req, res) => { res.json({ success: true }); },
    deleteUser: (req, res) => { res.json({ success: true }); },
    toggleUserStatus: (req, res) => { res.json({ success: true }); },
    resetPassword: (req, res) => { res.json({ success: true, tempPassword: 'EducOS2024!' }); },

    getEtablissement: (req, res) => {
        const code = req.session.user?.etablissement_code || '';
        if (!code) return res.json({});
        globalDb.get('SELECT * FROM etablissements WHERE code = ?', [code], (err, row) => res.json(row || {}));
    },

    updateEtablissement: (req, res) => {
        const { nom, adresse, telephone, email, site_web, directeur, annee_scolaire } = req.body;
        if (!nom) return res.json({ success: false, error: 'Nom obligatoire' });
        const code = req.session.user?.etablissement_code || 'ETAB_' + nom.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 8);
        const dbName = 'educos_' + code.toLowerCase() + '.db';
        const dbPath = path.join(__dirname, '..', 'database', dbName);
        
        globalDb.get('SELECT id FROM etablissements WHERE code = ?', [code], (err, row) => {
            if (row) {
                globalDb.run('UPDATE etablissements SET adresse=?, telephone=?, email=?, site_web=?, directeur=?, annee_scolaire=? WHERE code=?',
                    [adresse||'', telephone||'', email||'', site_web||'', directeur||'', annee_scolaire||'', code], (err) => {
                    res.json({ success: true, message: '✅ Mis à jour ! Code : ' + code, code: code });
                });
            } else {
                globalDb.run('INSERT INTO etablissements (code, nom, adresse, telephone, email, site_web, directeur, annee_scolaire, db_name) VALUES (?,?,?,?,?,?,?,?,?)',
                    [code, nom, adresse||'', telephone||'', email||'', site_web||'', directeur||'', annee_scolaire||'', dbName], (err) => {
                    req.session.user.etablissement_code = code;
                    req.session.save();
                    setEtablissementDb(dbPath);
                    res.json({ success: true, message: '✅ Base créée ! Code : ' + code, code: code, dbName: dbName });
                });
            }
        });
    },

    getSettings: (req, res) => {
        const db = getEtablissementDb() || globalDb;
        db.get('SELECT * FROM settings WHERE id=1', [], (err, row) => res.json(row || {}));
    },

    updateSettings: (req, res) => {
        const db = getEtablissementDb() || globalDb;
        res.json({ success: true, message: '✅ Paramètres enregistrés' });
    },

    getPaiements: (req, res) => {
        const db = getEtablissementDb() || globalDb;
        res.json({ paiements: [], pagination: { currentPage: 1, totalPages: 0 } });
    },
    getPaiementStats: (req, res) => { res.json({ totalRecettes: 0, totalDepenses: 0, solde: 0 }); },
    createPaiement: (req, res) => { res.json({ success: true }); },
    updatePaiement: (req, res) => { res.json({ success: true }); },
    deletePaiement: (req, res) => { res.json({ success: true }); },

    getMessages: (req, res) => {
    const db = getEtablissementDb() || globalDb;
    if (!db) return res.json([]);
    const userId = req.session.user.id;
    db.all(`SELECT m.*, u.nom as exp_nom, u.prenom as exp_prenom FROM messages m LEFT JOIN users u ON m.expediteur_id = u.id WHERE m.destinataire_id = ? OR m.destinataire_role = 'all' OR m.destinataire_role = 'admin' ORDER BY m.created_at DESC LIMIT 30`,
        [userId], (err, messages) => res.json(messages || []));
},

sendMessage: (req, res) => {
    const db = getEtablissementDb() || globalDb;
    if (!db) return res.status(500).json({ error: 'Base non disponible' });
    const { destinataire_id, destinataire_role, sujet, contenu } = req.body;
    if (!sujet || !contenu) return res.status(400).json({ error: 'Sujet et contenu requis' });
    const expediteur_id = req.session.user.id;
    const fichier = req.file ? req.file.filename : null;
    db.run('INSERT INTO messages (expediteur_id, destinataire_id, destinataire_role, sujet, contenu, fichier) VALUES (?,?,?,?,?,?)',
        [expediteur_id, destinataire_id||null, destinataire_role||'all', sujet, contenu, fichier], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            const messageId = this.lastID;
            if (destinataire_id) {
                db.run("INSERT INTO notifications (user_id, type, titre, message, message_id) VALUES (?, 'message', ?, ?, ?)", [destinataire_id, sujet, contenu.substring(0, 100), messageId]);
            } else if (destinataire_role && destinataire_role !== 'all') {
                db.all("SELECT id FROM users WHERE role = ? AND compte_actif = 1", [destinataire_role], (err, users) => {
                    if (users) users.forEach(u => db.run("INSERT INTO notifications (user_id, type, titre, message, message_id) VALUES (?, 'message', ?, ?, ?)", [u.id, sujet, contenu.substring(0, 100), messageId]));
                });
            } else {
                db.all("SELECT id FROM users WHERE id != ? AND compte_actif = 1", [expediteur_id], (err, users) => {
                    if (users) users.forEach(u => db.run("INSERT INTO notifications (user_id, type, titre, message, message_id) VALUES (?, 'message', ?, ?, ?)", [u.id, sujet, contenu.substring(0, 100), messageId]));
                });
            }
            res.json({ success: true, message: 'Message envoyé' });
        });
},

getNotifications: (req, res) => {
    const db = getEtablissementDb() || globalDb;
    if (!db) return res.json([]);
    db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [req.session.user.id], (err, rows) => res.json(rows || []));
},

markNotificationRead: (req, res) => {
    const db = getEtablissementDb() || globalDb;
    if (!db) return res.json({ success: false });
    db.run('UPDATE notifications SET lu = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id], (err) => res.json({ success: true }));
},

viderNotificationsGeneral: (req, res) => {
    const db = getEtablissementDb() || globalDb;
    if (!db) return res.json({ success: false });
    db.run('DELETE FROM notifications WHERE user_id = ?', [req.session.user.id], (err) => res.json({ success: true, message: 'Notifications vidées' }));
},
    getUsersList: (req, res) => { res.json([]); },
    getNotifications: (req, res) => { res.json([]); },
    markNotificationRead: (req, res) => { res.json({ success: true }); },
    viderNotificationsGeneral: (req, res) => { res.json({ success: true }); }
};

module.exports = adminController;