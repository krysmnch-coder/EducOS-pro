const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const multer = require('multer');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const passport = require('./config/passport');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// ============================================
// 1. CONFIGURATION UPLOAD
// ============================================
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

// ============================================
// 2. CONFIGURATION EJS
// ============================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ============================================
// 3. MIDDLEWARE GÉNÉRAUX
// ============================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// 4. SESSION
// ============================================
app.use(session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'database') }),
    secret: process.env.SESSION_SECRET || 'educos_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000, httpOnly: true }
}));

// ============================================
// 5. PASSPORT
// ============================================
app.use(passport.initialize());
app.use(passport.session());

// ============================================
// 6. VARIABLES GLOBALES POUR LES VUES
// ============================================
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// ============================================
// 7. MIDDLEWARE : CONNECTER LA BASE ÉTABLISSEMENT
// ============================================
app.use((req, res, next) => {
    if (req.session.user && req.session.user.etablissement_code) {
        try {
            const dbName = 'educos_' + req.session.user.etablissement_code.toLowerCase() + '.db';
            const dbPath = path.join(__dirname, 'database', dbName);
            const { setEtablissementDb } = require('./config/database');
            setEtablissementDb(dbPath);
        } catch(e) {
            console.error('Erreur initialisation base établissement:', e.message);
        }
    }
    next();
});

// ============================================
// 8. API PUBLIQUE (SANS AUTHENTIFICATION)
// ============================================
app.get('/api/etablissements', (req, res) => {
    const { globalDb } = require('./config/database');
    globalDb.all("SELECT code, nom FROM etablissements WHERE actif = 1 ORDER BY nom", [], (err, rows) => {
        if (err) return res.json([]);
        res.json(rows || []);
    });
});

app.get('/api/check-etablissement/:code', (req, res) => {
    const { globalDb } = require('./config/database');
    const code = req.params.code;
    
    globalDb.get("SELECT * FROM etablissements WHERE code = ? AND actif = 1", [code], (err, etab) => {
        if (err || !etab) return res.json({ error: 'Établissement non trouvé', allow_registration: 1, max_users: 500, current_users: 0 });
        
        const dbPath = path.join(__dirname, 'database', etab.db_name);
        const checkDb = new sqlite3.Database(dbPath, (err) => {
            if (err) return res.json({ error: 'Erreur base', allow_registration: 1, max_users: 500, current_users: 0 });
            
            checkDb.get("SELECT allow_registration, max_users FROM settings WHERE id = 1", [], (err, settings) => {
                checkDb.get("SELECT COUNT(*) as total FROM users", [], (err, row) => {
                    checkDb.close();
                    res.json({
                        code: etab.code,
                        nom: etab.nom,
                        allow_registration: settings ? settings.allow_registration : 1,
                        max_users: settings ? settings.max_users : 500,
                        current_users: row ? row.total : 0
                    });
                });
            });
        });
    });
});

// ============================================
// 9. Middleware : S'assurer que la base établissement est connectée
app.use((req, res, next) => {
    if (req.session.user && req.session.user.etablissement_code) {
        const { getEtablissementDb, setEtablissementDb } = require('./config/database');
        const currentDb = getEtablissementDb();
        
        // Si pas de base connectée ou si le code a changé
        if (!currentDb) {
            const dbName = 'educos_' + req.session.user.etablissement_code.toLowerCase() + '.db';
            const dbPath = path.join(__dirname, 'database', dbName);
            if (fs.existsSync(dbPath)) {
                setEtablissementDb(dbPath);
                console.log('✅ Base établissement reconnectée:', dbName);
            }
        }
    }
    next();
});
// ============================================

// ============================================
// 10. ROUTES API (AVEC AUTHENTIFICATION)
// ============================================
app.use('/auth', require('./routes/auth'));
app.use('/admin', require('./routes/admin')(upload));
app.use('/vie-scolaire', require('./routes/vieScolaire')(upload));
app.use('/prof', require('./routes/prof')(upload));
app.use('/parent', require('./routes/parent')(upload));
app.use('/eleve', require('./routes/eleve')(upload));

// ============================================
// 11. ACCUEIL
// ============================================
app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.redirect('/auth/login');
});

// ============================================
// 12. REDIRECTION DASHBOARD
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
// 13. DASHBOARD ADMIN
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
// 14. DASHBOARD VIE SCOLAIRE
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
// 15. DASHBOARD PROFESSEUR
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
// 16. DASHBOARD PARENT
// ============================================
app.get('/dashboard/parent', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'parent') return res.redirect('/auth/login');
    res.render('dashboard/parent', { title: 'Parent | EducOS-pro', user: req.session.user });
});
app.get('/dashboard/parent/messages', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'parent') return res.redirect('/auth/login');
    res.render('dashboard/parent/messages', { title: 'Messages | EducOS-pro', user: req.session.user });
});

// ============================================
// 17. DASHBOARD ÉLÈVE
// ============================================
app.get('/dashboard/eleve', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'eleve') return res.redirect('/auth/login');
    res.render('dashboard/eleve', { title: 'Élève | EducOS-pro', user: req.session.user });
});

// ============================================
// 18. 404
// ============================================
app.use((req, res) => { res.status(404).send('Page non trouvée'); });

// ============================================
// 19. DÉMARRAGE
// ============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur démarré sur http://0.0.0.0:${PORT}`);
});