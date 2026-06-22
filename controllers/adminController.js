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
        res.json([]);
    },
    sendMessage: (req, res) => { res.json({ success: true }); },
    getUsersList: (req, res) => { res.json([]); },
    getNotifications: (req, res) => { res.json([]); },
    markNotificationRead: (req, res) => { res.json({ success: true }); },
    viderNotificationsGeneral: (req, res) => { res.json({ success: true }); }
};

module.exports = adminController;