// Fichier : src/controllers/authController.js (APRÈS la migration)

const passport = require('passport');
const db = require('../models/db'); // NOUVELLE instance Knex partagée
const bcrypt = require('bcrypt');
const { ROLES } = require('../../constants'); // Bonne pratique : utiliser des constantes pour les rôles
const establishmentModel = require('../models/establishmentModel');
const userModel = require('../models/userModel');
const crypto = require('crypto');
const adminController = require('./adminController');
const { validateEmail } = require('../utils/emailValidationService');
const { sendPasswordResetEmail } = require('../utils/emailService');

/**
 * Affiche la page d'accueil ou redirige vers le tableau de bord si l'utilisateur est connecté.
 */
exports.renderHome = (req, res) => {
  // Modification : La page d'accueil publique est maintenant accessible même si l'utilisateur est connecté,
  // pour répondre à la demande de ne pas être systématiquement redirigé vers le tableau de bord.
  // if (req.isAuthenticated()) {
  //   return res.redirect('/dashboard');
  // }
  res.render('home', {
      title: 'Accueil | EducOS-pro'
  });
};

/**
 * Affiche la page "mot de passe oublié".
 */
exports.renderForgotPassword = (req, res) => {
  res.render('forgot-password', {
    title: 'Mot de passe oublié | EducOS-pro'
  });
};

/**
 * Gère la demande de réinitialisation de mot de passe.
 */
exports.postForgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await db('users').where({ email }).first();

    // Important : On envoie un message de succès même si l'utilisateur n'existe pas
    // pour ne pas permettre de deviner les e-mails enregistrés (email enumeration).
    if (user) {
      // 1. Générer un jeton sécurisé
      const token = crypto.randomBytes(20).toString('hex');

      // 2. Définir une date d'expiration (1 heure à partir de maintenant)
      const expires = new Date(Date.now() + 3600000);

      // 3. Sauvegarder le jeton et l'expiration pour l'utilisateur
      await db('users').where({ id: user.id }).update({
        password_reset_token: token,
        password_reset_expires: expires,
      });

      // 4. Envoyer l'e-mail
      await sendPasswordResetEmail(user.email, token);
    }

    req.flash('success_msg', 'Si un compte est associé à cet e-mail, un lien de réinitialisation a été envoyé.');
    res.redirect('/forgot-password');
  } catch (error) {
    console.error('Erreur lors de la demande de réinitialisation:', error);
    req.flash('error_msg', 'Une erreur est survenue.');
    res.redirect('/forgot-password');
  }
};

/**
 * Affiche la page pour entrer le nouveau mot de passe.
 */
exports.renderResetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const user = await db('users')
      .where({ password_reset_token: token })
      .andWhere('password_reset_expires', '>', new Date())
      .first();

    if (!user) {
      req.flash('error_msg', 'Le jeton de réinitialisation est invalide ou a expiré.');
      return res.redirect('/forgot-password');
    }

    res.render('reset-password', {
      title: 'Réinitialiser le mot de passe',
      token: token
    });
  } catch (error) {
    console.error('Erreur lors de l\'affichage de la page de réinitialisation:', error);
    req.flash('error_msg', 'Une erreur est survenue.');
    res.redirect('/forgot-password');
  }
};

/**
 * Gère la soumission du nouveau mot de passe.
 */
