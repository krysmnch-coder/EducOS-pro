const express = require('express');

module.exports = function(upload) {
    const router = express.Router();
    const vs = require('../controllers/vieScolaireController');
    const { isAuthenticated, hasRole } = require('../middleware/auth');

    router.use(isAuthenticated);
    router.use(hasRole('vie_scolaire', 'admin'));

    router.get('/api/stats', vs.getStats);
    router.get('/api/absences', vs.getAbsences);
    router.post('/api/absences', vs.createAbsence);
    router.delete('/api/absences/:id', vs.deleteAbsence);
    router.get('/api/edt', vs.getEDT);
    router.post('/api/edt', vs.createEDT);
    router.delete('/api/edt/:id', vs.deleteEDT);
    router.get('/api/classes', vs.getClasses);
    router.get('/api/pointages', vs.getPointages);
    router.post('/api/pointer-arrivee', vs.pointerArrivee);
    router.post('/api/pointer-depart', vs.pointerDepart);
    router.get('/api/cumul-pointages', vs.getCumulPointages);
    router.get('/api/profs', vs.getProfs);
    router.get('/api/sanctions', vs.getSanctions);
    router.post('/api/sanctions', vs.createSanction);
    router.delete('/api/sanctions/:id', vs.deleteSanction);
    router.get('/api/messages', vs.getMessages);
    router.post('/api/messages', upload.single('fichier'), vs.sendMessage);
    router.get('/api/notifications', vs.getNotifications);
    router.put('/api/notifications/:id/read', vs.markNotificationRead);
    router.delete('/api/notifications', vs.viderNotificationsGeneral);
    router.get('/api/eleves', vs.getEleves);
    router.get('/api/users-by-role', vs.getUsersByRole);
    router.put('/api/users/:id/telephone', vs.updateUserTelephone);
    router.post('/api/edt-bulk', vs.createEDTBulk);

    return router;
};