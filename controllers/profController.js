const databaseModule = require('../config/database');

function getDb() {
    return databaseModule.getEtablissementDb() || databaseModule.globalDb;
}

const profController = {
    getStats: (req, res) => {
        const profId = req.session.user.id;
        const stats = {};
        const db = getDb();
        db.get("SELECT COUNT(DISTINCT classe) as total FROM emploi_du_temps WHERE prof_id = ?", [profId], (err, row) => {
            stats.totalClasses = row?.total || 0;
            db.get("SELECT COUNT(*) as total FROM ressources WHERE prof_id = ?", [profId], (err, row) => {
                stats.totalRessources = row?.total || 0;
                db.get("SELECT COUNT(*) as total FROM devoirs_rendus dr JOIN ressources r ON dr.ressource_id = r.id WHERE r.prof_id = ?", [profId], (err, row) => {
                    stats.devoirsRendus = row?.total || 0;
                    db.get("SELECT COUNT(*) as total FROM notifications WHERE user_id = ? AND lu = 0", [profId], (err, row) => {
                        stats.notificationsNonLues = row?.total || 0;
                        res.json(stats);
                    });
                });
            });
        });
    },

    getChartData: (req, res) => {
        const profId = req.session.user.id;
        const matiere = req.query.matiere || '';
        const db = getDb();
        db.all("SELECT DISTINCT matiere FROM emploi_du_temps WHERE prof_id = ?", [profId], (err, matieres) => {
            const matiereFilter = matiere ? 'AND n.matiere = ?' : '';
            const params = matiere ? [matiere] : [];
            db.all(`SELECT n.classe, AVG(n.note * n.coefficient) as moyenne FROM notes n WHERE n.prof_id = ? ${matiereFilter} GROUP BY n.classe`, [profId, ...params], (err, moyennes) => {
                db.all(`SELECT u.nom, u.prenom, n.classe, AVG(n.note * n.coefficient) as moyenne FROM notes n JOIN users u ON n.eleve_id = u.id WHERE n.prof_id = ? ${matiereFilter} GROUP BY n.eleve_id ORDER BY moyenne DESC LIMIT 10`, [profId, ...params], (err, topEleves) => {
                    res.json({ matieres: matieres || [], moyennesParClasse: moyennes || [], topEleves: topEleves || [] });
                });
            });
        });
    },

    // ✅ CORRIGÉ : utiliser globalDb
    getProfil: (req, res) => {
        globalDb.get('SELECT nom, prenom, email, matiere_principale, classes_assignees, telephone FROM users WHERE id = ?', 
            [req.session.user.id], (err, user) => {
            if (err || !user) return res.status(404).json({ error: 'Non trouvé' });
            res.json(user);
        });
    },

    updateProfil: (req, res) => {
        const { matiere_principale, classes_assignees, telephone } = req.body;
        globalDb.run('UPDATE users SET matiere_principale=?, classes_assignees=?, telephone=? WHERE id=?', 
            [matiere_principale, classes_assignees, telephone, req.session.user.id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Profil mis à jour' });
        });
    },

    getPointages: (req, res) => {
        const profId = req.session.user.id;
        const mois = req.query.mois || new Date().toISOString().substring(0, 7);
        const db = getDb();
        db.all('SELECT * FROM pointage WHERE prof_id = ? AND strftime("%Y-%m", date_pointage) = ? ORDER BY date_pointage DESC', [profId, mois], (err, rows) => res.json(rows || []));
    },

    getCumulPointages: (req, res) => {
        const profId = req.session.user.id;
        const mois = req.query.mois || new Date().toISOString().substring(0, 7);
        const db = getDb();
        db.get(`SELECT COUNT(*) as jours_pointes, SUM(CASE WHEN statut IN ('present','sortie') THEN 1 ELSE 0 END) as jours_presents, SUM(CASE WHEN statut = 'retard' THEN 1 ELSE 0 END) as jours_retard, SUM(CASE WHEN statut = 'absent' THEN 1 ELSE 0 END) as jours_absents, SUM(COALESCE(minutes_retard,0)) as total_minutes_retard FROM pointage WHERE prof_id = ? AND strftime("%Y-%m", date_pointage) = ?`, [profId, mois], (err, row) => res.json(row || {}));
    },

    getEDT: (req, res) => {
        const profId = req.session.user.id;
        const classe = req.query.classe || '';
        const jour = req.query.jour || '';
        const db = getDb();
        let where = ['e.prof_id = ?'], params = [profId];
        if (classe) { where.push('e.classe = ?'); params.push(classe); }
        if (jour) { where.push('e.jour = ?'); params.push(jour); }
        db.all(`SELECT e.*, u.nom as prof_nom, u.prenom as prof_prenom, u.civilite FROM emploi_du_temps e LEFT JOIN users u ON e.prof_id = u.id WHERE ${where.join(' AND ')} ORDER BY CASE e.jour WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2 WHEN 'Mercredi' THEN 3 WHEN 'Jeudi' THEN 4 WHEN 'Vendredi' THEN 5 WHEN 'Samedi' THEN 6 END, e.heure_debut`, params, (err, rows) => res.json(rows || []));
    },

    getRessources: (req, res) => {
        const profId = req.session.user.id;
        const classe = req.query.classe || '';
        const type = req.query.type || '';
        const db = getDb();
        let where = ['r.prof_id = ?'], params = [profId];
        if (classe) { where.push('r.classe = ?'); params.push(classe); }
        if (type) { where.push('r.type = ?'); params.push(type); }
        db.all(`SELECT r.*, (SELECT COUNT(*) FROM devoirs_rendus dr WHERE dr.ressource_id = r.id) as nb_rendus, (SELECT COUNT(*) FROM users u WHERE u.role = 'eleve' AND u.compte_actif = 1 AND (u.classes_assignees LIKE '%' || r.classe || '%' OR u.classes_assignees = r.classe)) as nb_eleves FROM ressources r WHERE ${where.join(' AND ')} ORDER BY r.created_at DESC`, params, (err, rows) => res.json(rows || []));
    },

    createRessource: (req, res) => {
        const db = getDb();
        const { titre, type, description, classe, matiere, date_limite } = req.body;
        const fichier = req.file ? req.file.filename : null;
        db.run('INSERT INTO ressources (prof_id, titre, type, description, fichier, classe, matiere, date_limite) VALUES (?,?,?,?,?,?,?,?)',
            [req.session.user.id, titre, type, description, fichier, classe, matiere, date_limite||null], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Ressource ajoutée' });
            });
    },

    deleteRessource: (req, res) => {
        const db = getDb();
        db.run('DELETE FROM ressources WHERE id = ? AND prof_id = ?', [req.params.id, req.session.user.id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Supprimé' });
        });
    },

    getDevoirsRendus: (req, res) => {
        const db = getDb();
        const ressourceId = req.query.ressource_id;
        const profId = req.session.user.id;
        db.get('SELECT id, classe FROM ressources WHERE id = ? AND prof_id = ?', [ressourceId, profId], (err, ressource) => {
            if (err || !ressource) return res.status(404).json({ error: 'Ressource non trouvée' });
            db.all(`SELECT dr.*, u.nom, u.prenom FROM devoirs_rendus dr JOIN users u ON dr.eleve_id = u.id WHERE dr.ressource_id = ? ORDER BY dr.rendu_le DESC`, [ressourceId], (err, devoirs) => {
                db.all("SELECT u.id, u.nom, u.prenom FROM users u WHERE u.role = 'eleve' AND u.compte_actif = 1 AND (u.classes_assignees LIKE ? OR u.classes_assignees = ?) AND u.id NOT IN (SELECT eleve_id FROM devoirs_rendus WHERE ressource_id = ?)",
                    ['%' + ressource.classe + '%', ressource.classe, ressourceId], (err, nonRendus) => {
                    res.json({ ressource: ressource, devoirs: devoirs || [], nonRendus: nonRendus || [] });
                });
            });
        });
    },

    noterDevoir: (req, res) => {
        const db = getDb();
        db.run('UPDATE devoirs_rendus SET note = ? WHERE id = ?', [req.body.note, req.params.id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Noté' });
        });
    },

    exporterDevoirs: (req, res) => {
        const db = getDb();
        const ressourceId = req.query.ressource_id;
        const profId = req.session.user.id;
        db.get('SELECT * FROM ressources WHERE id = ? AND prof_id = ?', [ressourceId, profId], (err, ressource) => {
            if (err || !ressource) return res.status(404).json({ error: 'Ressource non trouvée' });
            db.all(`SELECT dr.*, u.nom, u.prenom FROM devoirs_rendus dr JOIN users u ON dr.eleve_id = u.id WHERE dr.ressource_id = ? ORDER BY u.nom`, [ressourceId], (err, devoirs) => {
                if (err) return res.status(500).json({ error: 'Erreur' });
                let csv = 'Élève;Date rendu;Fichier;Note;Commentaire\n';
                devoirs.forEach(d => { csv += `"${d.nom} ${d.prenom}";"${d.rendu_le}";"${d.fichier || 'N/A'}";"${d.note || 'Non noté'}";"${d.commentaire || ''}"\n`; });
                res.setHeader('Content-Type', 'text/csv;charset=utf-8');
                res.setHeader('Content-Disposition', 'attachment; filename=devoirs.csv');
                res.send('\uFEFF' + csv);
            });
        });
    },

    getNotes: (req, res) => {
        const profId = req.session.user.id;
        const classe = req.query.classe || '';
        const trimestre = req.query.trimestre || '1';
        const db = getDb();

        globalDb.get('SELECT matiere_principale FROM users WHERE id = ?', [profId], (err, prof) => {
            const matiere = prof?.matiere_principale || '';
            if (!matiere || !classe) return res.json([]);

            globalDb.all("SELECT u.id as eleve_id, u.nom, u.prenom, u.classes_assignees as classe_eleve FROM users u WHERE u.role = 'eleve' AND u.compte_actif = 1 AND (u.classes_assignees LIKE ? OR u.classes_assignees = ?) ORDER BY u.nom",
                ['%' + classe + '%', classe], (err, eleves) => {
                if (err || !eleves.length) return res.json([]);

                db.all("SELECT * FROM notes n WHERE n.prof_id = ? AND n.matiere = ? AND n.trimestre = ? AND n.classe = ?",
                    [profId, matiere, trimestre, classe], (err, notes) => {
                    const resultats = eleves.map(e => {
                        const notesEleve = notes.filter(n => n.eleve_id === e.eleve_id);
                        const nj1 = notesEleve.find(n => n.type_evaluation === 'NJ1')?.note || 0;
                        const nj2 = notesEleve.find(n => n.type_evaluation === 'NJ2')?.note || 0;
                        const examen = notesEleve.find(n => n.type_evaluation === 'Examen')?.note || 0;
                        const coef = notesEleve.find(n => n.type_evaluation === 'Examen')?.coefficient || 2;
                        return { eleve_id: e.eleve_id, nom: e.nom, prenom: e.prenom, nj1, nj2, examen, coef, moyenneNJ: Math.round(((nj1+nj2)/2)*100)/100, total: Math.round(((nj1+nj2)/2+examen)*100)/100, moyenne: Math.round((((nj1+nj2)/2+examen)/(coef+1))*100)/100 };
                    });
                    resultats.sort((a, b) => b.moyenne - a.moyenne);
                    resultats.forEach((r, i) => r.rang = i + 1);
                    res.json(resultats);
                });
            });
        });
    },

    saveNote: (req, res) => {
        const db = getDb();
        const { eleve_id, classe, type_evaluation, note, coefficient, trimestre } = req.body;
        const profId = req.session.user.id;
        globalDb.get('SELECT matiere_principale FROM users WHERE id = ?', [profId], (err, prof) => {
            const matiere = prof?.matiere_principale || '';
            if (!matiere) return res.status(400).json({ error: 'Matière non définie' });
            db.get('SELECT id FROM notes WHERE eleve_id = ? AND matiere = ? AND type_evaluation = ? AND trimestre = ?',
                [eleve_id, matiere, type_evaluation, trimestre || '1'], (err, row) => {
                if (row) {
                    db.run('UPDATE notes SET note = ?, coefficient = ?, classe = ? WHERE id = ?', [note, coefficient || (type_evaluation==='Examen'?2:1), classe, row.id], (err) => {
                        if (err) return res.status(500).json({ error: 'Erreur' });
                        res.json({ success: true, message: 'Note mise à jour' });
                    });
                } else {
                    db.run('INSERT INTO notes (eleve_id, matiere, classe, type_evaluation, note, coefficient, trimestre, prof_id) VALUES (?,?,?,?,?,?,?,?)',
                        [eleve_id, matiere, classe, type_evaluation, note, coefficient || (type_evaluation==='Examen'?2:1), trimestre||'1', profId], function(err) {
                        if (err) return res.status(500).json({ error: err.message });
                        res.json({ success: true, message: 'Note enregistrée' });
                    });
                }
            });
        });
    },

    getMessages: (req, res) => {
    const db = require('../config/database').getEtablissementDb() || require('../config/database').globalDb;
    if (!db) return res.json([]);
    const userId = req.session.user.id;
    db.all(`SELECT m.*, u.nom as exp_nom, u.prenom as exp_prenom FROM messages m LEFT JOIN users u ON m.expediteur_id = u.id WHERE m.destinataire_id = ? OR m.destinataire_role = 'all' OR m.destinataire_role = 'vie_scolaire' ORDER BY m.created_at DESC LIMIT 30`,
        [userId], (err, messages) => res.json(messages || []));
},

