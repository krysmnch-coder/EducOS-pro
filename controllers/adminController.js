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
    const db = require('../config/database').getEtablissementDb();
    if (!db) return res.json({ users: [], pagination: { totalPages: 0, currentPage: 1, total: 0 } });
    
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const role = req.query.role || '';
    
    let where = [];
    let params = [];
    
    if (search) {
        where.push('(nom LIKE ? OR prenom LIKE ? OR email LIKE ?)');
        params.push('%' + search + '%', '%' + search + '%', '%' + search + '%');
    }
    if (role) {
        where.push('role = ?');
        params.push(role);
    }
    
    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    
    db.get('SELECT COUNT(*) as total FROM users ' + whereClause, params, (err, row) => {
        if (err) {
            console.error('❌ Erreur comptage users:', err);
            return res.json({ users: [], pagination: { totalPages: 0, currentPage: 1, total: 0 } });
        }
        
        const total = row ? row.total : 0;
        const totalPages = Math.ceil(total / limit);
        
        db.all('SELECT id, nom, prenom, email, role, compte_actif, created_at FROM users ' + whereClause + ' ORDER BY created_at DESC LIMIT ? OFFSET ?',
            [...params, limit, offset], (err, users) => {
                if (err) {
                    console.error('❌ Erreur récupération users:', err);
                    return res.json({ users: [], pagination: { totalPages: 0, currentPage: 1, total: 0 } });
                }
                res.json({
                    users: users || [],
                    pagination: { currentPage: page, totalPages: totalPages, total: total, limit: limit }
                });
            });
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
    const db = require('../config/database').getEtablissementDb();
    if (!db) {
        console.log('❌ Pas de base étabissement connectée');
        return res.json({
            max_users: 500, default_role: 'eleve', allow_registration: 1,
            maintenance_mode: 0, notifications_active: 1, messagerie_active: 1,
            chat_eleves_active: 1, paiements_online_active: 0
        });
    }
    
    db.get('SELECT * FROM settings WHERE id = 1', [], (err, row) => {
        if (err) {
            console.error('❌ Erreur getSettings:', err);
            return res.json({
                max_users: 500, default_role: 'eleve', allow_registration: 1,
                maintenance_mode: 0, notifications_active: 1, messagerie_active: 1,
                chat_eleves_active: 1, paiements_online_active: 0
            });
        }
        
        if (!row) {
            // Créer la ligne par défaut
            db.run(`INSERT INTO settings (id, max_users, default_role, allow_registration, maintenance_mode, notifications_active, messagerie_active, chat_eleves_active, paiements_online_active) 
                VALUES (1, 500, 'eleve', 1, 0, 1, 1, 1, 0)`, [], (err) => {
                if (err) console.error('❌ Erreur création settings:', err);
                res.json({
                    max_users: 500, default_role: 'eleve', allow_registration: 1,
                    maintenance_mode: 0, notifications_active: 1, messagerie_active: 1,
                    chat_eleves_active: 1, paiements_online_active: 0
                });
            });
            return;
        }
        
        console.log('✅ Settings chargés:', row);
        res.json(row);
    });
},
updateSettings: (req, res) => {
    const db = require('../config/database').getEtablissementDb();
    if (!db) return res.status(500).json({ error: 'Base de données non connectée' });
    
    const { max_users, default_role, maintenance_mode, allow_registration,
            notifications_active, messagerie_active, chat_eleves_active, paiements_online_active } = req.body;
    
    const maxUsers = Math.min(parseInt(max_users) || 500, 2500);
    
    console.log('📝 Mise à jour settings:', req.body);
    
    // Vérifier si la ligne existe
    db.get('SELECT id FROM settings WHERE id = 1', [], (err, row) => {
        if (err) {
            console.error('❌ Erreur vérification settings:', err);
            return res.status(500).json({ error: 'Erreur serveur' });
        }
        
        const sql = row ? 
            `UPDATE settings SET max_users=?, default_role=?, maintenance_mode=?, allow_registration=?, notifications_active=?, messagerie_active=?, chat_eleves_active=?, paiements_online_active=?, updated_at=CURRENT_TIMESTAMP WHERE id=1` :
            `INSERT INTO settings (id, max_users, default_role, maintenance_mode, allow_registration, notifications_active, messagerie_active, chat_eleves_active, paiements_online_active) VALUES (1,?,?,?,?,?,?,?,?)`;
        
        const params = [
            maxUsers,
            default_role || 'eleve',
            maintenance_mode || 0,
            allow_registration || 0,
            notifications_active || 0,
            messagerie_active || 0,
            chat_eleves_active || 0,
            paiements_online_active || 0
        ];
        
        db.run(sql, params, function(err) {
            if (err) {
                console.error('❌ Erreur updateSettings:', err);
                return res.status(500).json({ error: 'Erreur lors de la mise à jour: ' + err.message });
            }
            console.log('✅ Settings mis à jour, lignes affectées:', this.changes);
            
            // Vérifier que ça a bien été enregistré
            db.get('SELECT * FROM settings WHERE id = 1', [], (err, saved) => {
                console.log('🔍 Vérification après sauvegarde:', saved);
                res.json({ success: true, message: '✅ Paramètres enregistrés avec succès', data: saved });
            });
        });
    });
},
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