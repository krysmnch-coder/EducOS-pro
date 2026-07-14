const bcrypt = require('bcrypt');
const passport = require('passport');
const { getUserByEmail, createUser, updateUserAvatar, updateUserInfo, countAllUsers, countUsersInEstablishment, updateUserPassword } = require('../models/userModel');
const { signToken } = require('../../jwt-config');
const { ROLES } = require('../../constants');
const establishmentModel = require('../models/establishmentModel');
const db = require('../models/db');

const renderHome = (req, res) => {
  res.render('home', { title: 'Accueil | EducOS-pro' });
};

const renderLogin = async (req, res) => {
  try {
    const establishments = await establishmentModel.getAll();
    res.render('login', { 
      title: 'Connexion | EducOS-pro',
      establishments: establishments
    });
  } catch (error) {
    res.render('login', { title: 'Connexion | EducOS-pro', establishments: [] });
  }
};

const renderRegister = async (req, res) => {
  try {
    const establishments = await establishmentModel.getAll();
    res.render('register', { title: 'Inscription | EducOS-pro', establishments: establishments });
  } catch (error) {
    res.render('register', { title: 'Inscription | EducOS-pro', establishments: [] });
  }
};

const renderDashboard = (req, res) => {
  if (!req.isAuthenticated()) {
    req.flash('error_msg', 'Veuillez vous connecter pour accéder à votre tableau de bord.');
    return res.redirect('/login');
  }

  const role = req.user.role;
  // Définition des widgets avec plus de détails (icônes de feathericons.com)
  const widgets = {
    [ROLES.SUPER_ADMIN]: [
      { title: 'Gérer les Établissements', text: 'Ajouter ou modifier des écoles.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>', link: '/establishments' },
    ],
    [ROLES.ADMINISTRATOR]: [
      { title: 'Gestion des Utilisateurs', text: 'Approuver et gérer les comptes.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>', link: '/admin' },
      { title: 'Statistiques Globales', text: 'Visualiser l’activité de la plateforme.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>', link: '/stats' },
      { title: 'Communications', text: 'Envoyer des messages et annonces.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>', link: '/communications' },
      { title: 'Configuration', text: 'Paramètres généraux du système.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>', link: '/settings' }
    ],
    [ROLES.PROFESSOR]: [
      { title: 'Gestion des Notes', text: 'Saisir et consulter les évaluations.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>', link: '/grades' },
      { title: 'Mes Classes', text: 'Accéder aux listes d’élèves.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>', link: '/classes' },
      { title: 'Mon Emploi du Temps', text: 'Consulter votre planning de cours.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>', link: '/schedule' },
      { title: 'Communications', text: 'Échanger avec élèves et parents.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>', link: '/communications' }
    ],
    [ROLES.PARENT]: [
      { title: 'Suivi de mes Enfants', text: 'Consulter notes et absences.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>', link: '/children' },
      { title: 'Messagerie', text: 'Communiquer avec l’équipe pédagogique.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>', link: '/communications' },
      { title: 'Calendrier Scolaire', text: 'Voir les dates importantes.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>', link: '/schedule' },
      { title: 'Documents', text: 'Télécharger les bulletins et certificats.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>', link: '/documents' }
    ],
    [ROLES.STUDENT]: [
      { title: 'Mes Notes', text: 'Consulter mes résultats et moyennes.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>', link: '/grades' },
      { title: 'Mon Emploi du Temps', text: 'Voir mon planning et mes absences.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>', link: '/schedule' },
      { title: 'Messagerie', text: 'Échanger avec les professeurs.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>', link: '/communications' },
      { title: 'Ressources', text: 'Accéder aux supports de cours.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>', link: '/resources' }
    ],
    [ROLES.SECRETARY]: [
      { title: 'Gestion des Dossiers', text: 'Accéder aux informations des élèves.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>', link: '/students' },
      { title: 'Inscriptions', text: 'Gérer les nouvelles demandes.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>', link: '/admin' },
      { title: 'Communications', text: 'Diffuser des informations générales.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>', link: '/communications' },
      { title: 'Certificats', text: 'Générer des certificats de scolarité.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>', link: '/certificates' }
    ],
    [ROLES.SCHOOL_LIFE_MANAGER]: [
      { title: 'Gestion des Absences', text: 'Suivre et justifier les absences.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="18" y1="8" x2="23" y2="13"></line><line x1="23" y1="8" x2="18" y2="13"></line></svg>', link: '/absences' },
      { title: 'Incidents & Comportement', text: 'Gérer le suivi disciplinaire.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>', link: '/discipline' },
      { title: 'Communications', text: 'Envoyer des annonces ciblées.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>', link: '/communications' },
      { title: 'Événements', text: 'Organiser les événements scolaires.', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>', link: '/events' }
    ]
  };

  res.render('dashboard', {
    title: 'Tableau de bord | EducOS-pro',
    user: req.user,
    // Fournir un ensemble de widgets par défaut si le rôle n'est pas trouvé
    widgets: widgets[role] || widgets[ROLES.STUDENT]
  });
};

const renderProfile = (req, res) => {
  res.render('profile', {
    title: 'Mon Profil | EducOS-pro',
    user: req.user
  });
};

const renderForceChangePassword = (req, res) => {
  res.render('force-change-password', {
    title: 'Changement de mot de passe obligatoire',
    user: req.user,
  });
};

const postForceChangePassword = async (req, res) => {
  const { password, password2 } = req.body;
  const userId = req.user.id;

  if (password !== password2) {
    req.flash('error_msg', 'Les mots de passe ne correspondent pas.');
    return res.redirect('/force-change-password');
  }

  if (password.length < 6) {
    req.flash('error_msg', 'Le mot de passe doit contenir au moins 6 caractères.');
    return res.redirect('/force-change-password');
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    // Cette fonction met à jour le mot de passe et met le flag à false
    await updateUserPassword(userId, hashedPassword);

    req.flash('success_msg', 'Votre mot de passe a été mis à jour avec succès. Vous pouvez maintenant utiliser l\'application.');
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Erreur lors du changement de mot de passe forcé:', error);
    req.flash('error_msg', 'Une erreur est survenue.');
    res.redirect('/force-change-password');
  }
};

const updateProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      req.flash('error_msg', 'Aucun fichier sélectionné.');
      return res.redirect('/profile');
    }

    // NOTE: Pour optimiser, vous pourriez utiliser une librairie comme 'sharp' ici
    // pour redimensionner l'image avant de la sauvegarder.

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    // La fonction updateUserAvatar est à créer dans votre userModel.js
    await updateUserAvatar(req.user.id, avatarUrl);

    // Mettre à jour l'objet utilisateur dans la session pour un affichage immédiat
    req.user.avatar_url = avatarUrl;

    req.flash('success_msg', 'Votre photo de profil a été mise à jour.');
    res.redirect('/profile');
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la photo de profil:', error);
    req.flash('error_msg', 'Une erreur est survenue lors de la mise à jour.');
    res.redirect('/profile');
  }
};

