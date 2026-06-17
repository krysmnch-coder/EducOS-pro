const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const multer = require('multer');
const fs = require('fs');
const passport = require('./config/passport');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Configuration upload
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✅ Dossier uploads créé');
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, uploadsDir); },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + '-' + file.originalname.replace(/\s+/g, '_');
        cb(null, uniqueName);
    }
});
const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Configuration EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'database') }),
    secret: process.env.SESSION_SECRET || 'educos_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000, httpOnly: true }
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// ============================================
// ROUTES API
// ============================================
app.use('/auth', require('./routes/auth'));
app.use('/admin', require('./routes/admin')(upload));
app.use('/vie-scolaire', require('./routes/vieScolaire')(upload));
app.use('/prof', require('./routes/prof')(upload));
app.use('/parent', require('./routes/parent')(upload));

// ============================================
// ACCUEIL
// ============================================
app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.redirect('/auth/login');
});

// ============================================
// REDIRECTION DASHBOARD
// ============================================
app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    switch (req.session.user.role) {
        case 'admin': return res.redirect('/dashboard/admin');
        case 'vie_scolaire': return res.redirect('/dashboard/vie-scolaire');
        case 'prof': return res.redirect('/dashboard/prof');
        case 'parent': return res.redirect('/dashboard/parent');
        case 'eleve': return res.redirect('/dashboard/eleve');
        default: return res.redirect('/auth/login');
    }
});

// ============================================
// DASHBOARD ADMIN
// ============================================
app.get('/dashboard/admin', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/auth/login');
    res.render('dashboard/admin', { title: 'Administration | EducOS-pro', user: req.session.user });
});
app.get('/dashboard/admin/utilisateurs', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/auth/login');
    res.render('dashboard/admin/utilisateurs', { title: 'Utilisateurs | EducOS-pro', user: req.session.user });
});
app.get('/dashboard/admin/etablissement', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/auth/login');
    res.render('dashboard/admin/etablissement', { title: 'Établissement | EducOS-pro', user: req.session.user });
});
app.get('/dashboard/admin/paiements', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/auth/login');
    res.render('dashboard/admin/paiements', { title: 'Paiements | EducOS-pro', user: req.session.user });
});
app.get('/dashboard/admin/messages', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/auth/login');
    res.render('dashboard/admin/messages', { title: 'Messages | EducOS-pro', user: req.session.user });
});
app.get('/dashboard/admin/parametres', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/auth/login');
    res.render('dashboard/admin/parametres', { title: 'Paramètres | EducOS-pro', user: req.session.user });
});

// ============================================
// DASHBOARD VIE SCOLAIRE
// ============================================
app.get('/dashboard/vie-scolaire', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'vie_scolaire') return res.redirect('/auth/login');
    res.render('dashboard/vie-scolaire', { title: 'Vie Scolaire | EducOS-pro', user: req.session.user });
});
app.get('/dashboard/vie-scolaire/absences', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'vie_scolaire') return res.redirect('/auth/login');
    res.render('dashboard/vie-scolaire/absences', { title: 'Absences | EducOS-pro', user: req.session.user });
});
app.get('/dashboard/vie-scolaire/edt', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'vie_scolaire') return res.redirect('/auth/login');
    res.render('dashboard/vie-scolaire/edt', { title: 'EDT | EducOS-pro', user: req.session.user });
});
app.get('/dashboard/vie-scolaire/pointage', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'vie_scolaire') return res.redirect('/auth/login');
    res.render('dashboard/vie-scolaire/pointage', { title: 'Pointage | EducOS-pro', user: req.session.user });
});
app.get('/dashboard/vie-scolaire/sanctions', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'vie_scolaire') return res.redirect('/auth/login');
    res.render('dashboard/vie-scolaire/sanctions', { title: 'Sanctions | EducOS-pro', user: req.session.user });
});
app.get('/dashboard/vie-scolaire/messages', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'vie_scolaire') return res.redirect('/auth/login');
    res.render('dashboard/vie-scolaire/messages', { title: 'Messages | EducOS-pro', user: req.session.user });
});
app.get('/dashboard/vie-scolaire/annuaire', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'vie_scolaire') return res.redirect('/auth/login');
    res.render('dashboard/vie-scolaire/annuaire', { title: 'Annuaire | EducOS-pro', user: req.session.user });
});

// ============================================
// DASHBOARD PROFESSEUR
// ============================================
app.get('/dashboard/prof', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'prof') return res.redirect('/auth/login');
    res.render('dashboard/prof/index', { title: 'Tableau de bord | EducOS-pro', user: req.session.user });
});
app.get('/dashboard/prof/pointages', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'prof') return res.redirect('/auth/login');
    res.render('dashboard/prof/pointages', { title: 'Pointages | EducOS-pro', user: req.session.user });
});
app.get('/dashboard/prof/edt', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'prof') return res.redirect('/auth/login');
    res.render('dashboard/prof/edt', { title: 'Emploi du temps | EducOS-pro', user: req.session.user });
});
app.get('/dashboard/prof/ressources', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'prof') return res.redirect('/auth/login');
    res.render('dashboard/prof/ressources', { title: 'Ressources | EducOS-pro', user: req.session.user });
});
app.get('/dashboard/prof/notes', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'prof') return res.redirect('/auth/login');
    res.render('dashboard/prof/notes', { title: 'Notes | EducOS-pro', user: req.session.user });
});
app.get('/dashboard/prof/messages', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'prof') return res.redirect('/auth/login');
    res.render('dashboard/prof/messages', { title: 'Messages | EducOS-pro', user: req.session.user });
});
app.get('/dashboard/prof/sanctions', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'prof') return res.redirect('/auth/login');
    res.render('dashboard/prof/sanctions', { title: 'Sanctions | EducOS-pro', user: req.session.user });
});

