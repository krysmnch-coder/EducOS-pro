const express = require('express');
const router = express.Router();
const passport = require('passport');
const authController = require('../controllers/authController');
const { isNotAuthenticated } = require('../middleware/auth');

// Page de connexion
router.get('/login', isNotAuthenticated, (req, res) => {
    res.render('auth/login', {
        title: 'Connexion | EducOS-pro',
        error: req.query.error || null,
        success: req.query.success || null
    });
});

// Page d'inscription
router.get('/register', isNotAuthenticated, (req, res) => {
    res.render('auth/register', {
        title: 'Inscription | EducOS-pro',
        error: req.query.error || null
    });
});

// Traitement inscription admin
router.post('/register-admin', authController.registerAdmin);

// Traitement inscription utilisateur
router.post('/register', authController.register);

// Traitement connexion
router.post('/login', authController.login);

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { failureRedirect: '/auth/login?error=Erreur Google' }), (req, res) => {
    req.session.user = { id: req.user.id, email: req.user.email, nom: req.user.nom, prenom: req.user.prenom, role: req.user.role };
    res.redirect('/dashboard');
});

// Facebook OAuth
router.get('/facebook', passport.authenticate('facebook', { scope: ['public_profile'] }));
router.get('/facebook/callback', passport.authenticate('facebook', { failureRedirect: '/auth/login?error=Erreur Facebook' }), (req, res) => {
    req.session.user = { id: req.user.id, email: req.user.email, nom: req.user.nom, prenom: req.user.prenom, role: req.user.role };
    res.redirect('/dashboard');
});

// Déconnexion
router.get('/logout', authController.logout);

module.exports = router;