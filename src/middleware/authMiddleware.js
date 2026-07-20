const { ROLES } = require('../../constants');

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  req.flash('error_msg', 'Veuillez vous connecter pour voir cette ressource');
  res.redirect('/login');
}

function ensureAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.role === ROLES.ADMINISTRATOR) {
    return next();
  }
  req.flash('error_msg', 'Accès non autorisé. Cette section est réservée aux administrateurs.');
  // Redirige vers le tableau de bord si l'utilisateur est connecté, sinon vers la page de connexion
  res.redirect(req.isAuthenticated() ? '/dashboard' : '/login');
}

function ensureRole(roles) {
  return (req, res, next) => {
    // S'assurer que `roles` est toujours un tableau pour éviter les erreurs.
    const rolesArray = Array.isArray(roles) ? roles : [roles];
    if (!req.user || !rolesArray.includes(req.user.role)) {
      req.flash('error_msg', "Vous n'avez pas la permission d'accéder à cette page.");
      return res.redirect('/dashboard');
    }
    next();
  };
}

module.exports = {
  ensureAuthenticated,
  isAuthenticated: ensureAuthenticated, // Alias pour la compatibilité
  ensureAdmin,
  ensureRole,
  hasRole: ensureRole, // Alias pour la compatibilité
};