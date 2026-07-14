const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isAuthenticated, hasRole } = require('../middleware/authMiddleware');
const { ROLES } = require('../../constants');

// Protège toutes les routes de cette section.
// Seuls les administrateurs et le super-administrateur peuvent y accéder.
router.use(isAuthenticated, hasRole([ROLES.ADMINISTRATOR, ROLES.SUPER_ADMIN]));

// Affiche la page principale d'administration (liste des utilisateurs ou des admins)
router.get('/', adminController.renderAdmin);

// Approuve un utilisateur
router.post('/users/:id/approve', adminController.approveUser);

// Supprime un utilisateur
router.post('/users/:id/delete', adminController.deleteUser);

module.exports = router;