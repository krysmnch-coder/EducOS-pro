const express = require('express');
const router = express.Router();
const { 
  renderChat,
  getMessages,
  getUnreadApi,
  getConversations
} = require('../controllers/chatController');
const { isAuthenticated: ensureAuthenticated } = require('../middleware/authMiddleware');

// Page principale du chat
router.get('/', ensureAuthenticated, renderChat);

// API - Récupérer les messages d'une conversation
router.get('/api/messages/:userId', ensureAuthenticated, getMessages);

// API - Récupérer le nombre de messages non lus
router.get('/api/unread', ensureAuthenticated, getUnreadApi);

// API - Récupérer les conversations
router.get('/api/conversations', ensureAuthenticated, getConversations);

module.exports = router;