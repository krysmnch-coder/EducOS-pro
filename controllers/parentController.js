const { globalDb, getEtablissementDb } = require('../config/database');

function getDb() {
    return getEtablissementDb() || globalDb;
}

const parentController = {
    getEnfants: (req, res) => {
        const parentId = req.session.user.id;
        
        globalDb.get('SELECT classes_assignees FROM users WHERE id = ?', [parentId], (err, row) => {
            let enfantsDeclares = [];
            if (row && row.classes_assignees) {
                try { 
                    const parsed = JSON.parse(row.classes_assignees);
                    if (Array.isArray(parsed)) enfantsDeclares = parsed;
                } catch(e) { enfantsDeclares = []; }
            }

            const etablissementCode = req.session.user.etablissement_code || '';
            globalDb.all("SELECT nom, prenom, classes_assignees as classe, date_naissance, telephone FROM users WHERE role = 'eleve' AND compte_actif = 1 AND etablissement_code = ? ORDER BY nom, prenom", 
                [etablissementCode], (err, eleves) => {
                
                const tousLesEnfants = [...enfantsDeclares];
                if (eleves && eleves.length > 0) {
                    eleves.forEach(eleve => {
                        const existeDeja = tousLesEnfants.find(e => 
                            e.nom.toLowerCase() === eleve.nom.toLowerCase() && 
                            e.prenom.toLowerCase() === eleve.prenom.toLowerCase()
                        );
                        if (!existeDeja) {
                            tousLesEnfants.push({
                                nom: eleve.nom,
                                prenom: eleve.prenom,
                                classe: eleve.classe || 'Non assignée',
                                date_naissance: eleve.date_naissance || '',
                                telephone: eleve.telephone || '',
                                source: 'compte_eleve'
                            });
                        }
                    });
                }
                tousLesEnfants.sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom));
                res.json(tousLesEnfants);
            });
        });
    },

    inscrireEnfant: (req, res) => {
        const parentId = req.session.user.id;
        const { nom, prenom, classe, date_naissance } = req.body;
        if (!nom || !prenom || !classe) return res.status(400).json({ error: 'Nom, prénom et classe obligatoires' });

        globalDb.get('SELECT classes_assignees FROM users WHERE id = ?', [parentId], (err, row) => {
            let enfants = [];
            if (row && row.classes_assignees) {
                try { enfants = JSON.parse(row.classes_assignees); } catch(e) { enfants = []; }
            }
            enfants.push({ nom, prenom, classe, date_naissance: date_naissance || '', source: 'declaration_parent' });
            globalDb.run('UPDATE users SET classes_assignees = ? WHERE id = ?', [JSON.stringify(enfants), parentId], (err) => {
                if (err) return res.status(500).json({ error: 'Erreur lors de l\'inscription' });
                
                const bcrypt = require('bcryptjs');
                globalDb.get("SELECT id FROM users WHERE nom = ? AND prenom = ? AND role = 'eleve'", [nom, prenom], (err, row) => {
                    if (!row) {
                        bcrypt.hash('educos2024', 10, (err, hash) => {
                            globalDb.run("INSERT INTO users (nom, prenom, email, password, role, classes_assignees, date_naissance, etablissement_code) VALUES (?, ?, ?, ?, 'eleve', ?, ?, ?)",
                                [nom, prenom, prenom.toLowerCase() + '.' + nom.toLowerCase() + '@eleve.educos.com', hash, classe, date_naissance || '', req.session.user.etablissement_code || '']);
                        });
                    }
                });
                
                res.json({ success: true, message: 'Enfant inscrit avec succès' });
            });
        });
    },

    getNotes: (req, res) => {
        const { eleve_nom, eleve_prenom } = req.query;
        if (!eleve_nom || !eleve_prenom) return res.json({ matieres: [], moyenneGenerale: 0 });

        globalDb.get("SELECT id FROM users WHERE nom = ? AND prenom = ? AND role = 'eleve'", [eleve_nom, eleve_prenom], (err, row) => {
            if (err || !row) return res.json({ matieres: [], moyenneGenerale: 0 });
            const eleveId = row.id;
            const db = getDb();

            db.all(`SELECT n.*, u.nom as prof_nom, u.prenom as prof_prenom FROM notes n LEFT JOIN users u ON n.prof_id = u.id WHERE n.eleve_id = ? ORDER BY n.trimestre, n.matiere, n.type_evaluation`, [eleveId], (err, notes) => {
                if (err || !notes || notes.length === 0) return res.json({ matieres: [], moyenneGenerale: 0 });

                const matieresMap = {};
                notes.forEach(n => {
                    if (!matieresMap[n.matiere]) {
                        matieresMap[n.matiere] = { matiere: n.matiere, prof_nom: n.prof_nom || 'Non assigné', prof_prenom: n.prof_prenom || '', nj1: 0, nj2: 0, examen: 0, coef: 2, trimestre: n.trimestre };
                    }
                    if (n.type_evaluation === 'NJ1') matieresMap[n.matiere].nj1 = n.note;
                    if (n.type_evaluation === 'NJ2') matieresMap[n.matiere].nj2 = n.note;
                    if (n.type_evaluation === 'Examen') { matieresMap[n.matiere].examen = n.note; matieresMap[n.matiere].coef = n.coefficient || 2; }
                });

                const matieres = Object.values(matieresMap);
                let sommeMoyennes = 0, nombreMatieres = 0;
                matieres.forEach(m => {
                    const moyenneNJ = (m.nj1 + m.nj2) / 2;
                    const total = moyenneNJ + m.examen;
                    m.moyenne = Math.round((total / (m.coef + 1)) * 100) / 100;
                    m.moyenneNJ = Math.round(moyenneNJ * 100) / 100;
                    m.total = Math.round(total * 100) / 100;
                    sommeMoyennes += m.moyenne;
                    nombreMatieres++;
                });
                const moyenneGenerale = nombreMatieres > 0 ? Math.round((sommeMoyennes / nombreMatieres) * 100) / 100 : 0;
                res.json({ matieres, moyenneGenerale });
            });
        });
    },

    getEDT: (req, res) => {
        const classe = req.query.classe || '';
        if (!classe) return res.json([]);
        const db = getDb();
        db.all("SELECT e.*, u.nom as prof_nom, u.prenom as prof_prenom FROM emploi_du_temps e LEFT JOIN users u ON e.prof_id = u.id WHERE e.classe = ? ORDER BY CASE e.jour WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2 WHEN 'Mercredi' THEN 3 WHEN 'Jeudi' THEN 4 WHEN 'Vendredi' THEN 5 WHEN 'Samedi' THEN 6 END, e.heure_debut", [classe], (err, rows) => res.json(rows || []));
    },

    getRessources: (req, res) => {
        const classe = req.query.classe || '';
        if (!classe) return res.json([]);
        const db = getDb();
        db.all("SELECT r.*, u.nom as prof_nom, u.prenom as prof_prenom FROM ressources r LEFT JOIN users u ON r.prof_id = u.id WHERE r.classe = ? ORDER BY r.created_at DESC", [classe], (err, rows) => res.json(rows || []));
    },

    getAbsences: (req, res) => {
        const { eleve_nom, eleve_prenom } = req.query;
        if (!eleve_nom || !eleve_prenom) return res.json([]);
        globalDb.get("SELECT id FROM users WHERE nom = ? AND prenom = ? AND role = 'eleve'", [eleve_nom, eleve_prenom], (err, row) => {
            if (err || !row) return res.json([]);
            const db = getDb();
            db.all("SELECT * FROM absences WHERE eleve_id = ? ORDER BY date_absence DESC LIMIT 50", [row.id], (err, absences) => res.json(absences || []));
        });
    },

    getSanctions: (req, res) => {
        const { eleve_nom, eleve_prenom } = req.query;
        if (!eleve_nom || !eleve_prenom) return res.json([]);
        globalDb.get("SELECT id FROM users WHERE nom = ? AND prenom = ? AND role = 'eleve'", [eleve_nom, eleve_prenom], (err, row) => {
            if (err || !row) return res.json([]);
            const db = getDb();
            db.all("SELECT * FROM sanctions WHERE eleve_id = ? ORDER BY date_sanction DESC", [row.id], (err, sanctions) => res.json(sanctions || []));
        });
    },

    getMessages: (req, res) => {
        const db = getDb();
        db.all("SELECT m.*, u.nom as exp_nom, u.prenom as exp_prenom FROM messages m LEFT JOIN users u ON m.expediteur_id = u.id WHERE m.destinataire_id = ? OR m.destinataire_role = 'all' OR m.destinataire_role = 'parent' ORDER BY m.created_at DESC LIMIT 30",
            [req.session.user.id], (err, messages) => res.json(messages || []));
    },

    sendMessage: (req, res) => {
        const db = getDb();
        const { destinataire_id, destinataire_role, sujet, contenu } = req.body;
        if (!sujet || !contenu) return res.status(400).json({ error: 'Sujet et contenu requis' });
        const fichier = req.file ? req.file.filename : null;
        db.run('INSERT INTO messages (expediteur_id, destinataire_id, destinataire_role, sujet, contenu, fichier) VALUES (?,?,?,?,?,?)',
            [req.session.user.id, destinataire_id||null, destinataire_role||'all', sujet, contenu, fichier], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                if (destinataire_id) {
                    db.run("INSERT INTO notifications (user_id, type, titre, message, message_id) VALUES (?, 'message', ?, ?, ?)", [destinataire_id, sujet, contenu.substring(0, 100), this.lastID]);
                }
                res.json({ success: true, message: 'Message envoyé' });
            });
    },

    getNotifications: (req, res) => {
        const db = getDb();
        db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [req.session.user.id], (err, rows) => res.json(rows || []));
    },

    markNotificationRead: (req, res) => {
        const db = getDb();
        db.run('UPDATE notifications SET lu = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id], (err) => res.json({ success: true }));
    },

    getProfsList: (req, res) => {
        globalDb.all("SELECT id, nom, prenom FROM users WHERE role = 'prof' AND compte_actif = 1 ORDER BY nom", [], (err, rows) => res.json(rows || []));
    },

    getFrais: (req, res) => {
        const db = getDb();
        db.all("SELECT * FROM paiements WHERE type = 'recette' AND statut != 'annule' ORDER BY date_echeance DESC", [], (err, rows) => res.json(rows || []));
    },

    payer: (req, res) => {
        const db = getDb();
        const { frais_index, montant, mode, telephone } = req.body;
        if (!montant || !mode || !telephone) return res.status(400).json({ error: 'Tous les champs sont requis' });
        db.all("SELECT * FROM paiements WHERE type = 'recette' AND statut != 'annule' ORDER BY date_echeance DESC", [], (err, rows) => {
            if (err || !rows || !rows[frais_index || 0]) return res.status(404).json({ error: 'Frais non trouvé' });
            const frais = rows[frais_index || 0];
            const parentNom = req.session.user.nom + ' ' + req.session.user.prenom;
            db.run("INSERT INTO paiements (type, categorie, montant, description, date_paiement, beneficiaire, mode_paiement, reference, user_id) VALUES ('recette', ?, ?, ?, date('now'), ?, ?, ?, ?)",
                [frais.categorie, montant, frais.motif + ' - Payé par ' + parentNom, telephone + ' (' + mode + ')', mode + '_money', 'PAY-' + Date.now(), req.session.user.id],
                function(err) {
                    if (err) return res.status(500).json({ error: 'Erreur lors du paiement' });
                    res.json({ success: true, message: '✅ Paiement de ' + Number(montant).toLocaleString('fr-FR') + ' Ar effectué avec succès via ' + mode.toUpperCase() + ' !' });
                });
        });
    },

    rendreDevoir: (req, res) => {
        const db = getDb();
        const { ressource_id } = req.body;
        const fichier = req.file ? req.file.filename : null;
        const enfantNom = req.body.enfant_nom;
        const enfantPrenom = req.body.enfant_prenom;
        globalDb.get("SELECT id FROM users WHERE nom = ? AND prenom = ? AND role = 'eleve'", [enfantNom, enfantPrenom], (err, row) => {
            if (err || !row) return res.status(404).json({ error: 'Élève non trouvé' });
            db.run('INSERT INTO devoirs_rendus (ressource_id, eleve_id, fichier) VALUES (?, ?, ?)', [ressource_id, row.id, fichier], function(err) {
                if (err) return res.status(500).json({ error: 'Erreur' });
                res.json({ success: true, message: 'Devoir rendu avec succès' });
            });
        });
    },

    viderNotificationsGeneral: (req, res) => {
        const db = getDb();
        db.run('DELETE FROM notifications WHERE user_id = ?', [req.session.user.id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Notifications vidées' });
        });
    }
};

module.exports = parentController;