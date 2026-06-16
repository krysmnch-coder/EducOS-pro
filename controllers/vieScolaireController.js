const db = require('../config/database');

const vsController = {
    getStats: (req, res) => {
        const today = new Date().toISOString().split('T')[0];
        const debutMois = today.substring(0, 7) + '-01';
        const stats = {};
        db.get("SELECT COUNT(*) as total FROM absences WHERE date_absence = ? AND type = 'absence'", [today], (err, row) => {
            stats.absencesAujourdhui = row?.total || 0;
            db.get("SELECT COUNT(*) as total FROM absences WHERE date_absence = ? AND type = 'retard'", [today], (err, row) => {
                stats.retardsAujourdhui = row?.total || 0;
                db.get("SELECT COUNT(*) as total FROM pointage WHERE date_pointage = ? AND (statut = 'present' OR statut = 'sortie')", [today], (err, row) => {
                    stats.profsPresents = row?.total || 0;
                    db.get("SELECT COUNT(*) as total FROM sanctions WHERE date_sanction >= ?", [debutMois], (err, row) => {
                        stats.sanctionsMois = row?.total || 0;
                        db.get("SELECT COUNT(*) as total FROM notifications WHERE user_id = ? AND lu = 0", [req.session.user.id], (err, row) => {
                            stats.messagesNonLus = row?.total || 0;
                            res.json(stats);
                        });
                    });
                });
            });
        });
    },

    getAbsences: (req, res) => {
        const page = parseInt(req.query.page) || 1, limit = 15, offset = (page - 1) * limit;
        const type = req.query.type || '', search = req.query.search || '';
        let where = [], params = [];
        if (type) { where.push('a.type = ?'); params.push(type); }
        if (search) { where.push('(u.nom LIKE ? OR u.prenom LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
        const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
        db.get(`SELECT COUNT(*) as total FROM absences a LEFT JOIN users u ON a.eleve_id = u.id ${wc}`, params, (err, row) => {
            db.all(`SELECT a.*, u.nom, u.prenom FROM absences a LEFT JOIN users u ON a.eleve_id = u.id ${wc} ORDER BY a.date_absence DESC LIMIT ? OFFSET ?`, [...params, limit, offset], (err, absences) => {
                res.json({ absences, pagination: { currentPage: page, totalPages: Math.ceil((row?.total||0)/limit), total: row?.total||0 } });
            });
        });
    },
    createAbsence: (req, res) => {
        const { eleve_id, date_absence, type, motif, justifie, duree_minutes } = req.body;
        db.run('INSERT INTO absences (eleve_id, date_absence, type, motif, justifie, duree_minutes, signale_par) VALUES (?,?,?,?,?,?,?)',
            [eleve_id, date_absence, type, motif, justifie||0, duree_minutes||0, req.session.user.nom], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Enregistré' });
            });
    },
    deleteAbsence: (req, res) => {
        db.run('DELETE FROM absences WHERE id=?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Supprimé' });
        });
    },

    getEDT: (req, res) => {
        const classe = req.query.classe || '', jour = req.query.jour || '';
        let where = [], params = [];
        if (classe) { where.push('e.classe = ?'); params.push(classe); }
        if (jour) { where.push('e.jour = ?'); params.push(jour); }
        const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
        db.all(`SELECT e.*, u.nom as prof_nom, u.prenom as prof_prenom, u.civilite FROM emploi_du_temps e LEFT JOIN users u ON e.prof_id = u.id ${wc} ORDER BY CASE e.jour WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2 WHEN 'Mercredi' THEN 3 WHEN 'Jeudi' THEN 4 WHEN 'Vendredi' THEN 5 WHEN 'Samedi' THEN 6 END, e.heure_debut`, params, (err, rows) => res.json(rows || []));
    },
    createEDT: (req, res) => {
        const { classe, jour, heure_debut, heure_fin, matiere, prof_id, salle } = req.body;
        db.run('INSERT INTO emploi_du_temps (classe, jour, heure_debut, heure_fin, matiere, prof_id, salle) VALUES (?,?,?,?,?,?,?)',
            [classe, jour, heure_debut, heure_fin, matiere, prof_id||null, salle||''], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Cours ajouté' });
            });
    },
    deleteEDT: (req, res) => {
        db.run('DELETE FROM emploi_du_temps WHERE id=?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Supprimé' });
        });
    },
    getClasses: (req, res) => db.all("SELECT DISTINCT classe FROM emploi_du_temps ORDER BY classe", [], (err, rows) => res.json(rows || [])),

    getPointages: (req, res) => {
        const today = req.query.date || new Date().toISOString().split('T')[0];
        db.all(`SELECT p.*, u.nom, u.prenom FROM pointage p LEFT JOIN users u ON p.prof_id = u.id WHERE p.date_pointage = ? ORDER BY u.nom`, [today], (err, pointages) => {
            db.all(`SELECT id, nom, prenom FROM users WHERE role = 'prof' AND compte_actif = 1 AND id NOT IN (SELECT prof_id FROM pointage WHERE date_pointage = ?) ORDER BY nom`, [today], (err, nonPointes) => {
                res.json({ pointages: pointages || [], nonPointes: nonPointes || [] });
            });
        });
    },
    pointerArrivee: (req, res) => {
        const { prof_id, heure_arrivee, statut, type_contrat, date, minutes_retard, commentaire } = req.body;
        const datePointage = date || new Date().toISOString().split('T')[0];
        db.get('SELECT * FROM pointage WHERE prof_id = ? AND date_pointage = ?', [prof_id, datePointage], (err, row) => {
            const contrat = type_contrat || (row ? row.type_contrat : 'plein_temps');
            const finalMinutesRetard = minutes_retard !== undefined ? parseInt(minutes_retard) : (row ? (row.minutes_retard || 0) : 0);
            const finalCommentaire = commentaire !== undefined ? commentaire : (row ? (row.commentaire || '') : '');
            if (row) {
                db.run('UPDATE pointage SET heure_arrivee=?, statut=?, type_contrat=?, minutes_retard=?, commentaire=? WHERE id=?',
                    [heure_arrivee !== undefined ? heure_arrivee : row.heure_arrivee, statut || row.statut, contrat, finalMinutesRetard, finalCommentaire, row.id], (err) => {
                        if (err) return res.status(500).json({ error: err.message });
                        vsController.checkAvertissement(prof_id);
                        res.json({ success: true, message: 'Mis à jour' });
                    });
            } else {
                db.run('INSERT INTO pointage (prof_id, date_pointage, heure_arrivee, statut, type_contrat, minutes_retard, commentaire) VALUES (?,?,?,?,?,?,?)',
                    [prof_id, datePointage, heure_arrivee||null, statut||'absent', contrat, finalMinutesRetard, finalCommentaire], (err) => {
                        if (err) return res.status(500).json({ error: err.message });
                        vsController.checkAvertissement(prof_id);
                        res.json({ success: true, message: 'Créé' });
                    });
            }
        });
    },
    pointerDepart: (req, res) => {
        const { prof_id, heure_depart, date } = req.body;
        const datePointage = date || new Date().toISOString().split('T')[0];
        db.run('UPDATE pointage SET heure_depart=?, statut=? WHERE prof_id=? AND date_pointage=?',
            [heure_depart||null, heure_depart?'sortie':'present', prof_id, datePointage], (err) => {
                if (err) return res.status(500).json({ error: 'Erreur' });
                res.json({ success: true, message: 'Départ pointé' });
            });
    },
    checkAvertissement: (profId) => {
        const mois = new Date().toISOString().substring(0, 7);
        db.get('SELECT SUM(COALESCE(minutes_retard, 0)) as total FROM pointage WHERE prof_id = ? AND strftime("%Y-%m", date_pointage) = ?', [profId, mois], (err, row) => {
            if (err) return;
            const totalMinutes = row ? (row.total || 0) : 0;
            db.get('SELECT * FROM avertissements WHERE prof_id = ? AND mois = ?', [profId, mois], (err, avert) => {
                if (totalMinutes > 45) {
                    const message = `Avertissement : ${totalMinutes} minutes de retard cumulées ce mois (seuil : 45 min)`;
                    if (avert) {
                        db.run('UPDATE avertissements SET total_minutes_retard = ?, avertissement_active = 1, message_avertissement = ? WHERE id = ?', [totalMinutes, message, avert.id]);
                    } else {
                        db.run('INSERT INTO avertissements (prof_id, mois, total_minutes_retard, avertissement_active, message_avertissement) VALUES (?, ?, ?, 1, ?)', [profId, mois, totalMinutes, message]);
                    }
                } else if (avert) {
                    db.run('UPDATE avertissements SET total_minutes_retard = ?, avertissement_active = 0, message_avertissement = NULL WHERE id = ?', [totalMinutes, avert.id]);
                }
            });
        });
    },
    getAvertissements: (req, res) => {
        const mois = req.query.mois || new Date().toISOString().substring(0, 7);
        db.all('SELECT a.*, u.nom, u.prenom FROM avertissements a LEFT JOIN users u ON a.prof_id = u.id WHERE a.mois = ? AND a.avertissement_active = 1 ORDER BY a.total_minutes_retard DESC', [mois], (err, rows) => res.json(rows || []));
    },
    getCumulPointages: (req, res) => {
        const mois = req.query.mois || new Date().toISOString().substring(0, 7);
        db.all(`SELECT p.prof_id, u.nom, u.prenom, p.type_contrat, COUNT(*) as jours_pointes, SUM(CASE WHEN p.statut IN ('present','sortie') THEN 1 ELSE 0 END) as jours_presents, SUM(CASE WHEN p.statut = 'retard' THEN 1 ELSE 0 END) as jours_retard, SUM(CASE WHEN p.statut = 'absent' THEN 1 ELSE 0 END) as jours_absents, SUM(COALESCE(p.minutes_retard, 0)) as total_minutes_retard, SUM(CASE WHEN p.heure_arrivee IS NOT NULL AND p.heure_depart IS NOT NULL THEN ROUND((JULIANDAY('2000-01-01 '||p.heure_depart) - JULIANDAY('2000-01-01 '||p.heure_arrivee)) * 24, 2) ELSE 0 END) as total_heures FROM pointage p LEFT JOIN users u ON p.prof_id = u.id WHERE strftime('%Y-%m', p.date_pointage) = ? GROUP BY p.prof_id ORDER BY u.nom`, [mois], (err, rows) => {
            db.all('SELECT * FROM avertissements WHERE mois = ?', [mois], (err, avertissements) => {
                const avertissementsMap = {};
                if (avertissements) avertissements.forEach(a => { avertissementsMap[a.prof_id] = a; });
                const resultats = rows.map(r => ({
                    ...r,
                    avertissement: avertissementsMap[r.prof_id] ? avertissementsMap[r.prof_id].avertissement_active : 0,
                    message_avertissement: avertissementsMap[r.prof_id] ? avertissementsMap[r.prof_id].message_avertissement : null
                }));
                res.json(resultats);
            });
        });
    },
    getProfs: (req, res) => db.all("SELECT id, nom, prenom, civilite FROM users WHERE role = 'prof' AND compte_actif = 1 ORDER BY nom", [], (err, rows) => res.json(rows || [])),
    getEleves: (req, res) => db.all("SELECT id, nom, prenom, email, telephone FROM users WHERE role = 'eleve' AND compte_actif = 1 ORDER BY nom", [], (err, rows) => res.json(rows || [])),

    getSanctions: (req, res) => {
        const page = parseInt(req.query.page) || 1, limit = 15, offset = (page - 1) * limit;
        db.get('SELECT COUNT(*) as total FROM sanctions', [], (err, row) => {
            db.all('SELECT s.*, u.nom, u.prenom FROM sanctions s LEFT JOIN users u ON s.eleve_id = u.id ORDER BY s.date_sanction DESC LIMIT ? OFFSET ?', [limit, offset], (err, sanctions) => {
                res.json({ sanctions, pagination: { currentPage: page, totalPages: Math.ceil((row?.total||0)/limit) } });
            });
        });
    },
    createSanction: (req, res) => {
        const { eleve_id, type_sanction, motif, gravite, duree, notifie_parent } = req.body;
        db.run('INSERT INTO sanctions (eleve_id, type_sanction, motif, gravite, date_sanction, duree, notifie_parent) VALUES (?,?,?,?,date(?),?,?)',
            [eleve_id, type_sanction, motif, gravite, new Date().toISOString().split('T')[0], duree||null, notifie_parent||0], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Sanction enregistrée' });
            });
    },
    deleteSanction: (req, res) => {
        db.run('DELETE FROM sanctions WHERE id=?', [req.params.id], (err) => {
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
                const messageId = this.lastID;
                if (destinataire_id) db.run("INSERT INTO notifications (user_id, type, titre, message, message_id) VALUES (?, 'message', ?, ?, ?)", [destinataire_id, sujet, contenu.substring(0, 100), messageId]);
                res.json({ success: true, message: 'Message envoyé', fichier: fichier });
            });
    },
    getMessageDetail: (req, res) => {
        db.get('SELECT m.*, u.nom as exp_nom, u.prenom as exp_prenom FROM messages m LEFT JOIN users u ON m.expediteur_id = u.id WHERE m.id = ?', [req.params.id], (err, msg) => {
            if (err || !msg) return res.status(404).json({ error: 'Message non trouvé' });
            res.json(msg);
        });
    },

    getNotifications: (req, res) => db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [req.session.user.id], (err, rows) => res.json(rows || [])),
    markNotificationRead: (req, res) => {
        db.run('UPDATE notifications SET lu = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id], (err) => res.json({ success: true }));
    },
    viderNotificationsGeneral: (req, res) => {
        db.run('DELETE FROM notifications WHERE user_id = ?', [req.session.user.id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Notifications vidées' });
        });
    },

    getUsersByRole: (req, res) => {
        const role = req.query.role || '', search = req.query.search || '';
        let where = ['compte_actif = 1'], params = [];
        if (role) { where.push('role = ?'); params.push(role); }
        if (search) { where.push('(nom LIKE ? OR prenom LIKE ? OR email LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
        db.all(`SELECT id, nom, prenom, email, telephone, role FROM users WHERE ${where.join(' AND ')} ORDER BY nom`, params, (err, rows) => res.json(rows || []));
    },
    updateUserTelephone: (req, res) => {
        db.run('UPDATE users SET telephone = ? WHERE id = ?', [req.body.telephone, req.params.id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Téléphone mis à jour' });
        });
    }
};

module.exports = vsController;