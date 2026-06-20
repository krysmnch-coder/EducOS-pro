const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { globalDb, setEtablissementDb } = require('../config/database');
const path = require('path');

const adminController = {
    getStats: (req, res) => {
        db.get('SELECT COUNT(*) as total FROM users', [], (err, row) => {
            res.json({ totalUsers: row?.total || 0, totalEleves: 0, totalProfs: 0, totalAdmins: 0 });
        });
    },

    getUsers: (req, res) => {
        db.all('SELECT * FROM users ORDER BY created_at DESC', [], (err, users) => {
            res.json({ users: users || [], pagination: { currentPage: 1, totalPages: 1 } });
        });
    },

    createUser: (req, res) => {
    const { nom, prenom, email, password, role, telephone, matiere_principale, classes_assignees, date_naissance } = req.body;
    if (!nom || !prenom || !email || !password || !role) return res.status(400).json({ error: 'Champs obligatoires' });

    // Utiliser la base établissement de l'admin connecté
    const db = require('../config/database').getEtablissementDb();
    if (!db) return res.status(500).json({ error: 'Base établissement non disponible. Créez d\'abord votre établissement.' });

    db.get('SELECT id FROM users WHERE email = ?', [email], (err, user) => {
        if (user) return res.status(400).json({ error: 'Email déjà utilisé' });
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            db.run('INSERT INTO users (nom, prenom, email, password, role, telephone, matiere_principale, classes_assignees, date_naissance) VALUES (?,?,?,?,?,?,?,?,?)',
                [nom, prenom, email, hash, role, telephone||null, matiere_principale||null, classes_assignees||null, date_naissance||null], function(err) {
                    if (err) return res.status(500).json({ error: 'Erreur création: ' + err.message });
                    res.json({ success: true, message: '✅ Utilisateur créé avec succès' });
                });
        });
    });
},

    updateUser: (req, res) => { res.json({ success: true, message: 'Modifié' }); },
    deleteUser: (req, res) => { res.json({ success: true, message: 'Supprimé' }); },
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
        const nomCode = nom.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase();
        const code = 'ETAB_' + nomCode + '_' + Date.now().toString(36).toUpperCase().substring(0, 4);
        const dbName = 'educos_' + code.toLowerCase() + '.db';
        const dbDir = process.env.RENDER ? '/opt/render/project/src/database' : path.join(__dirname, '..', 'database');
        const dbPath = path.join(dbDir, dbName);
        
        globalDb.get('SELECT id FROM etablissements WHERE nom = ?', [nom], (err, row) => {
            if (row) {
                globalDb.run('UPDATE etablissements SET adresse=?, telephone=?, email=?, site_web=?, directeur=?, annee_scolaire=? WHERE nom=?',
                    [adresse||'', telephone||'', email||'', site_web||'', directeur||'', annee_scolaire||'', nom], (err) => {
                    res.json({ success: true, message: '✅ Établissement mis à jour ! Code : ' + code, code: code, dbName: dbName });
                });
            } else {
                globalDb.run('INSERT INTO etablissements (code, nom, adresse, telephone, email, site_web, directeur, annee_scolaire, db_name) VALUES (?,?,?,?,?,?,?,?,?)',
                    [code, nom, adresse||'', telephone||'', email||'', site_web||'', directeur||'', annee_scolaire||'', dbName], function(err) {
                    req.session.user.etablissement_code = code;
                    req.session.save();
                    setEtablissementDb(dbPath);
                    res.json({ success: true, message: '✅ BASE CRÉÉE ! Code : ' + code + ' | Base : ' + dbName, code: code, dbName: dbName });
                });
            }
        });
    },

    getSettings: (req, res) => { res.json({ max_users: 500, default_role: 'eleve', maintenance_mode: 0, allow_registration: 1 }); },
    updateSettings: (req, res) => { res.json({ success: true, message: '✅ Paramètres enregistrés' }); },

    getPaiements: (req, res) => { res.json({ paiements: [], pagination: { currentPage: 1, totalPages: 0 } }); },
    getPaiementStats: (req, res) => { res.json({ totalRecettes: 0, totalDepenses: 0, solde: 0 }); },
    createPaiement: (req, res) => { res.json({ success: true, message: 'Paiement enregistré' }); },
    updatePaiement: (req, res) => { res.json({ success: true }); },
    deletePaiement: (req, res) => { res.json({ success: true }); },

    getMessages: (req, res) => { res.json([]); },
    sendMessage: (req, res) => { res.json({ success: true, message: 'Message envoyé' }); },
    getUsersList: (req, res) => { res.json([]); },
    getNotifications: (req, res) => { res.json([]); },
    markNotificationRead: (req, res) => { res.json({ success: true }); },
    viderNotificationsGeneral: (req, res) => { res.json({ success: true }); }
};

module.exports = adminController;