sendMessage: (req, res) => {
    const db = require('../config/database').getEtablissementDb() || require('../config/database').globalDb;
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
    const db = require('../config/database').getEtablissementDb() || require('../config/database').globalDb;
    if (!db) return res.json([]);
    db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [req.session.user.id], (err, rows) => res.json(rows || []));
},

markNotificationRead: (req, res) => {
    const db = require('../config/database').getEtablissementDb() || require('../config/database').globalDb;
    if (!db) return res.json({ success: false });
    db.run('UPDATE notifications SET lu = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id], (err) => res.json({ success: true }));
},

viderNotificationsGeneral: (req, res) => {
    const db = require('../config/database').getEtablissementDb() || require('../config/database').globalDb;
    if (!db) return res.json({ success: false });
    db.run('DELETE FROM notifications WHERE user_id = ?', [req.session.user.id], (err) => res.json({ success: true, message: 'Notifications vidées' }));
},

    getElevesList: (req, res) => {
        const etablissementCode = req.session.user.etablissement_code || '';
        globalDb.all("SELECT id, nom, prenom, email, classes_assignees FROM users WHERE role = 'eleve' AND compte_actif = 1 AND etablissement_code = ? ORDER BY nom", [etablissementCode], (err, rows) => res.json(rows || []));
    },

    getClasses: (req, res) => {
        const etablissementCode = req.session.user.etablissement_code || '';
        globalDb.all("SELECT DISTINCT classes_assignees as classe FROM users WHERE role = 'eleve' AND compte_actif = 1 AND etablissement_code = ? AND classes_assignees IS NOT NULL AND classes_assignees != '' ORDER BY classes_assignees", [etablissementCode], (err, rows) => {
            if (err) return res.json([]);
            const classes = rows.map(r => { const cls = r.classe || ''; return cls.split(',')[0].trim(); }).filter((v, i, a) => v && a.indexOf(v) === i);
            res.json(classes.map(c => ({ classe: c })));
        });
    },

    getMatieres: (req, res) => {
        const db = getDb();
        db.all("SELECT DISTINCT matiere FROM emploi_du_temps WHERE prof_id = ? ORDER BY matiere", [req.session.user.id], (err, rows) => res.json(rows || []));
    }
};

module.exports = profController;