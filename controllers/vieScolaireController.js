const db = require('../config/database');

// Fonction helper pour obtenir la bonne base
function getDb() {
    return db.getEtablissementDb() || db.globalDb;
}

const vsController = {
    getStats: (req, res) => {
        const d = getDb();
        if (!d) return res.json({ absencesAujourdhui: 0, retardsAujourdhui: 0, profsPresents: 0, sanctionsMois: 0 });
        const today = new Date().toISOString().split('T')[0];
        d.get("SELECT COUNT(*) as total FROM absences WHERE date_absence = ? AND type = 'absence'", [today], (err, row) => {
            res.json({ absencesAujourdhui: row?.total || 0, retardsAujourdhui: 0, profsPresents: 0, sanctionsMois: 0 });
        });
    },

    getEleves: (req, res) => {
        const d = getDb();
        if (!d) return res.json([]);
        d.all("SELECT id, nom, prenom, email, telephone, classes_assignees FROM users WHERE role = 'eleve' AND compte_actif = 1 ORDER BY nom", [], (err, rows) => res.json(rows || []));
    },

    getAbsences: (req, res) => {
        const d = getDb();
        if (!d) return res.json({ absences: [], pagination: { currentPage: 1, totalPages: 0 } });
        d.all("SELECT a.*, u.nom, u.prenom FROM absences a LEFT JOIN users u ON a.eleve_id = u.id ORDER BY a.date_absence DESC LIMIT 50", [], (err, absences) => {
            res.json({ absences: absences || [], pagination: { currentPage: 1, totalPages: 1 } });
        });
    },

    createAbsence: (req, res) => {
        const d = getDb();
        if (!d) return res.status(500).json({ error: 'Base non disponible' });
        const { eleve_id, date_absence, type, motif, justifie, duree_minutes } = req.body;
        d.run('INSERT INTO absences (eleve_id, date_absence, type, motif, justifie, duree_minutes, signale_par) VALUES (?,?,?,?,?,?,?)',
            [eleve_id, date_absence, type, motif, justifie||0, duree_minutes||0, req.session.user.nom], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Absence enregistrée' });
            });
    },

    deleteAbsence: (req, res) => {
        const d = getDb();
        if (!d) return res.status(500).json({ error: 'Base non disponible' });
        d.run('DELETE FROM absences WHERE id = ?', [req.params.id], (err) => res.json({ success: true }));
    },

    getEDT: (req, res) => {
        const d = getDb();
        if (!d) return res.json([]);
        const classe = req.query.classe || '';
        const jour = req.query.jour || '';
        let where = [], params = [];
        if (classe) { where.push('e.classe = ?'); params.push(classe); }
        if (jour) { where.push('e.jour = ?'); params.push(jour); }
        const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
        d.all(`SELECT e.*, u.nom as prof_nom, u.prenom as prof_prenom FROM emploi_du_temps e LEFT JOIN users u ON e.prof_id = u.id ${wc} ORDER BY CASE e.jour WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2 WHEN 'Mercredi' THEN 3 WHEN 'Jeudi' THEN 4 WHEN 'Vendredi' THEN 5 WHEN 'Samedi' THEN 6 END, e.heure_debut`, params, (err, rows) => res.json(rows || []));
    },

    createEDT: (req, res) => {
        const d = getDb();
        if (!d) return res.status(500).json({ error: 'Base non disponible' });
        const { classe, jour, heure_debut, heure_fin, matiere, prof_id, salle } = req.body;
        d.run('INSERT INTO emploi_du_temps (classe, jour, heure_debut, heure_fin, matiere, prof_id, salle) VALUES (?,?,?,?,?,?,?)',
            [classe, jour, heure_debut, heure_fin, matiere, prof_id||null, salle||''], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Cours ajouté' });
            });
    },

    deleteEDT: (req, res) => {
        const d = getDb();
        if (!d) return res.status(500).json({ error: 'Base non disponible' });
        d.run('DELETE FROM emploi_du_temps WHERE id = ?', [req.params.id], (err) => res.json({ success: true }));
    },

    getClasses: (req, res) => {
        const d = getDb();
        if (!d) return res.json([]);
        d.all("SELECT DISTINCT classe FROM emploi_du_temps ORDER BY classe", [], (err, rows) => res.json(rows || []));
    },

    getPointages: (req, res) => {
        const d = getDb();
        if (!d) return res.json({ pointages: [], nonPointes: [] });
        const today = req.query.date || new Date().toISOString().split('T')[0];
        d.all(`SELECT p.*, u.nom, u.prenom FROM pointage p LEFT JOIN users u ON p.prof_id = u.id WHERE p.date_pointage = ?`, [today], (err, pointages) => {
            d.all(`SELECT id, nom, prenom FROM users WHERE role = 'prof' AND compte_actif = 1 AND id NOT IN (SELECT prof_id FROM pointage WHERE date_pointage = ?)`, [today], (err, nonPointes) => {
                res.json({ pointages: pointages || [], nonPointes: nonPointes || [] });
            });
        });
    },

    pointerArrivee: (req, res) => {
        const d = getDb();
        if (!d) return res.status(500).json({ error: 'Base non disponible' });
        const { prof_id, heure_arrivee, statut, type_contrat, date } = req.body;
        const datePointage = date || new Date().toISOString().split('T')[0];
        d.get('SELECT id FROM pointage WHERE prof_id = ? AND date_pointage = ?', [prof_id, datePointage], (err, row) => {
            if (row) {
                d.run('UPDATE pointage SET heure_arrivee = ?, statut = ?, type_contrat = ? WHERE id = ?', [heure_arrivee||null, statut||'absent', type_contrat||'plein_temps', row.id], (err) => res.json({ success: true }));
            } else {
                d.run('INSERT INTO pointage (prof_id, date_pointage, heure_arrivee, statut, type_contrat) VALUES (?,?,?,?,?)', [prof_id, datePointage, heure_arrivee||null, statut||'absent', type_contrat||'plein_temps'], (err) => res.json({ success: true }));
            }
        });
    },

    pointerDepart: (req, res) => {
        const d = getDb();
        if (!d) return res.status(500).json({ error: 'Base non disponible' });
        const { prof_id, heure_depart, date } = req.body;
        const datePointage = date || new Date().toISOString().split('T')[0];
        d.run('UPDATE pointage SET heure_depart = ?, statut = ? WHERE prof_id = ? AND date_pointage = ?', [heure_depart||null, heure_depart?'sortie':'present', prof_id, datePointage], (err) => res.json({ success: true }));
    },

    getCumulPointages: (req, res) => {
        const d = getDb();
        if (!d) return res.json([]);
        const mois = req.query.mois || new Date().toISOString().substring(0, 7);
        d.all(`SELECT p.prof_id, u.nom, u.prenom, COUNT(*) as jours_pointes FROM pointage p LEFT JOIN users u ON p.prof_id = u.id WHERE strftime('%Y-%m', p.date_pointage) = ? GROUP BY p.prof_id`, [mois], (err, rows) => res.json(rows || []));
    },

    getProfs: (req, res) => {
        const d = getDb();
        if (!d) return res.json([]);
        d.all("SELECT id, nom, prenom FROM users WHERE role = 'prof' AND compte_actif = 1", [], (err, rows) => res.json(rows || []));
    },

    getSanctions: (req, res) => {
        const d = getDb();
        if (!d) return res.json([]);
        d.all('SELECT s.*, u.nom, u.prenom FROM sanctions s LEFT JOIN users u ON s.eleve_id = u.id ORDER BY s.date_sanction DESC', [], (err, rows) => res.json(rows || []));
    },

    createSanction: (req, res) => {
        const d = getDb();
        if (!d) return res.status(500).json({ error: 'Base non disponible' });
        const { eleve_id, type_sanction, motif, gravite, duree, notifie_parent } = req.body;
        d.run('INSERT INTO sanctions (eleve_id, type_sanction, motif, gravite, date_sanction, duree, notifie_parent) VALUES (?,?,?,?,date(?),?,?)',
            [eleve_id, type_sanction, motif, gravite, duree||null, notifie_parent||0], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Sanction enregistrée' });
            });
    },

    deleteSanction: (req, res) => {
        const d = getDb();
        if (!d) return res.status(500).json({ error: 'Base non disponible' });
        d.run('DELETE FROM sanctions WHERE id = ?', [req.params.id], (err) => res.json({ success: true }));
    },

    getMessages: (req, res) => {
        const d = getDb();
        if (!d) return res.json([]);
        d.all(`SELECT m.*, u.nom as exp_nom, u.prenom as exp_prenom FROM messages m LEFT JOIN users u ON m.expediteur_id = u.id WHERE m.destinataire_id = ? OR m.destinataire_role = 'all' OR m.destinataire_role = 'vie_scolaire' ORDER BY m.created_at DESC LIMIT 30`,
            [req.session.user.id], (err, messages) => res.json(messages || []));
    },

    sendMessage: (req, res) => {
        const d = getDb();
        if (!d) return res.status(500).json({ error: 'Base non disponible' });
        const { destinataire_id, destinataire_role, sujet, contenu } = req.body;
        if (!sujet || !contenu) return res.status(400).json({ error: 'Sujet et contenu requis' });
        const fichier = req.file ? req.file.filename : null;
        d.run('INSERT INTO messages (expediteur_id, destinataire_id, destinataire_role, sujet, contenu, fichier) VALUES (?,?,?,?,?,?)',
            [req.session.user.id, destinataire_id||null, destinataire_role||'all', sujet, contenu, fichier], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Message envoyé' });
            });
    },

    getNotifications: (req, res) => {
        const d = getDb();
        if (!d) return res.json([]);
        d.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [req.session.user.id], (err, rows) => res.json(rows || []));
    },

    markNotificationRead: (req, res) => {
        const d = getDb();
        if (!d) return res.json({ success: false });
        d.run('UPDATE notifications SET lu = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id], (err) => res.json({ success: true }));
    },

    viderNotificationsGeneral: (req, res) => {
        const d = getDb();
        if (!d) return res.json({ success: false });
        d.run('DELETE FROM notifications WHERE user_id = ?', [req.session.user.id], (err) => res.json({ success: true, message: 'Notifications vidées' }));
    },

    getUsersByRole: (req, res) => {
        const d = getDb();
        if (!d) return res.json([]);
        const role = req.query.role || '';
        const search = req.query.search || '';
        let where = ['compte_actif = 1'], params = [];
        if (role) { where.push('role = ?'); params.push(role); }
        if (search) { where.push('(nom LIKE ? OR prenom LIKE ?)'); params.push('%' + search + '%', '%' + search + '%'); }
        d.all(`SELECT id, nom, prenom, email, telephone, role FROM users WHERE ${where.join(' AND ')} ORDER BY nom`, params, (err, rows) => res.json(rows || []));
    },

    updateUserTelephone: (req, res) => {
        const d = getDb();
        if (!d) return res.status(500).json({ error: 'Base non disponible' });
        d.run('UPDATE users SET telephone = ? WHERE id = ?', [req.body.telephone, req.params.id], (err) => res.json({ success: true }));
    },

    getAvertissements: (req, res) => {
        const d = getDb();
        if (!d) return res.json([]);
        d.all('SELECT * FROM avertissements', [], (err, rows) => res.json(rows || []));
    },
};

module.exports = vsController;