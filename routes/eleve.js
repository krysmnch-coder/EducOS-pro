const express = require('express');

module.exports = function(upload) {
    const router = express.Router();
    const eleve = require('../controllers/eleveController');
    const { isAuthenticated, hasRole } = require('../middleware/auth');

    router.use(isAuthenticated);
    router.use(hasRole('eleve'));

    router.get('/api/profil', eleve.getProfil);
    router.get('/api/notes', eleve.getNotes);
    router.get('/api/edt', eleve.getEDT);
    router.get('/api/ressources', eleve.getRessources);
    router.post('/api/rendre-devoir', upload.single('fichier'), eleve.rendreDevoir);
    router.get('/api/absences', eleve.getAbsences);
    router.get('/api/sanctions', eleve.getSanctions);
    router.get('/api/messages', eleve.getMessages);
    router.post('/api/messages', upload.single('fichier'), eleve.sendMessage);
    router.get('/api/amis', eleve.getAmis);
    router.get('/api/demandes-amis', eleve.getDemandesAmis);
    router.get('/api/rechercher-eleves', eleve.rechercherEleves);
    router.post('/api/ajouter-ami', eleve.ajouterAmi);
    router.post('/api/accepter-ami', eleve.accepterAmi);
    router.post('/api/refuser-ami', eleve.refuserAmi);
    router.post('/api/supprimer-ami', eleve.supprimerAmi);
    router.get('/api/groupes', eleve.getGroupes);
    router.post('/api/creer-groupe', eleve.creerGroupe);
    router.get('/api/messages-groupe', eleve.getMessagesGroupe);
    router.post('/api/envoyer-message-groupe', upload.single('fichier'), eleve.envoyerMessageGroupe);
    router.post('/api/ajouter-membre-groupe', eleve.ajouterMembreGroupe);
    router.get('/api/membres-groupe', eleve.getMembresGroupe);
    router.post('/api/update-groupe-photo', upload.single('fichier'), eleve.updateGroupePhoto);
    router.get('/api/groupe-info', eleve.getGroupeInfo);
    router.put('/api/update-groupe-nom', eleve.updateGroupeNom);
    router.post('/api/quitter-groupe', eleve.quitterGroupe);
    router.post('/api/supprimer-groupe', eleve.supprimerGroupe);
    router.post('/api/retirer-membre-groupe', eleve.retirerMembreGroupe);
    router.get('/api/messages-amis', eleve.getMessagesAmis);
    router.post('/api/envoyer-message-ami', upload.single('fichier'), eleve.envoyerMessageAmi);
    router.get('/api/notifications', eleve.getNotifications);
    router.put('/api/notifications/:id/read', eleve.markNotificationRead);
    router.delete('/api/notifications', eleve.viderNotifications);

    return router;
};