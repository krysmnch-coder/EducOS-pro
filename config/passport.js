const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const db = require('./database');
require('dotenv').config();

// Sérialiser l'utilisateur dans la session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Désérialiser l'utilisateur de la session
passport.deserializeUser((id, done) => {
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
        done(err, user);
    });
});

// ============================================
// STRATÉGIE GOOGLE
// ============================================
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
    passReqToCallback: true
}, (req, accessToken, refreshToken, profile, done) => {
    
    const googleId = profile.id;
    const email = profile.emails[0].value;
    const nom = profile.name.familyName || '';
    const prenom = profile.name.givenName || '';
    const photo = profile.photos[0]?.value || 'default.png';

    console.log('Google login:', { googleId, email, nom, prenom });

    // Vérifier si l'utilisateur existe déjà
    db.get('SELECT * FROM users WHERE google_id = ? OR email = ?', [googleId, email], (err, existingUser) => {
        if (err) return done(err);

        if (existingUser) {
            // Mettre à jour le google_id si connexion par email existant
            if (!existingUser.google_id) {
                db.run('UPDATE users SET google_id = ?, photo = ? WHERE id = ?', 
                    [googleId, photo, existingUser.id]);
            }
            return done(null, existingUser);
        }

        // Créer un nouvel utilisateur
        db.run(
            `INSERT INTO users (email, nom, prenom, google_id, photo, email_verified, role, password) 
             VALUES (?, ?, ?, ?, ?, 1, 'eleve', ?)`,
            [email, nom, prenom, googleId, photo, 'google_auth_no_password'],
            function(err) {
                if (err) return done(err);
                
                db.get('SELECT * FROM users WHERE id = ?', [this.lastID], (err, newUser) => {
                    done(err, newUser);
                });
            }
        );
    });
}));

// ============================================
// STRATÉGIE FACEBOOK
// ============================================
passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: process.env.FACEBOOK_CALLBACK_URL || 'http://localhost:3000/auth/facebook/callback',
    profileFields: ['id', 'displayName', 'name', 'photos'],
    passReqToCallback: true
}, (req, accessToken, refreshToken, profile, done) => {
    
    const facebookId = profile.id;
    const email = `${profile.id}@facebook.user`;
    const nom = profile.name?.familyName || profile.displayName || 'Utilisateur';
    const prenom = profile.name?.givenName || '';
    const photo = profile.photos?.[0]?.value || 'default.png';

    console.log('Facebook login:', { facebookId, nom, prenom, email });

    // Vérifier si l'utilisateur existe
    db.get('SELECT * FROM users WHERE facebook_id = ? OR email = ?', [facebookId, email], (err, existingUser) => {
        if (err) return done(err);

        if (existingUser) {
            if (!existingUser.facebook_id) {
                db.run('UPDATE users SET facebook_id = ?, photo = ? WHERE id = ?', 
                    [facebookId, photo, existingUser.id]);
            }
            return done(null, existingUser);
        }

        // Créer un nouvel utilisateur
        db.run(
            `INSERT INTO users (email, nom, prenom, facebook_id, photo, email_verified, role, password) 
             VALUES (?, ?, ?, ?, ?, 1, 'eleve', ?)`,
            [email, nom, prenom, facebookId, photo, 'facebook_auth_no_password'],
            function(err) {
                if (err) return done(err);
                
                db.get('SELECT * FROM users WHERE id = ?', [this.lastID], (err, newUser) => {
                    done(err, newUser);
                });
            }
        );
    });
}));

module.exports = passport;