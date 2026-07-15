const authorize = (roles) => (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    if (!roles.includes(req.session.user.role)) {
        return res.status(403).send('Accès non autorisé'); // Ou rediriger vers une page d'erreur plus conviviale
    }
    next();
};
module.exports = { authorize };