const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const passport = require('passport');

const {
  renderHome,
  renderLogin,
  renderRegister,
  renderDashboard,
  postRegister,
  logout,
  socialLogin,
  getApiToken,
  renderProfile,
  updateProfilePicture,
  updateProfileInfo,
  renderForceChangePassword,
  postForceChangePassword
} = require('../controllers/authController');

const { ensureAuthenticated } = require('../../authMiddleware');

// Limiteur pour les tentatives de connexion
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // Fenêtre de 15 minutes
    max: 10, // Limite chaque adresse IP à 10 requêtes de connexion par fenêtre
    message: 'Trop de tentatives de connexion depuis cette adresse IP. Veuillez réessayer dans 15 minutes.',
    standardHeaders: true, // Envoie les informations de limite dans les en-têtes `RateLimit-*`
    legacyHeaders: false, // Désactive les anciens en-têtes `X-RateLimit-*`
});

// --- Configuration de Multer pour les avatars ---
const uploadsPath = path.join(__dirname, '..', '..', 'uploads');
const avatarsPath = path.join(uploadsPath, 'avatars');
if (!fs.existsSync(avatarsPath)) {
  fs.mkdirSync(avatarsPath, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, avatarsPath);
  },
  filename: (req, file, cb) => {
    // Le middleware ensureAuthenticated garantit que req.user existe ici
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `avatar-${req.user.id}-${uniqueSuffix}${extension}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // Limite de 2MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      return cb(null, true);
    }
    cb(new Error('Type de fichier non supporté. Uniquement les images sont autorisées.'));
  }
});

// --- Routes ---

// Routes publiques
router.get('/', renderHome);
router.get('/login', renderLogin);
router.post('/login', loginLimiter, passport.authenticate('local', {
  successRedirect: '/dashboard',
  failureRedirect: '/login',
  failureFlash: true
}));
router.get('/register', renderRegister);
router.post('/register', postRegister);

// Placeholders pour l'authentification sociale
router.get('/auth/:provider', socialLogin);
router.get('/auth/:provider/callback', socialLogin);

// Routes protégées
router.get('/dashboard', ensureAuthenticated, renderDashboard);
router.get('/logout', logout); // Supporte GET pour la déconnexion par lien

// Routes du profil utilisateur

// Route pour forcer le changement de mot de passe
router.get('/force-change-password', ensureAuthenticated, renderForceChangePassword);
router.post('/force-change-password', ensureAuthenticated, postForceChangePassword);

router.get('/profile', ensureAuthenticated, renderProfile);
router.post('/profile/avatar', ensureAuthenticated, avatarUpload.single('avatar'), updateProfilePicture);
router.post('/profile/update', ensureAuthenticated, updateProfileInfo);

// Route API pour le token
router.get('/api/token', ensureAuthenticated, getApiToken);

module.exports = router;