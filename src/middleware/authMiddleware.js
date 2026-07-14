/**
 * Middleware pour vérifier si l'utilisateur est authentifié.
 */
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  req.flash('error_msg', 'Veuillez vous connecter pour voir cette ressource.');
  res.redirect('/login');
};

/**
 * Middleware pour vérifier si l'utilisateur a un des rôles requis.
 * @param {string|string[]} roleOrRoles - Le ou les rôles autorisés.
 */
const hasRole = (roleOrRoles) => {
  const requiredRoles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];

  return (req, res, next) => {
    if (req.user && requiredRoles.includes(req.user.role)) {
      return next();
    }
    req.flash('error_msg', 'Vous n\'avez pas la permission d\'accéder à cette page.');
    res.status(403).redirect('/dashboard');
  };
};

module.exports = { isAuthenticated, hasRole };