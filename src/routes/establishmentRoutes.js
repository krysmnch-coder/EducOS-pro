const express = require('express');
const router = express.Router();
const establishmentController = require('../controllers/establishmentController');
const { isAuthenticated, hasRole } = require('../middleware/authMiddleware');
const { ROLES } = require('../../constants');

// Protège toutes les routes de ce fichier : il faut être connecté ET être superadmin.
router.use(isAuthenticated, hasRole(ROLES.SUPER_ADMIN));

// GET /establishments - Affiche la page de gestion
router.get('/', establishmentController.renderManagementPage);

// POST /establishments - Crée un nouvel établissement
router.post('/', establishmentController.createEstablishment);

// POST /establishments/:id/update - Gère la mise à jour
router.post('/:id/update', establishmentController.updateEstablishment);

// POST /establishments/:id/delete - Gère la suppression
router.post('/:id/delete', establishmentController.deleteEstablishment);

module.exports = router;