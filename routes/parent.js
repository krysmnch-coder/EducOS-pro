const express = require('express');

module.exports = function(upload) {
    const router = express.Router();
    const parent = require('../controllers/parentController');
    const { isAuthenticated, hasRole } = require('../middleware/auth');

    router.use(isAuthenticated);
    router.use(hasRole('parent'));

    router.get('/api/enfants', parent.getEnfants);
    router.post('/api/inscrire-enfant', parent.inscrireEnfant);
    router.get('/api/notes', parent.getNotes);
    router.get('/api/edt', parent.getEDT);
    router.get('/api/ressources', parent.getRessources);
    router.get('/api/absences', parent.getAbsences);
    router.get('/api/sanctions', parent.getSanctions);
    router.get('/api/messages', parent.getMessages);
    router.post('/api/messages', upload.single('fichier'), parent.sendMessage);
    router.get('/api/notifications', parent.getNotifications);
    router.put('/api/notifications/:id/read', parent.markNotificationRead);
    router.delete('/api/notifications', parent.viderNotificationsGeneral);
    router.get('/api/profs', parent.getProfsList);
    router.get('/api/frais', parent.getFrais);
    router.post('/api/payer', parent.payer);
    router.post('/api/rendre-devoir', upload.single('fichier'), parent.rendreDevoir);

    return router;
};