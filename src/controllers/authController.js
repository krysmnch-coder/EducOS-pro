// Fichier : src/controllers/authController.js (APRÈS la migration)

const passport = require('passport');
const db = require('../models/db'); // NOUVELLE instance Knex partagée
const bcrypt = require('bcrypt');
const { ROLES } = require('../../constants'); // Bonne pratique : utiliser des constantes pour les rôles
const establishmentModel = require('../models/establishmentModel');
const userModel = require('../models/userModel');

/**
 * Affiche la page d'accueil ou redirige vers le tableau de bord si l'utilisateur est connecté.
 */
exports.renderHome = (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }
  res.render('home', {
      title: 'Accueil | EducOS-pro'
  });
};

/**
 * Affiche la page de connexion.
 */
exports.renderLogin = async (req, res) => {
  // Si l'utilisateur est déjà connecté, on le redirige vers le tableau de bord.
  if (req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }
  try {
    const establishments = await establishmentModel.getAll();
    res.render('login', {
      title: 'Connexion | EducOS-pro',
      establishments: establishments
    });
  } catch (error) {
    console.error("Erreur lors de l'affichage de la page de connexion:", error);
    req.flash('error_msg', 'Impossible de charger la page de connexion.');
    res.redirect('/');
  }
};

/**
 * Redirige l'utilisateur vers le tableau de bord approprié en fonction de son rôle.
 */
exports.renderDashboard = (req, res) => {
    const user = req.user;
    // Le middleware ensureAuthenticated gère déjà le cas où l'utilisateur n'est pas connecté.

    switch (user.role) {
        case ROLES.SUPER_ADMIN:
        case ROLES.ADMINISTRATOR:
            // Redirige les administrateurs vers leur page de gestion dédiée.
            return res.redirect('/admin');
        default:
            // Affiche un tableau de bord générique pour les autres rôles.
            return res.render('dashboard', { title: 'Tableau de bord | EducOS-pro', user: req.user });
    }
};

/**
 * Affiche la page d'inscription avec la liste des établissements.
 */
exports.renderRegister = async (req, res) => {
  try {
    const establishments = await establishmentModel.getAll();
    res.render('register', {
      title: 'Inscription | EducOS-pro',
      establishments: establishments
    });
  } catch (error) {
    console.error("Erreur lors de l'affichage de la page d'inscription:", error);
    req.flash('error_msg', 'Impossible de charger la page.');
    res.redirect('/');
  }
};

/**
 * Gère l'inscription d'un nouvel utilisateur en utilisant Knex et async/await.
 */
exports.postRegister = async (req, res) => {
  // On récupère l'ID de l'établissement pour une architecture multi-tenant
  const { name, email, password, establishment_id } = req.body;

  try {
    // Étape 1 : Vérifier si l'utilisateur existe déjà.
    // .first() récupère le premier résultat ou undefined, c'est très pratique.
    const existingUser = await db('users').where({ email: email }).first();

    if (existingUser) {
      req.flash('error_msg', 'Cet email est déjà utilisé.');
      return res.redirect('/register');
    }

    // Étape 2 : Hasher le mot de passe. await simplifie la gestion de l'asynchronisme.
    const hashedPassword = await bcrypt.hash(password, 10);

    // Étape 3 : Insérer le nouvel utilisateur.
    // Knex gère la protection contre les injections SQL.
    await db('users').insert({
      name: name,
      email: email,
      password: hashedPassword,
      role: ROLES.PROFESSOR, // Utilisation de la constante depuis `constants.js`
      approved: false,      // Knex gère les booléens correctement
      establishment_id: establishment_id // Crucial pour séparer les données par établissement
    });

    req.flash('success_msg', 'Inscription réussie ! Votre compte est en attente d\'approbation.');
    res.redirect('/login');

  } catch (error) {
    console.error("Erreur lors de l'inscription :", error);
    req.flash('error_msg', 'Une erreur est survenue lors de l\'inscription.');
    res.redirect('/register');
  }
};

/**
 * Gère la déconnexion de l'utilisateur.
 */
exports.logout = (req, res, next) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    req.flash('success_msg', 'Vous êtes maintenant déconnecté.');
    res.redirect('/login');
  });
};

/**
 * Affiche la page de changement de mot de passe forcé.
 */
exports.renderForceChangePassword = (req, res) => {
    res.render('force-change-password', {
        title: 'Changer votre mot de passe'
    });
};

/**
 * Gère la soumission du formulaire de changement de mot de passe forcé.
 */
exports.postForceChangePassword = async (req, res) => {
    const { password, confirm_password } = req.body;
    const userId = req.user.id;

    if (password !== confirm_password) {
        req.flash('error_msg', 'Les mots de passe ne correspondent pas.');
        return res.redirect('/force-change-password');
    }

    if (password.length < 6) {
        req.flash('error_msg', 'Le mot de passe doit contenir au moins 6 caractères.');
        return res.redirect('/force-change-password');
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await userModel.updateUserPassword(userId, hashedPassword);

        req.flash('success_msg', 'Votre mot de passe a été mis à jour avec succès. Veuillez vous reconnecter.');
        
        // Déconnexion de l'utilisateur après le changement de mot de passe
        req.logout(function(err) {
            if (err) {
                console.error("Erreur lors de la déconnexion après changement de mdp:", err);
                return res.redirect('/');
            }
            res.redirect('/login');
        });
    } catch (error) {
        console.error('Erreur lors du changement de mot de passe forcé:', error);
        req.flash('error_msg', 'Une erreur est survenue.');
        res.redirect('/force-change-password');
    }
};

/**
 * Placeholder for social login.
 */
exports.socialLogin = (req, res) => {
    res.status(501).send('Social login not implemented.');
};

/**
 * Placeholder for API token retrieval.
 */
exports.getApiToken = (req, res) => {
    res.status(501).send('API token not implemented.');
};

/**
 * Renders the user profile page.
 */
exports.renderProfile = (req, res) => {
    res.render('profile', {
        title: 'Mon Profil | EducOS-pro',
        user: req.user
    });
};

/**
 * Updates the user's profile picture.
 */
exports.updateProfilePicture = async (req, res) => {
    if (!req.file) {
        req.flash('error_msg', 'Aucun fichier sélectionné.');
        return res.redirect('/profile');
    }
    try {
        // Le chemin doit être relatif au dossier 'public' pour être servi correctement.
        const avatarUrl = '/uploads/avatars/' + req.file.filename;
        await userModel.updateUserAvatar(req.user.id, avatarUrl);
        req.flash('success_msg', 'Photo de profil mise à jour.');
        res.redirect('/profile');
    } catch (error) {
        console.error('Erreur lors de la mise à jour de la photo de profil:', error);
        req.flash('error_msg', 'Erreur lors de la mise à jour de la photo.');
        res.redirect('/profile');
    }
};

/**
 * Updates user's profile information.
 */
exports.updateProfileInfo = async (req, res) => {
    const { name, phone_number } = req.body;
    try {
        await userModel.updateUserInfo(req.user.id, { name, phone_number });
        req.flash('success_msg', 'Informations mises à jour.');
        res.redirect('/profile');
    } catch (error) {
        console.error('Erreur lors de la mise à jour des informations:', error);
        req.flash('error_msg', 'Erreur lors de la mise à jour.');
        res.redirect('/profile');
    }
};