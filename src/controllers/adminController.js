const userModel = require('../models/userModel');
const { ROLES } = require('../../constants');
const db = require('../models/db');

/**
 * Affiche la page d'administration avec la liste des utilisateurs et les statistiques.
 */
const renderAdmin = async (req, res) => {
  try {
    let users;
    let stats = {};

    // Si l'utilisateur est un administrateur, il ne voit que les utilisateurs de son établissement.
    if (req.user.role === ROLES.ADMINISTRATOR) {
      const establishmentUsers = await userModel.getUsersByEstablishmentId(req.user.establishment_id);
      users = establishmentUsers; // La liste principale reste celle des utilisateurs à gérer

      // Calculer les statistiques pour l'administrateur de l'établissement
      stats = {
        studentCount: establishmentUsers.filter(u => u.role === ROLES.STUDENT && u.approved).length,
        professorCount: establishmentUsers.filter(u => u.role === ROLES.PROFESSOR && u.approved).length,
        parentCount: establishmentUsers.filter(u => u.role === ROLES.PARENT && u.approved).length,
        pendingCount: establishmentUsers.filter(u => !u.approved).length
      };

      // La liste des utilisateurs à gérer inclut tout le monde dans l'établissement
      users = establishmentUsers;
      
      // Déterminer qui peut être supprimé
      const adminCount = users.filter(u => u.role === ROLES.ADMINISTRATOR).length;
      users = users.map(user => {
          let isDeletable = true;
          // On ne peut pas se supprimer soi-même
          if (user.id === req.user.id) {
              isDeletable = false;
          }
          // Si l'utilisateur est un admin et qu'il est le dernier, on ne peut pas le supprimer
          if (user.role === ROLES.ADMINISTRATOR && adminCount <= 1) {
              isDeletable = false;
          }
          return { ...user, isDeletable };
      });

    } 
    // Si c'est un super-admin, il voit la liste des administrateurs avec le compte d'utilisateurs de leur école.
    else if (req.user.role === ROLES.SUPER_ADMIN) {
      const admins = await userModel.getAllAdministrators();
      const establishmentIds = admins
        .map(admin => admin.establishment_id)
        .filter(id => id != null);

      let userCounts = {};
      if (establishmentIds.length > 0) {
        userCounts = await userModel.countApprovedUsersInEstablishments(establishmentIds);
      }

      // Compter le nombre d'admins par établissement pour déterminer s'ils sont supprimables
      const adminsPerEstablishment = admins.reduce((acc, admin) => {
          if (admin.establishment_id) {
              acc[admin.establishment_id] = (acc[admin.establishment_id] || 0) + 1;
          }
          return acc;
      }, {});

      users = admins.map(admin => {
        const isLastAdmin = admin.establishment_id ? adminsPerEstablishment[admin.establishment_id] <= 1 : false;
        return {
          ...admin,
          userCount: userCounts[admin.establishment_id] || 0,
          isDeletable: !isLastAdmin // Ajout de la propriété pour la vue
        };
      });

      // Calculer les statistiques globales pour le super-admin
      const totalUserCountResult = await db('users').where('approved', true).count('id as count').first();
      const professorCount = await userModel.countUsersByRole('professeur');
      const establishmentCountResult = await db('establishments').count('id as count').first();
      const pendingCount = await userModel.countPendingUsers();
      stats = {
          totalUserCount: totalUserCountResult ? Number(totalUserCountResult.count) : 0,
          professorCount,
          establishmentCount: establishmentCountResult ? Number(establishmentCountResult.count) : 0,
          pendingCount
      };

    } else {
      // Pour tout autre rôle non autorisé, on renvoie une liste vide par sécurité.
      users = [];
    }

    // Définition des widgets/raccourcis pour le tableau de bord de l'administrateur
    const allWidgets = [
      {
        title: 'Gestion des Utilisateurs',
        link: '/admin',
        icon: 'users',
        description: 'Approuver, modifier ou supprimer des comptes.',
        roles: [ROLES.SUPER_ADMIN, ROLES.ADMINISTRATOR]
      },
      {
        title: 'Gestion des Établissements',
        link: '/establishments',
        icon: 'briefcase',
        description: 'Ajouter ou gérer les établissements scolaires.',
        roles: [ROLES.SUPER_ADMIN]
      },
      {
        title: 'Gestion des Élèves',
        link: '/students',
        icon: 'user-check',
        description: 'Gérer les dossiers des élèves et leurs inscriptions.',
        roles: [ROLES.ADMINISTRATOR]
      },
      {
        title: 'Communication de masse',
        link: '/communications',
        icon: 'send',
        description: 'Envoyer des messages à des groupes d\'utilisateurs.',
        roles: [ROLES.SUPER_ADMIN, ROLES.ADMINISTRATOR]
      },
      {
        title: 'Gestion des Paiements',
        link: '#', // Lien temporaire
        icon: 'credit-card',
        description: 'Suivre les frais de scolarité. (Bientôt disponible)',
        roles: [ROLES.ADMINISTRATOR]
      },
      {
        title: 'Paramètres',
        link: '#', // Lien temporaire
        icon: 'settings',
        description: 'Configurer les paramètres. (Bientôt disponible)',
        roles: [ROLES.SUPER_ADMIN, ROLES.ADMINISTRATOR]
      }
    ];

    const availableWidgets = allWidgets.filter(widget => widget.roles.includes(req.user.role));

    res.render('admin', {
      title: 'Tableau de bord Administrateur',
      users: users,
      currentUser: req.user,
      widgets: availableWidgets,
      stats: stats
    });
  } catch (error) {
    console.error('Erreur lors du chargement de la page admin:', error);
    req.flash('error_msg', "Impossible de charger la page d'administration.");
    // En cas d'erreur, on affiche le tableau de bord générique avec un message d'erreur
    // au lieu de rediriger, pour éviter les boucles de redirection.
    res.status(500).render('dashboard', {
      title: 'Erreur',
      user: req.user,
      widgets: []
    });
  }
};

