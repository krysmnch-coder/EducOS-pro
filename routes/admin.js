const express = require('express');

module.exports = function(upload) {
    const router = express.Router();
    const adminController = require('../controllers/adminController');
    const { isAuthenticated, hasRole } = require('../middleware/auth');

    router.use(isAuthenticated);
    router.use(hasRole('admin'));

    router.get('/api/stats', adminController.getStats);
    router.get('/api/chart-data', adminController.getChartData);
    router.get('/api/users', adminController.getUsers);
    router.post('/api/users', adminController.createUser);
    router.put('/api/users/:id', adminController.updateUser);
    router.delete('/api/users/:id', adminController.deleteUser);
    router.put('/api/users/:id/toggle-status', adminController.toggleUserStatus);
    router.post('/api/users/:id/reset-password', adminController.resetPassword);
    router.get('/api/etablissement', adminController.getEtablissement);
    router.put('/api/etablissement', adminController.updateEtablissement);
    router.get('/api/settings', adminController.getSettings);
    router.put('/api/settings', adminController.updateSettings);
    router.get('/api/paiements', adminController.getPaiements);
    router.get('/api/paiement-stats', adminController.getPaiementStats);
    router.post('/api/paiements', adminController.createPaiement);
    router.put('/api/paiements/:id', adminController.updatePaiement);
    router.delete('/api/paiements/:id', adminController.deletePaiement);
    router.get('/api/messages', adminController.getMessages);
    router.get('/api/messages/:id', adminController.getMessageDetail);
    router.post('/api/messages', upload.single('fichier'), adminController.sendMessage);
    router.get('/api/users-list', adminController.getUsersList);
    router.get('/api/notifications', adminController.getNotifications);
    router.put('/api/notifications/:id/read', adminController.markNotificationRead);
    router.delete('/api/notifications', adminController.viderNotificationsGeneral);

    return router;
};