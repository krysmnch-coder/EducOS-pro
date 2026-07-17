const establishmentModel = require('../models/establishmentModel');

/**
 * Affiche la page de gestion des établissements.
 */
const renderManagementPage = async (req, res) => {
  try {
    const establishments = await establishmentModel.getAll();
    res.render('establishments', {
      title: 'Gérer les Établissements',
      establishments: establishments
    });
  } catch (error) {
    console.error('Erreur lors du chargement de la page de gestion des établissements:', error);
    req.flash('error_msg', 'Impossible de charger la page.');
    res.redirect('/dashboard');
  }
};

/**
 * Gère la création d'un nouvel établissement.
 */
const createEstablishment = async (req, res) => {
  const { name, subdomain } = req.body;

  if (!name || !subdomain) {
    req.flash('error_msg', 'Le nom et le sous-domaine sont obligatoires.');
    return res.redirect('/establishments');
  }

  try {
    const existing = await establishmentModel.findByNameOrSubdomain(name, subdomain);
    if (existing) {
      req.flash('error_msg', 'Un établissement avec ce nom ou ce sous-domaine existe déjà.');
      return res.redirect('/establishments');
    }

    await establishmentModel.create(name, subdomain.toLowerCase());

    // --- Mise à jour en temps réel pour la page d'accueil ---
    const broadcastDashboardStats = req.app.get('broadcastDashboardStats');
    if (broadcastDashboardStats) {
      broadcastDashboardStats();
    }
    req.flash('success_msg', `L'établissement "${name}" a été créé avec succès.`);
    res.redirect('/establishments');
  } catch (error) {
    console.error('Erreur lors de la création de l\'établissement:', error);
    req.flash('error_msg', 'Une erreur est survenue lors de la création.');
    res.redirect('/establishments');
  }
};

/**
 * Gère la mise à jour d'un établissement.
 */
const updateEstablishment = async (req, res) => {
  const { id } = req.params;
  const { name, subdomain } = req.body;

  if (!name || !subdomain) {
    req.flash('error_msg', 'Le nom et le sous-domaine sont obligatoires pour la mise à jour.');
    return res.redirect('/establishments');
  }

  try {
    // Vérifie si un AUTRE établissement utilise déjà ce nom ou sous-domaine.
    const existing = await establishmentModel.findByNameOrSubdomain(name, subdomain);
    if (existing && existing.id.toString() !== id) {
      req.flash('error_msg', 'Un autre établissement utilise déjà ce nom ou ce sous-domaine.');
      return res.redirect('/establishments');
    }

    await establishmentModel.update(id, { name, subdomain: subdomain.toLowerCase() });
    req.flash('success_msg', 'L\'établissement a été mis à jour avec succès.');
    res.redirect('/establishments');
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'établissement:', error);
    req.flash('error_msg', 'Une erreur est survenue lors de la mise à jour.');
    res.redirect('/establishments');
  }
};

/**
 * Gère la suppression d'un établissement.
 */
const deleteEstablishment = async (req, res) => {
  const { id } = req.params;
  try {
    await establishmentModel.delete(id);

    // --- Mise à jour en temps réel pour la page d'accueil ---
    const broadcastDashboardStats = req.app.get('broadcastDashboardStats');
    if (broadcastDashboardStats) {
      broadcastDashboardStats();
    }
    req.flash('success_msg', 'L\'établissement a été supprimé avec succès.');
    res.redirect('/establishments');
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'établissement:', error);
    req.flash('error_msg', 'Une erreur est survenue. Il est possible que des utilisateurs ou d\'autres données soient encore liés à cet établissement.');
    res.redirect('/establishments');
  }
};

module.exports = { renderManagementPage, createEstablishment, updateEstablishment, deleteEstablishment };