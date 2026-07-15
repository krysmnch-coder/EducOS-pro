const passport = require('passport');
const db = require('./database');
require('dotenv').config();

// Vérifier si les identifiants sont configurés
const hasGoogleConfig = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== 'temp';
const hasFacebookConfig = process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_ID !== 'temp';

// Sérialiser/désérialiser
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => done(err, user));
});

// GOOGLE - uniquement si configuré
if (hasGoogleConfig) {
    try {
        const GoogleStrategy = require('passport-google-oauth20').Strategy;
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
            db.get('SELECT * FROM users WHERE google_id = ? OR email = ?', [googleId, email], (err, existingUser) => {
                if (err) return done(err);
                if (existingUser) {
                    if (!existingUser.google_id) db.run('UPDATE users SET google_id=?, photo=? WHERE id=?', [googleId, photo, existingUser.id]);
                    return done(null, existingUser);
                }
                db.run("INSERT INTO users (email, nom, prenom, google_id, photo, email_verified, role, password) VALUES (?,?,?,?,?,1,'eleve','google_auth')", [email, nom, prenom, googleId, photo], function(err) {
                    if (err) return done(err);
                    db.get('SELECT * FROM users WHERE id = ?', [this.lastID], (err, newUser) => done(err, newUser));
                });
            });
        }));
        console.log('✅ Google OAuth configuré');
    } catch(e) {
        console.log('⚠️ Google OAuth non configuré');
    }
}

// FACEBOOK - uniquement si configuré
if (hasFacebookConfig) {
    try {
        const FacebookStrategy = require('passport-facebook').Strategy;
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
            db.get('SELECT * FROM users WHERE facebook_id = ? OR email = ?', [facebookId, email], (err, existingUser) => {
                if (err) return done(err);
                if (existingUser) {
                    if (!existingUser.facebook_id) db.run('UPDATE users SET facebook_id=?, photo=? WHERE id=?', [facebookId, photo, existingUser.id]);
                    return done(null, existingUser);
                }
                db.run("INSERT INTO users (email, nom, prenom, facebook_id, photo, email_verified, role, password) VALUES (?,?,?,?,?,1,'eleve','facebook_auth')", [email, nom, prenom, facebookId, photo], function(err) {
                    if (err) return done(err);
                    db.get('SELECT * FROM users WHERE id = ?', [this.lastID], (err, newUser) => done(err, newUser));
                });
            });
        }));
        console.log('✅ Facebook OAuth configuré');
    } catch(e) {
        console.log('⚠️ Facebook OAuth non configuré');
    }
}

module.exports = passport;