exports.postResetPassword = async (req, res) => {
  // Cette fonction est très similaire à `postForceChangePassword`.
  // On pourrait les fusionner à l'avenir pour éviter la duplication.
  await exports.postForceChangePassword(req, res, `/reset-password/${req.params.token}`);
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
            // Affiche le tableau de bord dédié aux administrateurs.
            return adminController.renderAdminDashboard(req, res);
        default:
            // Pour tous les autres rôles, on crée un tableau de bord générique avec des widgets spécifiques.
            const allWidgets = [
                // --- PARENT ---
                { title: "Choix de l'enfant", link: '/students', icon: 'users', description: "Sélectionner l'enfant à suivre.", roles: [ROLES.PARENT] },
                { title: "Notes de l'enfant", link: '/student/grades', icon: 'award', description: "Consulter les notes et appréciations.", roles: [ROLES.PARENT] },
                { title: "Documents Scolaires", link: '/student/documents', icon: 'file-text', description: "Télécharger les certificats et autres documents.", roles: [ROLES.PARENT] },

                // --- VIE SCOLAIRE ---
                { title: "Gestion du Calendrier", link: '/school-life/calendar', icon: 'calendar', description: "Définir les événements et vacances.", roles: [ROLES.SCHOOL_LIFE_MANAGER] },
                { title: "Emplois du Temps", link: '/school-life/timetables', icon: 'clock', description: "Gérer les emplois du temps des classes.", roles: [ROLES.SCHOOL_LIFE_MANAGER] },
                { title: "Gestion des Absences", link: '/school-life/absences', icon: 'user-x', description: "Suivre et justifier les absences des élèves.", roles: [ROLES.SCHOOL_LIFE_MANAGER] },

                // --- SECRETAIRE ---
                { title: "Liste des Élèves", link: '/students', icon: 'users', description: "Consulter et gérer la liste des élèves.", roles: [ROLES.SECRETARY] },
                { title: "Suivi des Paiements", link: '/secretary/payments', icon: 'dollar-sign', description: "Suivre les frais de scolarité et paiements.", roles: [ROLES.SECRETARY] },
                { title: "Documents Scolaires", link: '/secretary/documents', icon: 'archive', description: "Générer et archiver les certificats.", roles: [ROLES.SECRETARY] },

                // --- PROFESSEUR ---
                { title: "Saisie des Notes", link: '/professor/grades', icon: 'edit', description: "Entrer et modifier les notes des élèves.", roles: [ROLES.PROFESSOR] },
                { title: "Ressources Pédagogiques", link: '/professor/resources', icon: 'book-open', description: "Partager des cours et des exercices.", roles: [ROLES.PROFESSOR] },
                { title: "Cahier de Texte", link: '/professor/logbook', icon: 'book', description: "Renseigner le contenu des séances.", roles: [ROLES.PROFESSOR] },

                // --- ELEVE ---
                { title: "Mes Notes", link: '/student/grades', icon: 'award', description: "Consulter mes notes et classements.", roles: [ROLES.STUDENT] },
                { title: "Ressources de Cours", link: '/student/resources', icon: 'book-open', description: "Accéder aux documents partagés par les professeurs.", roles: [ROLES.STUDENT] },
                { title: "Mon Emploi du Temps", link: '/student/timetable', icon: 'clock', description: "Voir mon emploi du temps de la semaine.", roles: [ROLES.STUDENT] },
            ];

            const availableWidgets = allWidgets.filter(widget => widget.roles.includes(user.role));

            return res.render('dashboard', { 
                title: 'Tableau de bord | EducOS-pro', 
                user: req.user,
                widgets: availableWidgets 
            });
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
    // ÉTAPE 0 : Valider l'adresse e-mail avec Mailboxlayer
    const emailValidation = await validateEmail(email);
    // On bloque si l'e-mail est invalide, mais on laisse passer en cas d'erreur de l'API pour ne pas pénaliser l'utilisateur.
    if (!emailValidation.isValid && emailValidation.reason !== 'api_error' && emailValidation.reason !== 'request_failed') {
        req.flash('error_msg', `L'adresse e-mail est invalide : ${emailValidation.reason}`);
        return res.redirect('/register');
    }

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

    // --- Mise à jour en temps réel pour les tableaux de bord admin ---
    const broadcastAdminStats = req.app.get('broadcastAdminStats');
    if (broadcastAdminStats) {
      broadcastAdminStats({ establishmentId: establishment_id });
    }

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
exports.postForceChangePassword = async (req, res, redirectUrl = '/force-change-password') => {
    const { password, confirm_password } = req.body;
    const { token } = req.params;
    let user;

    if (password !== confirm_password) {
        req.flash('error_msg', 'Les mots de passe ne correspondent pas.');
        return res.redirect(redirectUrl);
    }

    if (password.length < 6) {
        req.flash('error_msg', 'Le mot de passe doit contenir au moins 6 caractères.');
        return res.redirect(redirectUrl);
    }

    try {
        if (token) {
            // Cas d'un reset de mot de passe oublié
            user = await db('users')
                .where({ password_reset_token: token })
                .andWhere('password_reset_expires', '>', new Date())
                .first();
            if (!user) {
                req.flash('error_msg', 'Le jeton de réinitialisation est invalide ou a expiré.');
                return res.redirect('/forgot-password');
            }
        } else if (req.user) {
            // Cas d'un changement de mot de passe forcé après connexion
            user = req.user;
        } else {
            // Aucun contexte pour changer le mot de passe
            req.flash('error_msg', 'Action non autorisée.');
            return res.redirect('/login');
        }

        const userId = user.id;
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
        res.redirect(redirectUrl);
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