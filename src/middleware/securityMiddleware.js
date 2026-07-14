/**
 * Middleware pour forcer le changement de mot de passe si nécessaire.
 */
function forcePasswordChange(req, res, next) {
  // Vérifie si l'utilisateur est authentifié et si le flag de réinitialisation est actif.
  if (req.isAuthenticated() && req.user && req.user.password_reset_required) {
    
    // Autorise l'accès uniquement à la page de changement de mot de passe et à la déconnexion.
    if (req.path === '/force-change-password' || req.path === '/logout') {
      return next();
    }
    
    // Redirige toutes les autres requêtes vers la page de changement de mot de passe.
    req.flash('info_msg', 'Pour des raisons de sécurité, vous devez changer votre mot de passe initial.');
    return res.redirect('/force-change-password');
  }
  
  // Si aucune réinitialisation n'est requise, on continue normalement.
  return next();
}

module.exports = {
  forcePasswordChange,
};