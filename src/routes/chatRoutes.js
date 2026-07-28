const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// Middleware d'authentification
const isAuthenticated = (req, res, next) => {
    if (req.user) {
        return next();
    }
    // Si la requête attend du JSON (API)
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(401).json({ 
            success: false,
            error: 'Non authentifié' 
        });
    }
    // Sinon rediriger vers la page de login
    res.redirect('/login');
};

// ==========================================================================
// Routes du chat
// ==========================================================================

// Page principale du chat
router.get('/chat', isAuthenticated, chatController.renderChat);

// API - Récupérer la liste des conversations
router.get('/api/conversations', isAuthenticated, chatController.getConversations);

// API - Récupérer les messages d'une conversation
router.get('/api/messages/:userId', isAuthenticated, chatController.getMessages);

// API - Nombre de messages non lus (pour le badge)
router.get('/api/unread', isAuthenticated, chatController.getUnreadApi);

module.exports = router;