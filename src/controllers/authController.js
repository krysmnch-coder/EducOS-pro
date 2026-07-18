// Fichier : src/controllers/authController.js (APRÈS la migration)

const passport = require('passport');
const db = require('../models/db'); // NOUVELLE instance Knex partagée
const bcrypt = require('bcrypt');
const { ROLES } = require('../../constants'); // Bonne pratique : utiliser des constantes pour les rôles
const establishmentModel = require('../models/establishmentModel');
const userModel = require('../models/userModel');

/**
 * Affiche la page de connexion.
 */
exports.renderLoginPage = (req, res) => {
  // Si l'utilisateur est déjà connecté, on le redirige vers le tableau de bord.
  if (req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }
  res.render('login', {
    title: 'Connexion | EducOS-pro'
  });
};

/**
 * Gère la soumission du formulaire de connexion en utilisant la stratégie Passport.
 */
exports.loginUser = passport.authenticate('local', {
  successRedirect: '/dashboard',
  failureRedirect: '/login',
  failureFlash: true // Active les messages flash en cas d'échec
});

/**
 * Affiche la page d'inscription avec la liste des établissements.
 */
exports.renderRegisterPage = async (req, res) => {
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
 * Ce code est portable entre SQLite et PostgreSQL.
 */
exports.registerUser = async (req, res) => {
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
exports.logoutUser = (req, res, next) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    req.flash('success_msg', 'Vous êtes maintenant déconnecté.');
    res.redirect('/login');
  });
};

/**
 * Affiche la page de changement de mot de passe forcé.
 */
exports.renderForceChangePasswordPage = (req, res) => {
    res.render('force-change-password', {
        title: 'Changer votre mot de passe'
    });
};

/**
 * Gère la soumission du formulaire de changement de mot de passe forcé.
 */
exports.handleForceChangePassword = async (req, res) => {
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