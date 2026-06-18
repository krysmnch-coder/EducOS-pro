const express = require('express');
const router = express.Router();
const passport = require('passport');
const authController = require('../controllers/authController');
const { isNotAuthenticated } = require('../middleware/auth');

// Pages
router.get('/login', isNotAuthenticated, (req, res) => {
    res.render('auth/login', { title: 'Connexion | EducOS-pro', error: req.query.error || null, success: req.query.success || null });
});

router.get('/register', isNotAuthenticated, (req, res) => {
    res.render('auth/register', { title: 'Inscription | EducOS-pro', error: req.query.error || null });
});

// Actions
router.post('/register', authController.register);
router.post('/login', authController.login);

// Google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { failureRedirect: '/auth/login?error=Erreur Google' }), (req, res) => {
    req.session.user = { id: req.user.id, email: req.user.email, nom: req.user.nom, prenom: req.user.prenom, role: req.user.role, photo: req.user.photo };
    res.redirect('/dashboard');
});

// Facebook
router.get('/facebook', passport.authenticate('facebook', { scope: ['public_profile'] }));
router.get('/facebook/callback', passport.authenticate('facebook', { failureRedirect: '/auth/login?error=Erreur Facebook' }), (req, res) => {
    req.session.user = { id: req.user.id, email: req.user.email, nom: req.user.nom, prenom: req.user.prenom, role: req.user.role, photo: req.user.photo };
    res.redirect('/dashboard');
});

// Logout
router.get('/logout', authController.logout);

router.post('/register-admin', authController.registerAdmin);

module.exports = router;