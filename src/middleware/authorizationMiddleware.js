function ensureRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      req.flash('error_msg', 'Veuillez vous connecter.');
      return res.redirect('/login');
    }
    if (!allowedRoles.includes(req.user.role)) {
      req.flash('error_msg', "Vous n'êtes pas autorisé à accéder à cette page.");
      return res.redirect('/dashboard');
    }
    next();
  };
}

module.exports = {
  ensureRole
};
