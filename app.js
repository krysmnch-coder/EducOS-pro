const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const session = require('express-session');
const passport = require('passport');
const flash = require('connect-flash');

// ... autres configurations ...

// Configuration du moteur de vue
app.set('view engine', 'ejs');
app.set('views', './views');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session
app.use(session({
    secret: 'votre-secret',
    resave: false,
    saveUninitialized: false
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Flash messages
app.use(flash());

// Variables globales pour les vues
app.use((req, res, next) => {
    res.locals.currentUser = req.user;
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    next();
});

// ==========================================================================
// ROUTES
// ==========================================================================

// Routes principales
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chatRoutes'); // ← IMPORTANT

// Monter les routes
app.use('/', indexRoutes);
app.use('/', authRoutes);
app.use('/', chatRoutes); // ← IMPORTANT : Monter les routes du chat

// ... autres routes ...

// Socket.io
require('./socket/chatSocket')(io, app);

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log(`📡 Routes disponibles:`);
    console.log(`   GET /chat`);
    console.log(`   GET /api/conversations`);
    console.log(`   GET /api/messages/:userId`);
    console.log(`   GET /api/unread`);
});