// ============================================
// DASHBOARD PARENT
// ============================================
app.get('/dashboard/parent', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'parent') return res.redirect('/auth/login');
    res.render('dashboard/parent', { title: 'Parent | EducOS-pro', user: req.session.user });
});
app.get('/dashboard/parent/messages', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'parent') return res.redirect('/auth/login');
    res.render('dashboard/parent/messages', { title: 'Messages | EducOS-pro', user: req.session.user });
});
// Vérifier les dates limites chaque heure
setInterval(() => {
    const db = require('./config/database');
    const demain = new Date();
    demain.setDate(demain.getDate() + 1);
    const dateLimite = demain.toISOString().split('T')[0];
    
    db.all("SELECT r.*, u.nom as prof_nom, u.prenom as prof_prenom FROM ressources r JOIN users u ON r.prof_id = u.id WHERE r.date_limite = ?", [dateLimite], (err, ressources) => {
        if (err || !ressources) return;
        ressources.forEach(rs => {
            // Trouver les élèves qui n'ont pas rendu
            db.all("SELECT u.id FROM users u WHERE u.role = 'eleve' AND u.compte_actif = 1 AND (u.classes_assignees LIKE ? OR u.classes_assignees = ?) AND u.id NOT IN (SELECT eleve_id FROM devoirs_rendus WHERE ressource_id = ?)",
                ['%' + rs.classe + '%', rs.classe, rs.id], (err, eleves) => {
                if (eleves) {
                    eleves.forEach(e => {
                        db.run("INSERT INTO notifications (user_id, type, titre, message) VALUES (?, 'alerte', ?, ?)",
                            [e.id, '⚠️ Devoir à rendre', rs.titre + ' - Date limite: ' + rs.date_limite + ' (demain !)']);
                    });
                }
            });
            
            // Notifier les parents aussi
            db.all("SELECT id FROM users WHERE role = 'parent' AND compte_actif = 1", [], (err, parents) => {
                if (parents) {
                    parents.forEach(p => {
                        db.run("INSERT INTO notifications (user_id, type, titre, message) VALUES (?, 'alerte', ?, ?)",
                            [p.id, '⚠️ Devoir enfant', rs.titre + ' - Classe ' + rs.classe + ' - Date limite: ' + rs.date_limite]);
                    });
                }
            });
        });
    });
}, 3600000); // Toutes les heures
// ============================================
// DASHBOARD ÉLÈVE
// ============================================
app.get('/dashboard/eleve', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'eleve') return res.redirect('/auth/login');
    res.render('dashboard/eleve', { title: 'Élève | EducOS-pro', user: req.session.user });
});

const eleveRoutes = require('./routes/eleve')(upload);
app.use('/eleve', eleveRoutes);

// ============================================
// 404
// ============================================
app.use((req, res) => { res.status(404).send('Page non trouvée'); });

// ============================================
// DÉMARRAGE
// ============================================
// Middleware mode maintenance
app.use((req, res, next) => {
    if (req.path.startsWith('/auth') || req.path.startsWith('/css') || req.path.startsWith('/js') || req.path.startsWith('/uploads')) {
        return next();
    }
    const db = require('./config/database');
    db.get('SELECT maintenance_mode FROM settings WHERE id=1', [], (err, row) => {
        if (row && row.maintenance_mode == 1 && (!req.session.user || req.session.user.role !== 'admin')) {
            return res.status(503).send(`
                <!DOCTYPE html><html><head><meta charset="UTF-8"><title>Maintenance</title>
                <style>body{font-family:Inter,sans-serif;text-align:center;padding:100px 20px;background:#f5f5f5;}
                h1{color:#002FA7;font-size:2rem;}p{color:#666;margin-top:10px;}</style></head>
                <body><h1>🚧 Maintenance en cours</h1><p>L'application est temporairement indisponible.<br>Veuillez réessayer plus tard.</p></body></html>`);
        }
        next();
    });
});
// Middleware : charger la base de données de l'établissement
app.use((req, res, next) => {
    if (req.session.user && req.session.user.etablissement_code) {
        const path = require('path');
        const dbName = 'educos_' + req.session.user.etablissement_code.toLowerCase() + '.db';
        const dbPath = path.join(__dirname, 'database', dbName);
        const { setEtablissementDb } = require('./config/database');
        setEtablissementDb(dbPath);
    }
    next();
});
app.get('/dashboard/vie-scolaire/fiches', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'vie_scolaire') return res.redirect('/auth/login');
    res.render('dashboard/vie-scolaire/fiches', { title: 'Fiches élèves | EducOS-pro', user: req.session.user });
});
// Middleware : initialiser la base établissement pour chaque requête
app.use((req, res, next) => {
    if (req.session.user && req.session.user.etablissement_code) {
        const path = require('path');
        const dbName = 'educos_' + req.session.user.etablissement_code.toLowerCase() + '.db';
        const dbPath = path.join(__dirname, 'database', dbName);
        const { setEtablissementDb } = require('./config/database');
        setEtablissementDb(dbPath);
    }
    next();
});
app.listen(PORT, '0.0.0.0', () => { console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`); });