const updateProfileInfo = async (req, res) => {
  try {
    const { name, phone_number } = req.body;
    const userId = req.user.id;

    if (!name) {
      req.flash('error_msg', 'Le nom ne peut pas être vide.');
      return res.redirect('/profile');
    }

    await updateUserInfo(userId, { name, phone_number });

    // Mettre à jour l'objet utilisateur dans la session
    req.user.name = name;
    req.user.phone_number = phone_number;

    req.flash('success_msg', 'Votre profil a été mis à jour.');
    res.redirect('/profile');
  } catch (error) {
    console.error('Erreur lors de la mise à jour du profil:', error);
    req.flash('error_msg', 'Une erreur est survenue lors de la mise à jour du profil.');
    res.redirect('/profile');
  }
};

const getApiToken = (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentification requise.' });
  }

  const payload = {
    id: req.user.id,
    email: req.user.email,
    role: req.user.role
  };

  const token = signToken(payload);
  res.json({ token });
};

const postRegister = async (req, res) => {
  try {
    const {
      establishment_id,
      name,
      email,
      password,
      password2,
      role,
      subject,
      student_class,
      matricule,
      children
    } = req.body;
    const errors = [];

    const totalUserCount = await countAllUsers();
    console.log(`[DEBUG] Nombre total d'utilisateurs détectés : ${totalUserCount}`);
    const isFirstUser = totalUserCount === 0;

    // --- Validation améliorée ---
    if (!name) {
        errors.push('Le champ "Nom complet" est obligatoire.');
    }
    if (!email) {
        errors.push('Le champ "Adresse e-mail" est obligatoire.');
    }
    if (!password) {
        errors.push('Le champ "Mot de passe" est obligatoire.');
    }
    if (!password2) {
        errors.push('Le champ "Confirmation" du mot de passe est obligatoire.');
    }
    if (!role) {
        errors.push('Veuillez sélectionner un rôle.');
    }
    // L'établissement est requis, sauf pour le tout premier utilisateur.
    if (!isFirstUser && !establishment_id) {
        errors.push('Veuillez sélectionner un établissement.');
    }

    if (password !== password2) {
      errors.push('Les mots de passe ne correspondent pas.');
    }
    if (password.length < 6) {
      errors.push('Le mot de passe doit contenir au moins 6 caractères.');
    }

    if (role === ROLES.PROFESSOR && !subject) {
      errors.push('La matière est requise pour un professeur.');
    }
    if (role === ROLES.STUDENT && (!student_class || !matricule)) {
      errors.push('La classe et le matricule sont requis pour un élève.');
    }

    let childrenData = [];
    if (role === ROLES.PARENT) {
      if (!children) {
        childrenData = [];
      } else if (typeof children === 'string') {
        try {
          childrenData = JSON.parse(children);
        } catch (parseError) {
          childrenData = [];
        }
      } else if (Array.isArray(children)) {
        childrenData = children;
      } else if (typeof children === 'object') {
        childrenData = Object.values(children);
      }

      if (childrenData.length === 0) {
        errors.push('Au moins un enfant est requis pour un parent.');
      } else {
        childrenData.forEach((child, index) => {
          if (!child.first_name || !child.last_name || !child.student_class || !child.matricule) {
            errors.push(`Tous les champs de l'enfant ${index + 1} sont requis.`);
          }
        });
      }
    }

    if (errors.length > 0) {
      req.flash('error_msg', errors.join(' '));
      return res.redirect('/register');
    }

    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      req.flash('error_msg', 'Cette adresse e-mail est déjà utilisée.');
      return res.redirect('/register');
    }

    let approvedStatus = 0;
    let finalRole = role;
    let flashMessage;
    
    if (isFirstUser) {
      // C'est le tout premier utilisateur qui s'inscrit. On le promeut SUPER_ADMIN.
      finalRole = ROLES.SUPER_ADMIN;
      approvedStatus = 1;
      flashMessage = 'Bienvenue ! Votre compte super-administrateur a été créé et approuvé. Vous pouvez vous connecter.';
    } else {
      // Ce n'est pas le super-admin. Vérifions si c'est le premier ADMINISTRATEUR pour cet établissement.
      const usersInEstablishment = await countUsersInEstablishment(establishment_id);
      if (usersInEstablishment === 0 && role === ROLES.ADMINISTRATOR) {
        // C'est le premier utilisateur ET il s'inscrit en tant qu'admin.
        approvedStatus = 1;
        flashMessage = 'Bienvenue ! Votre compte administrateur a été créé et approuvé automatiquement pour ce nouvel établissement.';
      } else {
        // Dans tous les autres cas (premier utilisateur mais pas admin, ou pas le premier utilisateur)
        flashMessage = 'Votre compte a été créé. Il doit être validé par un administrateur avant la connexion.';
      }
    }

    // Utilisation d'une transaction pour garantir l'atomicité de la création du parent et des liens enfants.
    await db.transaction(async trx => {
      const hashedPassword = await bcrypt.hash(password, 10);

      // 1. Créer l'utilisateur (parent ou autre)
      const [newUserIdObj] = await createUser({
        name,
        email,
        password: hashedPassword,
        role: finalRole,
        establishment_id: isFirstUser ? null : establishment_id,
        approved: approvedStatus,
        subject: role === ROLES.PROFESSOR ? subject : null,
        student_class: role === ROLES.STUDENT ? student_class : null,
        matricule: role === ROLES.STUDENT ? matricule : null,
        // La colonne 'children' est maintenant obsolète pour cette logique.
        avatar_url: '/img/user.png'
      }, trx); // On passe la transaction au modèle

      const newUserId = newUserIdObj.id || newUserIdObj;

      // 2. Si c'est un parent, on insère les liens vers les enfants dans la table dédiée.
      if (role === ROLES.PARENT && childrenData.length > 0) {
        const childrenLinks = childrenData.map(child => ({
          parent_id: newUserId,
          student_first_name: child.first_name,
          student_last_name: child.last_name,
          student_matricule: child.matricule,
          student_class: child.student_class,
        }));
        await trx('parent_student_links').insert(childrenLinks);
      }
    });

    const broadcastDashboardStats = req.app.get('broadcastDashboardStats');
    if (typeof broadcastDashboardStats === 'function') {
      broadcastDashboardStats();
    }
    req.flash('success_msg', flashMessage);
    res.redirect('/login');
  } catch (error) {
    console.error(error);
    req.flash('error_msg', 'Erreur lors de la création du compte.');
    res.redirect('/register');
  }
};

