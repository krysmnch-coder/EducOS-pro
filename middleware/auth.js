const isAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/auth/login');
};

const isNotAuthenticated = (req, res, next) => {
    if (!req.session.user) return next();
    res.redirect('/dashboard');
};

const hasRole = (...roles) => {
    return (req, res, next) => {
        if (!req.session.user) return res.redirect('/auth/login');
        if (roles.includes(req.session.user.role)) return next();
        res.status(403).send('Accès refusé');
    };
};

module.exports = { isAuthenticated, isNotAuthenticated, hasRole };