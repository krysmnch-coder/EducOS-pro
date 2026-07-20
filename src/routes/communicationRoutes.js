const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/authMiddleware');
const communicationController = require('../controllers/communicationController');

// La route principale pour afficher la page des communications
router.get('/', ensureAuthenticated, communicationController.listMessages);
// La route pour gérer l'envoi du formulaire
router.post('/send', ensureAuthenticated, communicationController.sendMessage);
// La route pour supprimer un message reçu
router.post('/delete/:id', ensureAuthenticated, communicationController.deleteMessage);

module.exports = router;