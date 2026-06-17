const bcrypt = require('bcryptjs');
const { globalDb } = require('../config/database');

const authController = {
    register: (req, res) => {
        const { nom, prenom, email, password, confirm_password, role } = req.body;

        if (!nom || !prenom || !email || !password || !role) {
            return res.redirect('/auth/register?error=Tous les champs sont obligatoires');
        }
        if (password !== confirm_password) {
            return res.redirect('/auth/register?error=Les mots de passe ne correspondent pas');
        }
        if (password.length < 8) {
            return res.redirect('/auth/register?error=Minimum 8 caractères');
        }

        globalDb.get('SELECT id FROM users WHERE email = ?', [email], (err, user) => {
            if (user) return res.redirect('/auth/register?error=Email déjà utilisé');

            bcrypt.hash(password, 10, (err, hashedPassword) => {
                if (err) return res.redirect('/auth/register?error=Erreur serveur');

                const matiere_principale = req.body.matiere_principale || null;
                const classes_assignees = req.body.classes_assignees || null;
                const classe_eleve = req.body.classe_eleve || null;
                const date_naissance = req.body.date_naissance || null;

                if (role === 'parent') {
                    const enfantsNoms = Array.isArray(req.body.enfant_nom) ? req.body.enfant_nom : (req.body.enfant_nom ? [req.body.enfant_nom] : []);
                    const enfantsPrenoms = Array.isArray(req.body.enfant_prenom) ? req.body.enfant_prenom : (req.body.enfant_prenom ? [req.body.enfant_prenom] : []);
                    const enfantsClasses = Array.isArray(req.body.enfant_classe) ? req.body.enfant_classe : (req.body.enfant_classe ? [req.body.enfant_classe] : []);
                    const enfants = [];
                    for (let i = 0; i < enfantsNoms.length; i++) {
                        if (enfantsNoms[i] && enfantsPrenoms[i]) {
                            enfants.push({ nom: enfantsNoms[i], prenom: enfantsPrenoms[i], classe: enfantsClasses[i] || '' });
                        }
                    }
                    globalDb.run('INSERT INTO users (nom, prenom, email, password, role, classes_assignees) VALUES (?, ?, ?, ?, ?, ?)',
                        [nom, prenom, email, hashedPassword, role, JSON.stringify(enfants)], function(err) {
                            if (err) return res.redirect('/auth/register?error=Erreur inscription');
                            res.redirect('/auth/login?success=Compte parent créé !');
                        });
                } else if (role === 'eleve') {
                    globalDb.run('INSERT INTO users (nom, prenom, email, password, role, classes_assignees, date_naissance) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [nom, prenom, email, hashedPassword, role, classe_eleve, date_naissance], function(err) {
                            if (err) return res.redirect('/auth/register?error=Erreur inscription');
                            res.redirect('/auth/login?success=Compte élève créé !');
                        });
                } else if (role === 'prof') {
                    globalDb.run('INSERT INTO users (nom, prenom, email, password, role, matiere_principale, classes_assignees) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [nom, prenom, email, hashedPassword, role, matiere_principale, classes_assignees], function(err) {
                            if (err) return res.redirect('/auth/register?error=Erreur inscription');
                            res.redirect('/auth/login?success=Compte professeur créé !');
                        });
                } else {
                    globalDb.run('INSERT INTO users (nom, prenom, email, password, role) VALUES (?, ?, ?, ?, ?)',
                        [nom, prenom, email, hashedPassword, role], function(err) {
                            if (err) return res.redirect('/auth/register?error=Erreur inscription');
                            res.redirect('/auth/login?success=Compte créé !');
                        });
                }
            });
        });
    },

    login: (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.redirect('/auth/login?error=Email et mot de passe requis');

    globalDb.get('SELECT * FROM users WHERE email = ? AND compte_actif = 1', [email], (err, user) => {
        if (err || !user) return res.redirect('/auth/login?error=Email ou mot de passe incorrect');

        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err || !isMatch) return res.redirect('/auth/login?error=Email ou mot de passe incorrect');

            globalDb.run('UPDATE users SET derniere_connexion = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
            
            // Si pas de code établissement, en générer un
            const etablissementCode = user.etablissement_code || 'ETAB_' + Date.now().toString(36).toUpperCase();
            
            // Mettre à jour le code si nouveau
            if (!user.etablissement_code) {
                globalDb.run('UPDATE users SET etablissement_code = ? WHERE id = ?', [etablissementCode, user.id]);
            }
            
            req.session.user = {
                id: user.id,
                email: user.email,
                nom: user.nom,
                prenom: user.prenom,
                role: user.role,
                photo: user.photo,
                etablissement_code: etablissementCode
            };
            res.redirect('/dashboard');
        });
    });
},

    logout: (req, res) => {
        req.session.destroy(() => res.redirect('/auth/login'));
    }
};

module.exports = authController;