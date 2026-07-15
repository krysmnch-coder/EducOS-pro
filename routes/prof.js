const express = require('express');

module.exports = function(upload) {
    const router = express.Router();
    const prof = require('../controllers/profController');
    const { isAuthenticated, hasRole } = require('../middleware/auth');

    router.use(isAuthenticated);
    router.use(hasRole('prof'));

    router.get('/api/stats', prof.getStats);
    router.get('/api/chart-data', prof.getChartData);
    router.get('/api/profil', prof.getProfil);
    router.put('/api/profil', prof.updateProfil);
    router.get('/api/pointages', prof.getPointages);
    router.get('/api/cumul-pointages', prof.getCumulPointages);
    router.get('/api/edt', prof.getEDT);
    router.get('/api/ressources', prof.getRessources);
    router.post('/api/ressources', upload.single('fichier'), prof.createRessource);
    router.delete('/api/ressources/:id', prof.deleteRessource);
    router.get('/api/devoirs-rendus', prof.getDevoirsRendus);
    router.put('/api/devoirs-rendus/:id/noter', prof.noterDevoir);
    router.get('/api/exporter-devoirs', prof.exporterDevoirs);
    router.get('/api/notes', prof.getNotes);
    router.post('/api/notes', prof.saveNote);
    router.get('/api/messages', prof.getMessages);
    router.post('/api/messages', upload.single('fichier'), prof.sendMessage);
    router.get('/api/notifications', prof.getNotifications);
    router.put('/api/notifications/:id/read', prof.markNotificationRead);
    router.delete('/api/notifications', prof.viderNotificationsGeneral);
    router.get('/api/eleves', prof.getElevesList);
    router.get('/api/classes', prof.getClasses);
    router.get('/api/matieres', prof.getMatieres);

    return router;
};