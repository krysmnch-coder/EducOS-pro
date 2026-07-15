const databaseModule = require('../config/database');

function getDb() {
    return databaseModule.getEtablissementDb() || databaseModule.globalDb;
}

const vsController = {
    getStats: (req, res) => {
        const db = getDb();
        if (!db) return res.json({ absencesAujourdhui: 0, retardsAujourdhui: 0, profsPresents: 0, sanctionsMois: 0 });
        const today = new Date().toISOString().split('T')[0];
        const debutMois = today.substring(0, 7) + '-01';
        db.get("SELECT COUNT(*) as total FROM absences WHERE date_absence = ? AND type = 'absence'", [today], (err, row) => {
            db.get("SELECT COUNT(*) as total FROM absences WHERE date_absence = ? AND type = 'retard'", [today], (err, row2) => {
                db.get("SELECT COUNT(*) as total FROM pointage WHERE date_pointage = ? AND statut IN ('present','sortie')", [today], (err, row3) => {
                    db.get("SELECT COUNT(*) as total FROM sanctions WHERE date_sanction >= ?", [debutMois], (err, row4) => {
                        res.json({
                            absencesAujourdhui: row?.total || 0,
                            retardsAujourdhui: row2?.total || 0,
                            profsPresents: row3?.total || 0,
                            sanctionsMois: row4?.total || 0
                        });
                    });
                });
            });
        });
    },

    getEleves: (req, res) => {
        const db = getDb();
        if (!db) return res.json([]);
        const search = req.query.search || '';
        const classe = req.query.classe || '';
        let where = ["role = 'eleve'", "compte_actif = 1"];
        let params = [];
        if (search) { where.push('(nom LIKE ? OR prenom LIKE ?)'); params.push('%' + search + '%', '%' + search + '%'); }
        if (classe) { where.push('classes_assignees LIKE ?'); params.push('%' + classe + '%'); }
        db.all(`SELECT id, nom, prenom, email, telephone, classes_assignees FROM users WHERE ${where.join(' AND ')} ORDER BY nom`, params, (err, rows) => res.json(rows || []));
    },

    getAbsences: (req, res) => {
        const db = getDb();
        if (!db) return res.json({ absences: [], pagination: { currentPage: 1, totalPages: 0 } });
        const page = parseInt(req.query.page) || 1;
        const limit = 15;
        const offset = (page - 1) * limit;
        const type = req.query.type || '';
        const search = req.query.search || '';
        let where = [];
        let params = [];
        if (type) { where.push('a.type = ?'); params.push(type); }
        if (search) { where.push('(u.nom LIKE ? OR u.prenom LIKE ?)'); params.push('%' + search + '%', '%' + search + '%'); }
        const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
        db.get(`SELECT COUNT(*) as total FROM absences a LEFT JOIN users u ON a.eleve_id = u.id ${wc}`, params, (err, row) => {
            db.all(`SELECT a.*, u.nom, u.prenom FROM absences a LEFT JOIN users u ON a.eleve_id = u.id ${wc} ORDER BY a.date_absence DESC LIMIT ? OFFSET ?`, [...params, limit, offset], (err, absences) => {
                res.json({ absences: absences || [], pagination: { currentPage: page, totalPages: Math.ceil((row?.total || 0) / limit) } });
            });
        });
    },

    createAbsence: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        const { eleve_id, date_absence, type, motif, justifie, duree_minutes } = req.body;
        db.run('INSERT INTO absences (eleve_id, date_absence, type, motif, justifie, duree_minutes, signale_par) VALUES (?,?,?,?,?,?,?)',
            [eleve_id, date_absence, type, motif, justifie || 0, duree_minutes || 0, req.session.user.nom], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Absence enregistrée' });
            });
    },

    deleteAbsence: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        db.run('DELETE FROM absences WHERE id = ?', [req.params.id], (err) => res.json({ success: true }));
    },

    getEDT: (req, res) => {
        const db = getDb();
        if (!db) return res.json([]);
        const classe = req.query.classe || '';
        const jour = req.query.jour || '';
        let where = [], params = [];
        if (classe) { where.push('e.classe = ?'); params.push(classe); }
        if (jour) { where.push('e.jour = ?'); params.push(jour); }
        const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
        db.all(`SELECT e.*, u.nom as prof_nom, u.prenom as prof_prenom FROM emploi_du_temps e LEFT JOIN users u ON e.prof_id = u.id ${wc} ORDER BY CASE e.jour WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2 WHEN 'Mercredi' THEN 3 WHEN 'Jeudi' THEN 4 WHEN 'Vendredi' THEN 5 WHEN 'Samedi' THEN 6 END, e.heure_debut`, params, (err, rows) => res.json(rows || []));
    },

    createEDT: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        const { classe, jour, heure_debut, heure_fin, matiere, prof_id, salle } = req.body;
        // Si on reçoit plusieurs jours (tableau), on crée pour chaque jour
        const jours = Array.isArray(jour) ? jour : [jour];
        let completed = 0;
        let errors = 0;
        jours.forEach(j => {
            if (!j) { completed++; return; }
            db.run('INSERT INTO emploi_du_temps (classe, jour, heure_debut, heure_fin, matiere, prof_id, salle) VALUES (?,?,?,?,?,?,?)',
                [classe, j, heure_debut, heure_fin, matiere, prof_id || null, salle || ''], function (err) {
                    if (err) errors++;
                    completed++;
                    if (completed === jours.length) {
                        res.json({ success: errors === 0, message: errors === 0 ? 'Cours ajouté(s)' : errors + ' erreur(s)' });
                    }
                });
        });
    },

    createEDTBulk: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        const { classe, jours, heure_debut, heure_fin, matiere, prof_id, salle } = req.body;
        // jours = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']
        if (!classe || !jours || !jours.length) return res.status(400).json({ error: 'Classe et jours requis' });
        let completed = 0;
        let errors = 0;
        jours.forEach(j => {
            db.run('INSERT INTO emploi_du_temps (classe, jour, heure_debut, heure_fin, matiere, prof_id, salle) VALUES (?,?,?,?,?,?,?)',
                [classe, j, heure_debut, heure_fin, matiere, prof_id || null, salle || ''], function (err) {
                    if (err) errors++;
                    completed++;
                    if (completed === jours.length) {
                        res.json({ success: errors === 0, message: errors === 0 ? `${completed} cours ajoutés pour la classe ${classe}` : `${errors} erreur(s)` });
                    }
                });
        });
    },

    deleteEDT: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        db.run('DELETE FROM emploi_du_temps WHERE id = ?', [req.params.id], (err) => res.json({ success: true }));
    },

    getClasses: (req, res) => {
        const db = getDb();
        if (!db) return res.json([]);
        db.all("SELECT DISTINCT classe FROM emploi_du_temps ORDER BY classe", [], (err, rows) => res.json(rows || []));
    },

    // POINTAGE
    getPointages: (req, res) => {
        const db = getDb();
        if (!db) return res.json({ pointages: [], nonPointes: [] });
        const today = req.query.date || new Date().toISOString().split('T')[0];
        db.all(`SELECT p.*, u.nom, u.prenom FROM pointage p LEFT JOIN users u ON p.prof_id = u.id WHERE p.date_pointage = ?`, [today], (err, pointages) => {
            db.all(`SELECT id, nom, prenom FROM users WHERE role = 'prof' AND compte_actif = 1 AND id NOT IN (SELECT prof_id FROM pointage WHERE date_pointage = ?)`, [today], (err, nonPointes) => {
                res.json({ pointages: pointages || [], nonPointes: nonPointes || [] });
            });
        });
    },

    pointerArrivee: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        const { prof_id, heure_arrivee, statut, type_contrat, date } = req.body;
        const datePointage = date || new Date().toISOString().split('T')[0];
        db.get('SELECT id FROM pointage WHERE prof_id = ? AND date_pointage = ?', [prof_id, datePointage], (err, row) => {
            if (row) {
                db.run('UPDATE pointage SET heure_arrivee = ?, statut = ?, type_contrat = ? WHERE id = ?', [heure_arrivee || null, statut || row.statut, type_contrat || row.type_contrat, row.id], (err) => res.json({ success: true }));
            } else {
                db.run('INSERT INTO pointage (prof_id, date_pointage, heure_arrivee, statut, type_contrat) VALUES (?,?,?,?,?)', [prof_id, datePointage, heure_arrivee || null, statut || 'absent', type_contrat || 'plein_temps'], (err) => res.json({ success: true }));
            }
        });
    },

    pointerDepart: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        const { prof_id, heure_depart, date } = req.body;
        const datePointage = date || new Date().toISOString().split('T')[0];
        db.run('UPDATE pointage SET heure_depart = ?, statut = ? WHERE prof_id = ? AND date_pointage = ?', [heure_depart || null, heure_depart ? 'sortie' : 'present', prof_id, datePointage], (err) => res.json({ success: true }));
    },

    getCumulPointages: (req, res) => {
        const db = getDb();
        if (!db) return res.json([]);
        const mois = req.query.mois || new Date().toISOString().substring(0, 7);
        db.all(`SELECT p.prof_id, u.nom, u.prenom, p.type_contrat, 
            COUNT(*) as jours_pointes,
            SUM(CASE WHEN p.statut IN ('present','sortie') THEN 1 ELSE 0 END) as jours_presents,
            SUM(CASE WHEN p.statut = 'retard' THEN 1 ELSE 0 END) as jours_retard,
            SUM(CASE WHEN p.statut = 'absent' THEN 1 ELSE 0 END) as jours_absents,
            SUM(COALESCE(p.minutes_retard, 0)) as total_minutes_retard,
            SUM(CASE WHEN p.heure_arrivee IS NOT NULL AND p.heure_depart IS NOT NULL THEN 
                ROUND((JULIANDAY('2000-01-01 '||p.heure_depart) - JULIANDAY('2000-01-01 '||p.heure_arrivee)) * 24, 2) 
                ELSE 0 END) as total_heures
            FROM pointage p LEFT JOIN users u ON p.prof_id = u.id 
            WHERE strftime('%Y-%m', p.date_pointage) = ? 
            GROUP BY p.prof_id ORDER BY u.nom`, [mois], (err, rows) => res.json(rows || []));
    },

    getProfs: (req, res) => {
        const db = getDb();
        if (!db) return res.json([]);
        db.all("SELECT id, nom, prenom FROM users WHERE role = 'prof' AND compte_actif = 1", [], (err, rows) => res.json(rows || []));
    },

    // SANCTIONS
    getSanctions: (req, res) => {
        const db = getDb();
        if (!db) return res.json([]);
        const search = req.query.search || '';
        const classe = req.query.classe || '';
        let where = [];
        let params = [];
        if (search) { where.push('(u.nom LIKE ? OR u.prenom LIKE ?)'); params.push('%' + search + '%', '%' + search + '%'); }
        if (classe) { where.push('u.classes_assignees LIKE ?'); params.push('%' + classe + '%'); }
        const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
        db.all(`SELECT s.*, u.nom, u.prenom, u.classes_assignees FROM sanctions s LEFT JOIN users u ON s.eleve_id = u.id ${wc} ORDER BY s.date_sanction DESC`, params, (err, rows) => res.json(rows || []));
    },

    createSanction: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        const { eleve_id, type_sanction, motif, gravite, date_sanction, duree, notifie_parent } = req.body;
        db.run('INSERT INTO sanctions (eleve_id, type_sanction, motif, gravite, date_sanction, duree, notifie_parent) VALUES (?,?,?,?,?,?,?)',
            [eleve_id, type_sanction, motif, gravite, date_sanction || new Date().toISOString().split('T')[0], duree || null, notifie_parent || 0], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Sanction enregistrée' });
            });
    },

    deleteSanction: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        db.run('DELETE FROM sanctions WHERE id = ?', [req.params.id], (err) => res.json({ success: true }));
    },

    getMessages: (req, res) => {
        const db = getDb();
        if (!db) return res.json([]);
        db.all(`SELECT m.*, u.nom as exp_nom, u.prenom as exp_prenom FROM messages m LEFT JOIN users u ON m.expediteur_id = u.id WHERE m.destinataire_id = ? OR m.destinataire_role = 'all' OR m.destinataire_role = 'vie_scolaire' ORDER BY m.created_at DESC LIMIT 30`,
            [req.session.user.id], (err, messages) => res.json(messages || []));
    },

    sendMessage: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        const { destinataire_id, destinataire_role, sujet, contenu } = req.body;
        if (!sujet || !contenu) return res.status(400).json({ error: 'Sujet et contenu requis' });
        const fichier = req.file ? req.file.filename : null;
        db.run('INSERT INTO messages (expediteur_id, destinataire_id, destinataire_role, sujet, contenu, fichier) VALUES (?,?,?,?,?,?)',
            [req.session.user.id, destinataire_id || null, destinataire_role || 'all', sujet, contenu, fichier], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Message envoyé' });
            });
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
    },

    getUsersByRole: (req, res) => {
        const db = getDb();
        if (!db) return res.json([]);
        const role = req.query.role || '';
        const search = req.query.search || '';
        let where = ['compte_actif = 1'], params = [];
        if (role) { where.push('role = ?'); params.push(role); }
        if (search) { where.push('(nom LIKE ? OR prenom LIKE ?)'); params.push('%' + search + '%', '%' + search + '%'); }
        db.all(`SELECT id, nom, prenom, email, telephone, role FROM users WHERE ${where.join(' AND ')} ORDER BY nom`, params, (err, rows) => res.json(rows || []));
    },

    updateUserTelephone: (req, res) => {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Base non disponible' });
        db.run('UPDATE users SET telephone = ? WHERE id = ?', [req.body.telephone, req.params.id], (err) => res.json({ success: true }));
    },

    getAvertissements: (req, res) => {
        const db = getDb();
        if (!db) return res.json([]);
        db.all('SELECT * FROM avertissements', [], (err, rows) => res.json(rows || []));
    },
};

module.exports = vsController;