const userModel = require('../models/userModel');
const { ROLES } = require('../../constants');

/**
 * Affiche la page d'administration avec la liste des utilisateurs et les statistiques.
 */
const renderAdmin = async (req, res) => {
  try {
    let users;
    // Si l'utilisateur est un administrateur, il ne voit que les utilisateurs de son établissement.
    if (req.user.role === ROLES.ADMINISTRATOR) {
      users = await userModel.getUsersByEstablishmentId(req.user.establishment_id);
    } 
    // Si c'est un super-admin, il voit la liste des administrateurs avec le compte d'utilisateurs de leur école.
    else if (req.user.role === ROLES.SUPER_ADMIN) {
      const admins = await userModel.getAllAdministrators();
      const establishmentIds = admins
        .map(admin => admin.establishment_id)
        .filter(id => id != null);

      if (establishmentIds.length > 0) {
        const userCounts = await userModel.countApprovedUsersInEstablishments(establishmentIds);
        // Enrichir chaque admin avec le nombre d'utilisateurs de son établissement
        users = admins.map(admin => ({
          ...admin,
          userCount: userCounts[admin.establishment_id] || 0
        }));
      } else {
        users = admins;
      }
    } else {
      // Pour tout autre rôle non autorisé, on renvoie une liste vide par sécurité.
      users = [];
    }

    res.render('admin', {
      title: 'Administration des utilisateurs',
      users: users,
      currentUser: req.user
    });
  } catch (error) {
    console.error('Erreur lors du chargement de la page admin:', error);
    req.flash('error_msg', "Impossible de charger la page d'administration.");
    res.redirect('/dashboard');
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

    await userModel.deleteUserById(id);

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