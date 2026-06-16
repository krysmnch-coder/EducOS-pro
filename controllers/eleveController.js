const db = require('../config/database');

const eleveController = {
    getProfil: (req, res) => {
        db.get('SELECT nom, prenom, email, classes_assignees as classe, date_naissance, telephone FROM users WHERE id = ?', [req.session.user.id], (err, user) => {
            if (err || !user) return res.status(404).json({ error: 'Non trouvé' });
            res.json(user);
        });
    },

    getNotes: (req, res) => {
        const eleveId = req.session.user.id;
        db.all("SELECT n.*, u.nom as prof_nom, u.prenom as prof_prenom FROM notes n LEFT JOIN users u ON n.prof_id = u.id WHERE n.eleve_id = ? ORDER BY n.trimestre, n.matiere", [eleveId], (err, notes) => {
            if (err || !notes.length) return res.json({ matieres: [], moyenneGenerale: 0 });
            const matieresMap = {};
            notes.forEach(n => {
                if (!matieresMap[n.matiere]) matieresMap[n.matiere] = { matiere: n.matiere, prof_nom: n.prof_nom || '', prof_prenom: n.prof_prenom || '', nj1: 0, nj2: 0, examen: 0, coef: 2 };
                if (n.type_evaluation === 'NJ1') matieresMap[n.matiere].nj1 = n.note;
                if (n.type_evaluation === 'NJ2') matieresMap[n.matiere].nj2 = n.note;
                if (n.type_evaluation === 'Examen') { matieresMap[n.matiere].examen = n.note; matieresMap[n.matiere].coef = n.coefficient || 2; }
            });
            const matieres = Object.values(matieresMap);
            let somme = 0;
            matieres.forEach(m => {
                const moyNJ = (m.nj1 + m.nj2) / 2;
                m.moyenne = Math.round(((moyNJ + m.examen) / (m.coef + 1)) * 100) / 100;
                m.moyenneNJ = Math.round(moyNJ * 100) / 100;
                m.total = Math.round((moyNJ + m.examen) * 100) / 100;
                somme += m.moyenne;
            });
            res.json({ matieres, moyenneGenerale: matieres.length ? Math.round((somme / matieres.length) * 100) / 100 : 0 });
        });
    },

    getEDT: (req, res) => {
        db.get('SELECT classes_assignees as classe FROM users WHERE id = ?', [req.session.user.id], (err, row) => {
            const classe = row?.classe || '';
            db.all("SELECT e.*, u.nom as prof_nom, u.prenom as prof_prenom FROM emploi_du_temps e LEFT JOIN users u ON e.prof_id = u.id WHERE e.classe = ? ORDER BY CASE e.jour WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2 WHEN 'Mercredi' THEN 3 WHEN 'Jeudi' THEN 4 WHEN 'Vendredi' THEN 5 WHEN 'Samedi' THEN 6 END, e.heure_debut", [classe], (err, rows) => res.json(rows || []));
        });
    },

    getRessources: (req, res) => {
        db.get('SELECT classes_assignees as classe FROM users WHERE id = ?', [req.session.user.id], (err, row) => {
            const classe = row?.classe || '';
            db.all("SELECT r.*, u.nom as prof_nom, u.prenom as prof_prenom FROM ressources r LEFT JOIN users u ON r.prof_id = u.id WHERE r.classe = ? ORDER BY r.created_at DESC", [classe], (err, rows) => res.json(rows || []));
        });
    },

    rendreDevoir: (req, res) => {
        const { ressource_id } = req.body;
        const fichier = req.file ? req.file.filename : null;
        db.run('INSERT INTO devoirs_rendus (ressource_id, eleve_id, fichier) VALUES (?, ?, ?)', [ressource_id, req.session.user.id, fichier], function(err) {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Devoir rendu !' });
        });
    },

    getAbsences: (req, res) => {
        db.all("SELECT * FROM absences WHERE eleve_id = ? ORDER BY date_absence DESC LIMIT 50", [req.session.user.id], (err, rows) => res.json(rows || []));
    },

    getSanctions: (req, res) => {
        db.all("SELECT * FROM sanctions WHERE eleve_id = ? ORDER BY date_sanction DESC", [req.session.user.id], (err, rows) => res.json(rows || []));
    },

    getMessages: (req, res) => {
        db.all("SELECT m.*, u.nom as exp_nom, u.prenom as exp_prenom FROM messages m LEFT JOIN users u ON m.expediteur_id = u.id WHERE m.destinataire_id = ? OR m.destinataire_role = 'all' OR m.destinataire_role = 'eleve' ORDER BY m.created_at DESC LIMIT 30", [req.session.user.id], (err, msgs) => res.json(msgs || []));
    },

    sendMessage: (req, res) => {
        const { destinataire_id, destinataire_role, sujet, contenu } = req.body;
        if (!sujet || !contenu) return res.status(400).json({ error: 'Requis' });
        const fichier = req.file ? req.file.filename : null;
        db.run('INSERT INTO messages (expediteur_id, destinataire_id, destinataire_role, sujet, contenu, fichier) VALUES (?,?,?,?,?,?)', [req.session.user.id, destinataire_id || null, destinataire_role || 'all', sujet, contenu, fichier], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Envoyé' });
        });
    },

    getAmis: (req, res) => {
        const userId = req.session.user.id;
        db.all("SELECT DISTINCT u.id, u.nom, u.prenom, u.classes_assignees as classe FROM users u WHERE u.id IN (SELECT ami_id FROM amis WHERE eleve_id = ? AND statut = 'accepte') OR u.id IN (SELECT eleve_id FROM amis WHERE ami_id = ? AND statut = 'accepte') ORDER BY u.nom", [userId, userId], (err, rows) => res.json(rows || []));
    },

    getDemandesAmis: (req, res) => {
        const userId = req.session.user.id;
        db.all("SELECT a.id as demande_id, u.id, u.nom, u.prenom, u.classes_assignees as classe FROM amis a JOIN users u ON a.eleve_id = u.id WHERE a.ami_id = ? AND a.statut = 'en_attente' ORDER BY a.created_at DESC", [userId], (err, rows) => res.json(rows || []));
    },

    rechercherEleves: (req, res) => {
        const search = req.query.search || '';
        const userId = req.session.user.id;
        db.all("SELECT id, nom, prenom, classes_assignees as classe FROM users WHERE role = 'eleve' AND compte_actif = 1 AND id != ? AND (nom LIKE ? OR prenom LIKE ?) AND id NOT IN (SELECT ami_id FROM amis WHERE eleve_id = ? AND statut = 'accepte') AND id NOT IN (SELECT eleve_id FROM amis WHERE ami_id = ? AND statut = 'accepte') ORDER BY nom LIMIT 20", [userId, '%' + search + '%', '%' + search + '%', userId, userId], (err, rows) => res.json(rows || []));
    },

    ajouterAmi: (req, res) => {
        const userId = req.session.user.id;
        const amiId = req.body.ami_id;
        if (userId == amiId) return res.status(400).json({ error: 'Impossible' });
        db.get('SELECT id FROM amis WHERE (eleve_id = ? AND ami_id = ?) OR (eleve_id = ? AND ami_id = ?)', [userId, amiId, amiId, userId], (err, row) => {
            if (row) return res.status(400).json({ error: 'Déjà en relation' });
            db.run('INSERT INTO amis (eleve_id, ami_id, statut) VALUES (?, ?, ?)', [userId, amiId, 'en_attente'], function(err) {
                if (err) return res.status(500).json({ error: 'Erreur' });
                db.run("INSERT INTO notifications (user_id, type, titre, message, lien) VALUES (?, 'ami', '🤝 Demande d''ami', ?, '/dashboard/eleve')", [amiId, req.session.user.prenom + ' ' + req.session.user.nom + ' veut être votre ami(e)']);
                res.json({ success: true, message: 'Demande envoyée !' });
            });
        });
    },

    accepterAmi: (req, res) => {
        const userId = req.session.user.id;
        const amiId = req.body.ami_id;
        db.run("UPDATE amis SET statut = 'accepte' WHERE eleve_id = ? AND ami_id = ?", [amiId, userId], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            db.run("INSERT INTO notifications (user_id, type, titre, message) VALUES (?, 'ami', '✅ Demande acceptée', ?)", [amiId, req.session.user.prenom + ' a accepté votre demande']);
            res.json({ success: true, message: 'Ami accepté !' });
        });
    },

    refuserAmi: (req, res) => {
        const userId = req.session.user.id;
        const amiId = req.body.ami_id;
        db.run("DELETE FROM amis WHERE eleve_id = ? AND ami_id = ?", [amiId, userId], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Demande refusée' });
        });
    },

    supprimerAmi: (req, res) => {
        const userId = req.session.user.id;
        const amiId = req.body.ami_id;
        db.run('DELETE FROM amis WHERE (eleve_id = ? AND ami_id = ?) OR (eleve_id = ? AND ami_id = ?)', [userId, amiId, amiId, userId], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Ami supprimé' });
        });
    },

    getMessagesAmis: (req, res) => {
        const amiId = req.query.ami_id;
        const userId = req.session.user.id;
        db.all("SELECT ma.*, u.nom, u.prenom FROM messages_amis ma JOIN users u ON ma.expediteur_id = u.id WHERE (ma.expediteur_id = ? AND ma.destinataire_id = ?) OR (ma.expediteur_id = ? AND ma.destinataire_id = ?) ORDER BY ma.created_at ASC LIMIT 200", [userId, amiId, amiId, userId], (err, rows) => {
            db.run('UPDATE messages_amis SET lu = 1 WHERE destinataire_id = ? AND expediteur_id = ? AND lu = 0', [userId, amiId]);
            res.json(rows || []);
        });
    },

    envoyerMessageAmi: (req, res) => {
        const { ami_id, contenu } = req.body;
        if (!contenu || !contenu.trim()) return res.status(400).json({ error: 'Message vide' });
        const fichier = req.file ? req.file.filename : null;
        const userId = req.session.user.id;
        db.run('INSERT INTO messages_amis (expediteur_id, destinataire_id, contenu, fichier) VALUES (?, ?, ?, ?)', [userId, ami_id, contenu.trim(), fichier], function(err) {
            if (err) return res.status(500).json({ error: 'Erreur' });
            db.run("INSERT INTO notifications (user_id, type, titre, message, lien) VALUES (?, 'message_ami', '💬 ' || ?, ?, '/dashboard/eleve')", [ami_id, req.session.user.prenom, contenu.trim().substring(0, 60)]);
            res.json({ success: true, message: 'Envoyé' });
        });
    },

    getGroupes: (req, res) => {
        const userId = req.session.user.id;
        db.all("SELECT g.*, (SELECT COUNT(*) FROM membres_groupes WHERE groupe_id = g.id) as nb_membres FROM groupes g WHERE g.createur_id = ? OR g.id IN (SELECT groupe_id FROM membres_groupes WHERE eleve_id = ?)", [userId, userId], (err, rows) => res.json(rows || []));
    },

    creerGroupe: (req, res) => {
        const { nom } = req.body;
        if (!nom || !nom.trim()) return res.status(400).json({ error: 'Nom requis' });
        const userId = req.session.user.id;
        db.run('INSERT INTO groupes (nom, createur_id) VALUES (?, ?)', [nom.trim(), userId], function(err) {
            if (err) return res.status(500).json({ error: 'Erreur' });
            db.run('INSERT INTO membres_groupes (groupe_id, eleve_id) VALUES (?, ?)', [this.lastID, userId]);
            res.json({ success: true, message: 'Groupe créé !', groupe_id: this.lastID });
        });
    },

    getMessagesGroupe: (req, res) => {
        const groupeId = req.query.groupe_id;
        db.all("SELECT mg.*, u.nom, u.prenom FROM messages_groupes mg JOIN users u ON mg.expediteur_id = u.id WHERE mg.groupe_id = ? ORDER BY mg.created_at ASC LIMIT 200", [groupeId], (err, rows) => res.json(rows || []));
    },

    envoyerMessageGroupe: (req, res) => {
        const { groupe_id, contenu } = req.body;
        if (!contenu || !contenu.trim()) return res.status(400).json({ error: 'Message vide' });
        const fichier = req.file ? req.file.filename : null;
        const userId = req.session.user.id;
        db.run('INSERT INTO messages_groupes (groupe_id, expediteur_id, contenu, fichier) VALUES (?, ?, ?, ?)', [groupe_id, userId, contenu.trim(), fichier], function(err) {
            if (err) return res.status(500).json({ error: 'Erreur' });
            db.all('SELECT eleve_id FROM membres_groupes WHERE groupe_id = ? AND eleve_id != ?', [groupe_id, userId], (err, membres) => {
                if (membres) membres.forEach(m => db.run("INSERT INTO notifications (user_id, type, titre, message, lien) VALUES (?, 'message_groupe', '💬 Nouveau message', ?, '/dashboard/eleve')", [m.eleve_id, req.session.user.prenom + ': ' + contenu.trim().substring(0, 60)]));
            });
            res.json({ success: true, message: 'Envoyé' });
        });
    },

    ajouterMembreGroupe: (req, res) => {
        const { groupe_id, eleve_id } = req.body;
        db.run('INSERT OR IGNORE INTO membres_groupes (groupe_id, eleve_id) VALUES (?, ?)', [groupe_id, eleve_id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Membre ajouté' });
        });
    },

    getMembresGroupe: (req, res) => {
        db.all("SELECT u.id, u.nom, u.prenom, u.classes_assignees as classe FROM membres_groupes mg JOIN users u ON mg.eleve_id = u.id WHERE mg.groupe_id = ?", [req.query.groupe_id], (err, rows) => res.json(rows || []));
    },

    retirerMembreGroupe: (req, res) => {
        db.run('DELETE FROM membres_groupes WHERE groupe_id = ? AND eleve_id = ?', [req.body.groupe_id, req.body.eleve_id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Membre retiré' });
        });
    },

    quitterGroupe: (req, res) => {
        const userId = req.session.user.id;
        const groupeId = req.body.groupe_id;
        db.get('SELECT createur_id FROM groupes WHERE id = ?', [groupeId], (err, groupe) => {
            if (err || !groupe) return res.status(404).json({ error: 'Groupe non trouvé' });
            if (groupe.createur_id == userId) {
                return res.status(400).json({ error: 'Le créateur ne peut pas quitter. Supprimez le groupe.' });
            }
            db.run('DELETE FROM membres_groupes WHERE groupe_id = ? AND eleve_id = ?', [groupeId, userId], (err) => {
                if (err) return res.status(500).json({ error: 'Erreur' });
                res.json({ success: true, message: 'Vous avez quitté le groupe' });
            });
        });
    },

    supprimerGroupe: (req, res) => {
        const userId = req.session.user.id;
        const groupeId = req.body.groupe_id;
        db.get('SELECT createur_id FROM groupes WHERE id = ?', [groupeId], (err, groupe) => {
            if (err || !groupe) return res.status(404).json({ error: 'Groupe non trouvé' });
            if (groupe.createur_id != userId) return res.status(403).json({ error: 'Seul le créateur peut supprimer' });
            db.run('DELETE FROM messages_groupes WHERE groupe_id = ?', [groupeId]);
            db.run('DELETE FROM membres_groupes WHERE groupe_id = ?', [groupeId]);
            db.run('DELETE FROM groupes WHERE id = ?', [groupeId], (err) => {
                if (err) return res.status(500).json({ error: 'Erreur' });
                res.json({ success: true, message: 'Groupe supprimé' });
            });
        });
    },

    getGroupeInfo: (req, res) => {
        const groupeId = req.query.groupe_id;
        db.get("SELECT g.*, (SELECT COUNT(*) FROM membres_groupes WHERE groupe_id = g.id) as nb_membres FROM groupes g WHERE g.id = ?", [groupeId], (err, groupe) => {
            if (err || !groupe) return res.status(404).json({ error: 'Groupe non trouvé' });
            res.json(groupe);
        });
    },

    updateGroupeNom: (req, res) => {
        const { groupe_id, nom } = req.body;
        if (!nom || !nom.trim()) return res.status(400).json({ error: 'Nom requis' });
        db.run('UPDATE groupes SET nom = ? WHERE id = ?', [nom.trim(), groupe_id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Nom mis à jour' });
        });
    },

    updateGroupePhoto: (req, res) => {
        const fichier = req.file ? req.file.filename : null;
        if (!fichier) return res.status(400).json({ error: 'Fichier requis' });
        db.run('UPDATE groupes SET photo = ? WHERE id = ?', [fichier, req.body.groupe_id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Photo mise à jour', fichier: fichier });
        });
    },

    marquerNotifsLues: (req, res) => {
        const userId = req.session.user.id;
        const type = req.params.type;
        if (type === 'ami') {
            db.run("UPDATE notifications SET lu = 1 WHERE user_id = ? AND type = 'message_ami'", [userId]);
        } else if (type === 'groupe') {
            db.run("UPDATE notifications SET lu = 1 WHERE user_id = ? AND type = 'message_groupe'", [userId]);
        }
        res.json({ success: true });
    },

    getNotifications: (req, res) => {
        db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [req.session.user.id], (err, rows) => res.json(rows || []));
    },

    markNotificationRead: (req, res) => {
        db.run('UPDATE notifications SET lu = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id], (err) => res.json({ success: true }));
    },

    viderNotifications: (req, res) => {
        db.run('DELETE FROM notifications WHERE user_id = ?', [req.session.user.id], (err) => {
            if (err) return res.status(500).json({ error: 'Erreur' });
            res.json({ success: true, message: 'Notifications vidées' });
        });
    }
};

module.exports = eleveController;