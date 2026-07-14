const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const { getUserByEmailAndEstablishment, getUserById } = require('../models/userModel');

function initialize(passport) {
  const authenticateUser = async (req, email, password, done) => {
    const { establishment_id } = req.body;

    if (!establishment_id) {
      return done(null, false, { message: 'Veuillez sélectionner un établissement.' });
    }

    try {
      let user;
      if (establishment_id === 'superadmin_login') {
        // Recherche un utilisateur qui n'est lié à aucun établissement (le super-admin)
        user = await getUserByEmailAndEstablishment(email, null);
      } else {
        // Recherche normale pour les autres utilisateurs
        user = await getUserByEmailAndEstablishment(email, establishment_id);
      }

      if (!user) return done(null, false, { message: 'Aucun compte trouvé pour cet e-mail dans cet établissement.' });
      if (!user.approved) return done(null, false, { message: 'Compte en attente de validation par un administrateur.' });
      
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) return done(null, false, { message: 'Mot de passe incorrect' });
      
      return done(null, user);
    } catch (error) {
      return done(error);
    }
  };

  // On passe `passReqToCallback: true` pour pouvoir accéder à `req` dans `authenticateUser`
  passport.use(new LocalStrategy({ usernameField: 'email', passReqToCallback: true }, authenticateUser));
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await getUserById(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });
}

module.exports = initialize;