const postLogin = (req, res, next) => {
  // La logique de connexion doit aussi prendre en compte l'établissement.
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      req.flash('error_msg', info?.message || 'Échec de la connexion.');
      return res.redirect('/login');
    }
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        return next(loginErr);
      }
      // Redirection améliorée en fonction du rôle
      let redirectPath = '/dashboard';
      if (user.role === ROLES.SUPER_ADMIN) {
        redirectPath = '/establishments';
      } else if (user.role === ROLES.ADMINISTRATOR) {
        redirectPath = '/admin';
      }
      return res.redirect(redirectPath);
    });
  })(req, res, next);
};

const logout = (req, res) => {
  req.logout(() => {
    req.flash('success_msg', 'Vous êtes déconnecté.');
    res.redirect('/login');
  });
};

const socialLogin = (req, res) => {
  const provider = req.params.provider;
  req.flash('info', `Connexion ${provider} non implémentée pour l’instant.`);
  res.redirect('/login');
};

module.exports = {
  renderHome,
  renderLogin,
  renderRegister,
  renderDashboard,
  postRegister,
  postLogin,
  logout,
  socialLogin,
  getApiToken,
  renderProfile,
  updateProfilePicture,
  updateProfileInfo,
  renderForceChangePassword,
  postForceChangePassword
};