/**
 * Approuve un utilisateur.
 */
const approveUser = async (req, res) => {
  const { id } = req.params;
  try {
    const userToApprove = await userModel.getUserById(id);
    if (!userToApprove) {
      req.flash('error_msg', 'Utilisateur introuvable.');
      return res.redirect('/admin');
    }

    await userModel.approveUserById(id);

    // --- Mise à jour en temps réel pour la page d'accueil ---
    const broadcastDashboardStats = req.app.get('broadcastDashboardStats');
    if (broadcastDashboardStats) {
      broadcastDashboardStats();
    }

    // --- Mise à jour en temps réel pour le super-admin ---
    if (userToApprove.establishment_id) {
      const establishmentId = userToApprove.establishment_id;
      const counts = await userModel.countApprovedUsersInEstablishments([establishmentId]);
      const count = counts[establishmentId] || 0;
      
      const io = req.app.get('io');
      io.emit('establishmentUserCountUpdate', { establishmentId, count });
    }

    req.flash('success_msg', `Le compte de ${userToApprove.name} a été approuvé.`);
    res.redirect(req.get('Referrer') || '/admin');
  } catch (error) {
    console.error(`Erreur lors de l'approbation de l'utilisateur ${id}:`, error);
    req.flash('error_msg', 'Une erreur est survenue lors de l\'approbation.');
    res.redirect('/admin');
  }
};

/**
 * Supprime un utilisateur.
 */
const deleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    const userToDelete = await userModel.getUserById(id);
    if (!userToDelete) {
      req.flash('error_msg', 'Utilisateur introuvable.');
      return res.redirect('/admin');
    }

    // --- SÉCURITÉ CÔTÉ SERVEUR ---
    // Empêcher la suppression du dernier administrateur d'un établissement.
    if (userToDelete.role === ROLES.ADMINISTRATOR && userToDelete.establishment_id) {
        // On compte combien d'admins (approuvés ou non) sont dans l'établissement.
        const adminCount = await userModel.countAdminsInEstablishment(userToDelete.establishment_id);
        if (adminCount <= 1) {
            req.flash('error_msg', `Impossible de supprimer le dernier administrateur (${userToDelete.name}) de cet établissement.`);
            return res.redirect(req.get('Referrer') || '/admin');
        }
    }

    await userModel.deleteUserById(id);

    // --- Mise à jour en temps réel pour la page d'accueil ---
    const broadcastDashboardStats = req.app.get('broadcastDashboardStats');
    if (broadcastDashboardStats) {
      broadcastDashboardStats();
    }

    req.flash('success_msg', `Le compte de ${userToDelete.name} a été supprimé.`);
    res.redirect(req.get('Referrer') || '/admin');
  } catch (error) {
    console.error(`Erreur lors de la suppression de l'utilisateur ${id}:`, error);
    req.flash('error_msg', 'Une erreur est survenue lors de la suppression.');
    res.redirect('/admin');
  }
};

module.exports = {
  renderAdmin,
  approveUser,
  deleteUser
};