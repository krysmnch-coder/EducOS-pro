const dotenv = require('dotenv');
dotenv.config(); // Charge les variables d'environnement depuis le fichier .env
const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const flash = require('connect-flash');
const passport = require('passport');
const multer = require('multer');
const initializePassport = require('./src/config/passport-config');
const authRoutes = require('./src/routes/authRoutes');
const chatRoutes = require('./src/routes/chatRoutes');
const { forcePasswordChange } = require('./src/middleware/securityMiddleware');
const communicationRoutes = require('./src/routes/communicationRoutes');
const studentRoutes = require('./src/routes/studentRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const apiRoutes = require('./src/routes/apiRoutes');
const establishmentRoutes = require('./src/routes/establishmentRoutes'); // Ajout des routes pour les établissements
const notificationRoutes = require('./src/routes/notificationRoutes');
const chatModel = require('./src/models/chatModel');
const http = require('http');
const socketIo = require('socket.io');
const { ROLES } = require('./constants');
const notificationModel = require('./src/models/notificationModel');
const userModel = require('./src/models/userModel');
const db = require('./src/models/db');
const communicationModel = require('./src/models/communicationModel');
const { createClient } = require("redis");
const pgSession = require('connect-pg-simple')(session);
const { initializeEmailService } = require('./src/utils/emailService'); // Chemin vers votre fichier
const { createAdapter } = require("@socket.io/redis-adapter");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 5000;

// Vérification critique des secrets au démarrage
if (!process.env.SESSION_SECRET) {
  throw new Error('FATAL ERROR: SESSION_SECRET is not defined in environment variables.');
}

// Initialisation des clients Redis (à connecter dans startServer)
let pubClient, subClient;
if (process.env.REDIS_URL) {
  console.log('Configuration des clients Redis car REDIS_URL est fournie.');
  const redisOptions = { url: process.env.REDIS_URL };

  // Sur des plateformes comme Render, les connexions Redis peuvent nécessiter SSL.
  // Cette option est similaire à celle utilisée pour PostgreSQL dans votre knexfile.
  if (process.env.NODE_ENV === 'production' && process.env.REDIS_URL.startsWith('rediss://')) {
    redisOptions.socket = {
      tls: true,
      rejectUnauthorized: false
    };
  }
  pubClient = createClient(redisOptions);
  subClient = pubClient.duplicate();
}

// Passport initialization
initializePassport(passport);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Uploads
const uploadsPath = path.join(__dirname, 'uploads');
const avatarsPath = path.join(uploadsPath, 'avatars');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
if (!fs.existsSync(avatarsPath)) {
  fs.mkdirSync(avatarsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

// Configuration de Multer pour les avatars
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, avatarsPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `avatar-${req.user.id}-${uniqueSuffix}${extension}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // Limite de 2MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      return cb(null, true);
    }
    cb(new Error('Type de fichier non supporté. Uniquement les images sont autorisées.'));
  }
});

// Body parser
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Indiquer à Express qu'il est derrière un proxy (nécessaire pour Render)
// Cela permet aux cookies sécurisés de fonctionner correctement en production.
app.set('trust proxy', 1);

// Sessions - Configuration conditionnelle pour la production et le développement
let sessionStore;
if (process.env.NODE_ENV === 'production') {
  console.log('Configuration du store de session pour la production (PostgreSQL).');
  sessionStore = new pgSession({
    knex: db, // Utilise l'instance Knex existante
    tableName: 'user_sessions', // Nom de la table pour les sessions
    // En activant cette option, on demande à `connect-pg-simple` de créer la table
    // des sessions si elle n'existe pas. C'est la solution la plus robuste pour ce problème.
    createTableIfMissing: true,
  });
} else {
  console.log('Configuration du store de session pour le développement (en mémoire).');
  // En développement, on utilise le MemoryStore par défaut, qui ne nécessite aucune configuration.
  // L'erreur "Cannot find module 'connect-sqlite3'" suggère que vous aviez une configuration
  // pour SQLite ici. Il est recommandé de la retirer pour la production.
}

const sessionMiddleware = session({
  store: sessionStore, // Utilise le store configuré
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 jours
    secure: process.env.NODE_ENV === 'production', // 'true' en production (HTTPS)
    httpOnly: true,
    sameSite: 'lax' // Protection CSRF de base
  }
});
app.use(sessionMiddleware);


app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// Global template variables
app.use(async (req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  res.locals.user = req.user || null;
  res.locals.currentPath = req.path;

  if (req.user) {
    try {
      const unreadGeneral = await notificationModel.getUnreadNotificationCountForUser(req.user);
      res.locals.unreadCount = unreadGeneral; // Compte pour les notifications générales

      const unreadChat = await chatModel.getUnreadCount(req.user.id);
      res.locals.unreadChatCount = unreadChat; // Compte pour les messages de chat non lus
    } catch (error) {
      console.error('Erreur calcul badge non lu :', error);
      res.locals.unreadCount = 0;
      res.locals.unreadChatCount = 0;
    }
  } else {
    res.locals.unreadCount = 0;
    res.locals.unreadChatCount = 0;
  }

  next();
});

// Middleware de sécurité pour forcer le changement de mot de passe
app.use(forcePasswordChange);

// Intercepteur pour corriger l'API du tableau de bord défectueuse.
// Cette route est placée AVANT les autres routes API pour intercepter l'appel
// à l'ancienne API boguée et renvoyer la bonne réponse.
app.get('/api/dashboard-stats', async (req, res) => {
  try {
    const stats = await getDashboardStats();
    res.json(stats);
  } catch (error) {
    console.error('Erreur dans l\'intercepteur pour /api/dashboard-stats:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * Récupère les statistiques pour le tableau de bord.
 * Centralise la logique pour l'API et la diffusion Socket.IO.
 */
async function getDashboardStats() {
  const totalUserCountResult = await db('users').where('approved', true).count('id as count').first();
  const professorCount = await userModel.countUsersByRole('professeur');
  const establishmentCountResult = await db('establishments').count('id as count').first();
  const pendingCount = await userModel.countPendingUsers();

  return {
    totalUserCount: totalUserCountResult ? Number(totalUserCountResult.count) : 0,
    professorCount,
    establishmentCount: establishmentCountResult ? Number(establishmentCountResult.count) : 0,
    pendingCount
  };
}

async function broadcastDashboardStats() {
  try {
    // Correction : La colonne 'status' n'existe pas. On utilise la colonne 'approved'
    // pour compter les utilisateurs actifs. Knex gère la différence entre `true` et `1`.
    const stats = await getDashboardStats();
    publicNamespace.emit('dashboardUpdate', stats);
  } catch (error) {
    console.error('Erreur broadcastDashboardStats:', error);
  }
}

/**
 * Diffuse les statistiques mises à jour aux tableaux de bord des administrateurs.
 * @param {object} [options] - Options pour cibler la diffusion.
 * @param {number} [options.establishmentId] - ID de l'établissement affecté par le changement.
 */
async function broadcastAdminStats(options = {}) {
  try {
    // Toujours diffuser les statistiques du Super Admin, car tout changement peut les affecter.
    const totalUserCount = await userModel.countAllUsers();
    const adminCount = await userModel.countUsersByRole(ROLES.ADMINISTRATOR);
    const establishmentCountResult = await db('establishments').count('id as count').first();
    const pendingCountGlobal = await userModel.countPendingUsers();
    const establishmentsWithCounts = await db('establishments as e')
      .select('e.id', 'e.name')
      .count('u.id as userCount')
      .leftJoin('users as u', function() {
          this.on('e.id', '=', 'u.establishment_id').andOn('u.approved', '=', db.raw('true'));
      })
      .groupBy('e.id', 'e.name')
      .orderBy('e.name');

    const superAdminStats = {
      totalUserCount,
      adminCount,
      establishmentCount: establishmentCountResult ? Number(establishmentCountResult.count) : 0,
      pendingCount: pendingCountGlobal,
      establishmentsWithCounts
    };
    authNamespace.emit('adminStatsUpdate', { superAdminStats });

    // Si un établissement spécifique a été affecté, diffuser également ses statistiques.
    if (options.establishmentId) {
        const establishmentId = options.establishmentId;
        const establishmentUsers = await userModel.getUsersByEstablishmentId(establishmentId);
        const adminStats = {
            establishmentId: establishmentId,
            studentCount: establishmentUsers.filter(u => u.role === ROLES.STUDENT && u.approved).length,
            professorCount: establishmentUsers.filter(u => u.role === ROLES.PROFESSOR && u.approved).length,
            parentCount: establishmentUsers.filter(u => u.role === ROLES.PARENT && u.approved).length,
            pendingCount: establishmentUsers.filter(u => !u.approved).length
        };
        authNamespace.emit('adminStatsUpdate', { adminStats });
    }
  } catch (error) {
    console.error('Erreur broadcastAdminStats:', error);
  }
}

// Routes
app.use('/', authRoutes);
app.use('/chat', chatRoutes);
app.use('/api', apiRoutes);
app.use('/communications', communicationRoutes);
app.use('/admin', adminRoutes);
app.use('/students', studentRoutes);
app.use('/establishments', establishmentRoutes); // Utilisation des nouvelles routes

// Utilisation des routes pour les notifications avec le préfixe /notifications
app.use('/notifications', notificationRoutes);

// Partager la session Express avec Socket.IO (wrapper pour middleware Express)
const wrap = (middleware) => (socket, next) => middleware(socket.request, {}, next);

const publicNamespace = io.of('/public');
const authNamespace = io.of('/');

publicNamespace.on('connection', (socket) => {
  console.log('Client public connecté à /public');
});

authNamespace.use(wrap(sessionMiddleware));
authNamespace.use(wrap(passport.initialize()));
authNamespace.use(wrap(passport.session()));

// Middleware pour l'authentification Socket.IO
authNamespace.use((socket, next) => {
  // Passport doit maintenant avoir désérialisé l'utilisateur sur socket.request
  if (socket.request && socket.request.user) {
    socket.userId = socket.request.user.id;
    socket.user = socket.request.user;
    return next();
  }
  return next(new Error('Non authentifié'));
});

// Gestion des connexions Socket.IO
authNamespace.on('connection', (socket) => { // Note: les gestionnaires à l'intérieur sont maintenant asynchrones
  (async () => {
    console.log(`Utilisateur connecté: ${socket.user.name} (${socket.userId})`);
    // La gestion des utilisateurs en ligne ne fonctionne que si Redis est configuré
    if (pubClient) {
      await pubClient.sAdd('online_users', socket.userId.toString());
      
      // Diffuser la liste mise à jour des utilisateurs en ligne à tout le monde
      const onlineUserIds = await pubClient.sMembers('online_users');
      authNamespace.emit('onlineUsersUpdate', onlineUserIds);
    }

    socket.join(`user_${socket.userId}`); // Rejoindre sa propre room pour recevoir ses messages
  })();
  // Envoyer un message (avec confirmation)
  socket.on('sendMessage', async (data, callback) => {
    try {
      const { receiverId, message } = data;

      if (!message || message.trim().length === 0) {
        if (typeof callback === 'function') callback({ success: false, error: 'Le message ne peut pas être vide.' });
        return;
      }

      // --- VÉRIFICATION DE SÉCURITÉ ---
      // On s'assure que l'expéditeur a le droit de parler au destinataire.
      const sender = socket.user;
      const receiver = await userModel.getUserById(receiverId);

      if (!receiver) {
        if (typeof callback === 'function') callback({ success: false, error: 'Destinataire introuvable.' });
        return;
      }

      const canInteract = 
        sender.role === ROLES.SUPER_ADMIN || // Le SUPER_ADMIN peut parler à tout le monde
        (sender.establishment_id && sender.establishment_id === receiver.establishment_id); // Les autres ne parlent qu'au sein de leur établissement

      if (!canInteract) {
        if (typeof callback === 'function') callback({ success: false, error: 'Vous n\'êtes pas autorisé à interagir avec cet utilisateur.' });
        return;
      }
      // --- FIN DE LA VÉRIFICATION ---
      
      // Utilisation d'une transaction pour garantir la cohérence des données
      const newMessage = await db.transaction(async (trx) => {
        // 1. Sauvegarder dans la base de données
        const savedMessage = await chatModel.sendMessage(socket.userId, receiverId, message, trx);

        // 2. Créer la notification associée
        await notificationModel.createNotification({
          user_id: parseInt(receiverId),
          user_role: 'all',
          type: 'message',
          title: `Nouveau message de ${socket.user.name}`,
          body: message.trim().substring(0, 100),
          message: message.trim().substring(0, 100), // Correction ici : 'body' doit être 'message'
          link: '/chat'
        }, trx);

        return savedMessage;
      });

      // 3. Envoyer au destinataire en temps réel (après succès de la transaction)
      authNamespace.to(`user_${receiverId}`).emit('newMessage', {
        message: newMessage,
        senderId: socket.userId,
        senderName: socket.user.name,
        timestamp: new Date() // Le timestamp du message de la DB serait plus précis
      });

      // 4. Confirmer à l'expéditeur
      if (typeof callback === 'function') callback({ success: true, message: newMessage });

      // 5. Mettre à jour les badges du destinataire (chat et notifications)
      const unreadChatCount = await chatModel.getUnreadCount(receiverId);
      authNamespace.to(`user_${receiverId}`).emit('unreadChatUpdate', { count: unreadChatCount });
      emitNotificationUpdate(receiverId); // Utilise le nouvel helper
    } catch (error) {
      console.error('Erreur sendMessage:', error);
      if (typeof callback === 'function') callback({ success: false, error: 'Impossible d\'enregistrer le message.' });
    }
  });

  // Marquer les messages comme lus
  socket.on('markRead', async (data) => {
    try {
      const { senderId } = data; // L'ID de l'autre participant de la conversation
      const conversationId = await chatModel.getOrCreateConversation(socket.userId, senderId);
      await chatModel.markMessagesAsRead(conversationId, socket.userId);
      
      authNamespace.to(`user_${senderId}`).emit('messageRead', { // Informer l'expéditeur que ses messages ont été lus
        readerId: socket.userId,
        conversationId: conversationId
      });
      // Mettre à jour le badge de notification du chat pour l'utilisateur actuel
      const unreadCount = await chatModel.getUnreadCount(socket.userId);
      authNamespace.to(`user_${socket.userId}`).emit('unreadChatUpdate', {
        count: unreadCount
      });

    } catch (error) {
      console.error('Erreur markRead:', error);
    }
  });

  // Typing (indicateur de saisie)
  socket.on('typing', (data) => {
    socket.to(`user_${data.receiverId}`).emit('userTyping', {
      userId: socket.userId,
      userName: socket.user.name
    });
  });

  // Déconnexion
  socket.on('disconnect', async () => {
    if (socket.user) { // S'assurer que l'utilisateur était bien authentifié
      console.log(`Utilisateur déconnecté: ${socket.user.name} (${socket.userId})`);
      // La gestion des utilisateurs en ligne ne fonctionne que si Redis est configuré
      if (pubClient) {
        await pubClient.sRem('online_users', socket.userId.toString());
        const onlineUserIds = await pubClient.sMembers('online_users');
        authNamespace.emit('onlineUsersUpdate', onlineUserIds);
      }
    }
  });
});

// Rendre io et les helpers accessibles dans les routes
app.set('io', io);
app.set('authIo', authNamespace); // Rendre le namespace authentifié accessible
app.set('publicIo', publicNamespace);
app.set('broadcastDashboardStats', broadcastDashboardStats);
app.set('broadcastAdminStats', broadcastAdminStats);

/**
 * Helper to emit a notification update to a specific user via Socket.IO.
 * @param {number} userId - The ID of the user to notify.
 */
async function emitNotificationUpdate(userId) {
  try {
    const unreadCount = await notificationModel.getUnreadNotificationCountForUser({ id: userId });
    authNamespace.to(`user_${userId}`).emit('newNotification', { unreadCount });
  } catch (error) {
    console.error(`Failed to emit notification update for user ${userId}:`, error);
  }
}

app.set('emitNotificationUpdate', emitNotificationUpdate);

/**
 * Fonction de démarrage asynchrone pour s'assurer que la base de données
 * est prête avant de lancer le serveur.
 */
async function startServer() {
  // 1. Connecter les clients Redis et configurer l'adaptateur
  if (pubClient && subClient) {
    try {
      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      console.log('Adaptateur Redis pour Socket.IO configuré avec succès.');
      pubClient.on('error', (err) => console.error('Erreur client Redis (Pub):', err));
      subClient.on('error', (err) => console.error('Erreur client Redis (Sub):', err));
    } catch (err) {
      console.error('Erreur de connexion à Redis. Le serveur va démarrer sans scalabilité temps réel.', err);
      // Le serveur peut continuer, mais ne sera pas scalable pour les sockets.
    }
  } else {
    console.log('REDIS_URL non fournie. Démarrage sans adaptateur Redis. La scalabilité temps réel est désactivée.');
  }
  
  // 2. Initialiser le service d'e-mail (après la configuration de Redis)
  try {
    await initializeEmailService();
    console.log('Service d\'e-mail initialisé.');
  } catch (err) {
    console.error('Erreur lors de l\'initialisation du service d\'e-mail:', err);
  }
  // 3. Démarre le serveur HTTP
  server.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
  });
}
/**
 * Gère l'arrêt propre du serveur (Graceful Shutdown) en fermant les connexions
 * avant de terminer le processus.
 * @param {string} signal - Le signal qui a déclenché l'arrêt.
 * @param {function} callback - La fonction à appeler une fois le nettoyage terminé.
 */
const gracefulShutdown = (signal, callback) => {
    console.log(`\n${signal} reçu. Arrêt du serveur en cours...`);

    // Ajout d'un timeout pour forcer la sortie si l'arrêt prend trop de temps
    const timeout = setTimeout(() => {
        console.error('Arrêt forcé : le "graceful shutdown" a pris trop de temps (5s).');
        callback(); // Appelle le callback pour que le processus se termine ou signale nodemon
    }, 5000); // 5 secondes de délai

    io.close(); // Force la déconnexion des clients socket.io

    server.close(async () => {
        clearTimeout(timeout); // L'arrêt a réussi, on annule le timeout
        console.log('Serveur HTTP arrêté.');
        try {
            if (pubClient && subClient && pubClient.isOpen) {
            await Promise.all([pubClient.quit(), subClient.quit()]);
            console.log('Connexions Redis fermées.');
            }
            await db.destroy();
            console.log('Connexion à la base de données fermée.');
        } catch (err) {
            console.error('Erreur lors de la fermeture des connexions:', err.message);
        } finally {
            callback();
        }
    });
};

// Écouter les signaux d'arrêt courants pour nodemon et autres environnements
// Utiliser .once pour que le handler ne se déclenche qu'une fois.
// Après le nettoyage, on renvoie le signal pour que le processus se termine
// de manière standard, ce qui est plus propre que process.exit().
process.once('SIGINT', () => {
  gracefulShutdown('SIGINT', () => {
    process.kill(process.pid, 'SIGINT');
  });
});

process.once('SIGTERM', () => {
  gracefulShutdown('SIGTERM', () => {
    process.kill(process.pid, 'SIGTERM');
  });
});

// Gérer le redémarrage de nodemon pour éviter les erreurs EADDRINUSE
process.once('SIGUSR2', () => {
  gracefulShutdown('SIGUSR2', () => {
    // Une fois le nettoyage terminé, on renvoie le signal à nodemon pour qu'il puisse
    // tuer le processus et en démarrer un nouveau.
    process.kill(process.pid, 'SIGUSR2');
  });
});

// Routes calendrier scolaire

// Page calendrier
app.get('/school-life/calendar', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    
    try {
        res.render('school-life/calendar', {
            title: 'Calendrier Scolaire',
            events: [],
            user: req.user
        });
    } catch (error) {
        console.error('Erreur calendrier:', error);
        req.flash('error_msg', 'Erreur: ' + error.message);
        res.redirect('/dashboard');
    }
});

// API - Récupérer les événements
app.get('/api/calendar/events', async (req, res) => {
    if (!req.user) return res.status(401).json([]);
    
    try {
        const type = req.query.type;
        let query = db('events').where({ establishment_id: req.user.establishment_id });
        
        if (type && type !== 'all') {
            query = query.where({ event_type: type });
        }
        
        const events = await query.orderBy('start_date', 'asc').select('*');

        const formatted = events.map(e => ({
            id: e.id,
            title: e.title,
            start: e.start_date,
            end: e.end_date,
            backgroundColor: e.color || '#0d6efd',
            borderColor: e.color || '#0d6efd',
            textColor: '#ffffff',
            extendedProps: { 
                description: e.description || '', 
                type: e.event_type || 'Période scolaire' 
            }
        }));

        res.json(formatted);
    } catch (error) {
        console.error('Erreur API events:', error);
        res.status(500).json([]);
    }
});

// API - Créer un événement
app.post('/api/calendar/events', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    
    try {
        const { title, description, event_type, start_date, end_date, color } = req.body;
        
        const [id] = await db('events').insert({
            establishment_id: req.user.establishment_id,
            title, 
            description: description || '', 
            event_type: event_type || 'Période scolaire',
            start_date, 
            end_date, 
            color: color || '#0d6efd',
            created_by: req.user.id,
            created_at: new Date(),
            updated_at: new Date()
        });
        
        res.status(201).json({ 
            success: true, 
            event: { id, title, start: start_date, end: end_date, backgroundColor: color } 
        });
    } catch (error) {
        console.error('Erreur création:', error);
        res.status(500).json({ error: error.message });
    }
});

// API - Modifier un événement
app.put('/api/calendar/events/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    
    try {
        const { title, description, event_type, start_date, end_date, color } = req.body;
        await db('events')
            .where({ id: req.params.id, establishment_id: req.user.establishment_id })
            .update({ title, description, event_type, start_date, end_date, color, updated_at: new Date() });
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur mise à jour:', error);
        res.status(500).json({ error: error.message });
    }
});

// API - Supprimer un événement
app.delete('/api/calendar/events/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    
    try {
        await db('events')
            .where({ id: req.params.id, establishment_id: req.user.establishment_id })
            .del();
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur suppression:', error);
        res.status(500).json({ error: error.message });
    }
});
const schoolLifeRoutes = require('./src/routes/schoolLifeRoutes');
app.use('/', schoolLifeRoutes);

// Créer la table events si elle n'existe pas (sans migration)
async function createEventsTable() {
    try {
        const hasTable = await db.schema.hasTable('events');
        if (!hasTable) {
            await db.schema.createTable('events', function(table) {
                table.increments('id').primary();
                table.integer('establishment_id').notNullable();
                table.string('title', 255).notNullable();
                table.text('description');
                table.string('event_type', 50).defaultTo('Période scolaire');
                table.date('start_date').notNullable();
                table.date('end_date').notNullable();
                table.string('color', 7).defaultTo('#0d6efd');
                table.integer('created_by').notNullable();
                table.timestamps(true, true);
            });
            console.log('✅ Table events créée avec succès');
        } else {
            console.log('✅ Table events existe déjà');
        }
    } catch (error) {
        console.error('❌ Erreur création table events:', error.message);
    }
}

// Appeler après le démarrage
createEventsTable();

// Page emplois du temps
app.get('/school-life/timetables', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    
    try {
        res.render('school-life/timetables', {
            title: 'Emplois du Temps',
            user: req.user
        });
    } catch (error) {
        console.error('Erreur timetables:', error);
        req.flash('error_msg', 'Erreur lors du chargement.');
        res.redirect('/dashboard');
    }
});
// ==========================================================================
// ROUTES EMPLOI DU TEMPS
// ==========================================================================

// Page emplois du temps (Vie Scolaire - édition)
app.get('/school-life/timetables', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    
    try {
        // Récupérer la liste des classes depuis la table users
        const classes = await db('users')
            .where({ establishment_id: req.user.establishment_id, role: 'STUDENT' })
            .distinct('student_class')
            .whereNotNull('student_class')
            .orderBy('student_class')
            .pluck('student_class');

        console.log('📅 Classes disponibles:', classes);

        res.render('school-life/timetables', {
            title: 'Emplois du Temps',
            user: req.user,
            classes: classes
        });
    } catch (error) {
        console.error('Erreur timetables:', error);
        req.flash('error_msg', 'Erreur lors du chargement.');
        res.redirect('/dashboard');
    }
});

// Page emploi du temps (Consultation pour tous les rôles)
app.get('/timetable-view', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    
    try {
        let defaultClass = '';
        let children = [];
        let classes = [];

        // ÉLÈVE : afficher directement sa classe
        if (req.user.role === 'STUDENT' || req.user.role === 'eleve') {
            defaultClass = req.user.student_class || '';
            classes = [defaultClass];
        }
        // PARENT : classes des enfants
        else if (req.user.role === 'PARENT' || req.user.role === 'parent') {
            children = await userModel.getLinkedChildrenForParent(req.user.id);
            classes = children.map(c => c.student_class).filter(Boolean);
            classes = [...new Set(classes)];
            if (classes.length > 0) {
                defaultClass = classes[0];
            }
            if (req.session.selectedChildId) {
                const selectedChild = children.find(c => c.id == req.session.selectedChildId);
                if (selectedChild && selectedChild.student_class) {
                    defaultClass = selectedChild.student_class;
                }
            }
        }
        // AUTRES : toutes les classes
        else {
            classes = await db('users')
                .where({ establishment_id: req.user.establishment_id, role: 'STUDENT' })
                .distinct('student_class')
                .whereNotNull('student_class')
                .orderBy('student_class')
                .pluck('student_class');
            if (classes.length > 0) {
                defaultClass = classes[0];
            }
        }

        console.log('📅 TimetableView - User:', req.user.name, 'Role:', req.user.role);
        console.log('📅 Classes:', classes, 'Default:', defaultClass);

        res.render('shared/timetable-view', {
            title: 'Emploi du Temps',
            user: req.user,
            classes: classes,
            defaultClass: defaultClass,
            children: children,
            readOnly: true
        });
    } catch (error) {
        console.error('Erreur timetable-view:', error);
        req.flash('error_msg', 'Erreur lors du chargement.');
        res.redirect('/dashboard');
    }
});

// API - Récupérer l'emploi du temps d'une classe
app.get('/api/timetables/:className', async (req, res) => {
    if (!req.user) return res.status(401).json([]);
    
    try {
        const className = req.params.className;
        console.log('📅 API - Chargement emploi du temps pour:', className);
        
        // Chercher d'abord avec le nom exact
        let entries = await db('timetables')
            .where({ 
                establishment_id: req.user.establishment_id,
                class_name: className 
            })
            .orderBy('day_order')
            .orderBy('time_slot')
            .select('*');
        
        // Si rien trouvé, essayer sans le filtre establishment_id
        if (entries.length === 0) {
            console.log('⚠️ Aucune entrée avec establishment_id, recherche sans...');
            entries = await db('timetables')
                .where({ class_name: className })
                .orderBy('day_order')
                .orderBy('time_slot')
                .select('*');
        }
        
        console.log('📅 Entrées trouvées:', entries.length);
        
        // Formater pour le frontend
        const formatted = entries.map(entry => ({
            id: entry.id,
            day: entry.day,
            time_slot: entry.time_slot,
            subject: entry.subject,
            teacher: entry.teacher,
            room: entry.room,
            color: entry.color
        }));
        
        res.json(formatted);
    } catch (error) {
        console.error('Erreur API timetables:', error);
        res.status(500).json([]);
    }
});

// API - Sauvegarder une entrée d'emploi du temps (Vie Scolaire)
app.post('/api/timetables', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    
    try {
        const { class_name, day, time_slot, subject, teacher, room, color } = req.body;
        
        // Normaliser le nom de classe
        const classMap = {
            'Sixième': '6ème', 'Cinquième': '5ème', 'Quatrième': '4ème', 'Troisième': '3ème',
            'Seconde': '2nde', 'Première': '1ère', 'Terminale': 'Tle'
        };
        const normalizedClassName = classMap[class_name] || class_name;
        
        console.log('💾 Sauvegarde emploi du temps:', { original: class_name, normalized: normalizedClassName, day, time_slot, subject });
        const dayOrder = { 'Lundi': 1, 'Mardi': 2, 'Mercredi': 3, 'Jeudi': 4, 'Vendredi': 5 };
        
        const existing = await db('timetables')
            .where({ 
                establishment_id: req.user.establishment_id, 
                class_name, 
                day, 
                time_slot 
            })
            .first();
        
        if (existing) {
            await db('timetables').where({ id: existing.id }).update({
                subject, 
                teacher: teacher || null, 
                room: room || null, 
                color: color || '#0d6efd',
                day_order: dayOrder[day] || 0,
                updated_at: new Date()
            });
            console.log('✅ Entrée mise à jour');
        } else {
            await db('timetables').insert({
                establishment_id: req.user.establishment_id,
                class_name, 
                day, 
                day_order: dayOrder[day] || 0,
                time_slot, 
                subject, 
                teacher: teacher || null, 
                room: room || null, 
                color: color || '#0d6efd',
                created_by: req.user.id,
                created_at: new Date(),
                updated_at: new Date()
            });
            console.log('✅ Nouvelle entrée créée');
        }
         
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur sauvegarde:', error);
        res.status(500).json({ error: error.message });
    }
});

// API - Supprimer une entrée
app.delete('/api/timetables/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    
    try {
        await db('timetables')
            .where({ id: req.params.id, establishment_id: req.user.establishment_id })
            .del();
        console.log('🗑️ Entrée supprimée:', req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur suppression:', error);
        res.status(500).json({ error: error.message });
    }
});

// API - Sauvegarder tout l'emploi du temps d'une classe (en masse)
app.post('/api/timetables/bulk', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    
    try {
        const { class_name, entries } = req.body;
        
        if (!class_name || !entries || !Array.isArray(entries)) {
            return res.status(400).json({ error: 'Données invalides' });
        }
        
        console.log('💾 Sauvegarde en masse:', class_name, entries.length, 'entrées');
        
        // Supprimer les anciennes entrées de cette classe
        await db('timetables')
            .where({ 
                establishment_id: req.user.establishment_id,
                class_name: class_name 
            })
            .del();
        
        // Insérer les nouvelles
        const dayOrder = { 'Lundi': 1, 'Mardi': 2, 'Mercredi': 3, 'Jeudi': 4, 'Vendredi': 5 };
        
        for (const entry of entries) {
            await db('timetables').insert({
                establishment_id: req.user.establishment_id,
                class_name: class_name,
                day: entry.day,
                day_order: dayOrder[entry.day] || 0,
                time_slot: entry.time_slot,
                subject: entry.subject,
                teacher: entry.teacher || null,
                room: entry.room || null,
                color: entry.color || '#0d6efd',
                created_by: req.user.id,
                created_at: new Date(),
                updated_at: new Date()
            });
        }

        console.log('✅ Emploi du temps sauvegardé en masse');
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur sauvegarde en masse:', error);
        res.status(500).json({ error: error.message });
    }
});

// Créer la table timetables si elle n'existe pas
async function createTimetablesTable() {
    try {
        const hasTable = await db.schema.hasTable('timetables');
        if (!hasTable) {
            await db.schema.createTable('timetables', function(table) {
                table.increments('id').primary();
                table.integer('establishment_id').notNullable().index();
                table.string('class_name', 100).notNullable().index('idx_class');
                table.string('day', 20).notNullable();
                table.integer('day_order').defaultTo(0);
                table.string('time_slot', 50).notNullable();
                table.string('subject', 100).notNullable();
                table.string('teacher', 100);
                table.string('room', 50);
                table.string('color', 20).defaultTo('#0d6efd');
                table.integer('created_by').notNullable();
                table.timestamps(true, true);
                table.index(['day_order', 'time_slot'], 'idx_day_slot');
            });
            console.log('✅ Table timetables créée');
        } else {
            console.log('✅ Table timetables existe déjà');
            
            // Vérifier si la colonne day_order existe
            const hasDayOrder = await db.schema.hasColumn('timetables', 'day_order');
            if (!hasDayOrder) {
                await db.schema.alterTable('timetables', function(table) {
                    table.integer('day_order').defaultTo(0);
                });
                console.log('✅ Colonne day_order ajoutée');
            }
        }
    } catch (error) {
        console.error('❌ Erreur création table timetables:', error.message);
    }
}

/**
 * Normalise les noms de classes dans la table timetables pour assurer la cohérence.
 * Par exemple, transforme 'Sixième', '6eme', etc. en '6ème'.
 */
async function normalizeTimetableClassNames() {
    try {
        console.log('🔄 Normalisation des noms de classe dans la table timetables...');
        const classMap = {
            '6ème': ['Sixième', 'sixieme', '6eme', '6e'],
            '5ème': ['Cinquième', 'cinquieme', '5eme', '5e'],
            '4ème': ['Quatrième', 'quatrieme', '4eme', '4e'],
            '3ème': ['Troisième', 'troisieme', '3eme', '3e'],
            '2nde': ['Seconde', 'seconde', '2nd'],
            '1ère': ['Première', 'premiere', '1ere', '1re'],
            'Tle': ['Terminale', 'terminale', 'tle']
        };

        let totalUpdated = 0;
        for (const [normalizedName, variants] of Object.entries(classMap)) {
            const updatedRows = await db('timetables')
                .whereIn('class_name', variants)
                .update({ class_name: normalizedName });
            totalUpdated += updatedRows;
        }

        if (totalUpdated > 0) {
            console.log(`✅ Normalisation des noms de classe terminée. ${totalUpdated} entrées mises à jour.`);
        }
    } catch (error) {
        console.error('❌ Erreur lors de la normalisation des noms de classe:', error.message);
    }
}

createTimetablesTable();
normalizeTimetableClassNames(); // Appeler la fonction de normalisation au démarrage

// Page gestion des absences
app.get('/school-life/absences', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    
    try {
        // Récupérer les classes et professeurs
        const classes = await db('users')
            .where({ establishment_id: req.user.establishment_id, role: 'STUDENT' })
            .distinct('student_class')
            .whereNotNull('student_class')
            .orderBy('student_class')
            .pluck('student_class');

        const professors = await db('users')
            .where({ establishment_id: req.user.establishment_id, role: 'PROFESSOR' })
            .select('id', 'name')
            .orderBy('name');

        res.render('school-life/absences', {
            title: 'Gestion des Absences & Retards',
            user: req.user,
            classes: classes,
            professors: professors
        });
    } catch (error) {
        console.error('Erreur absences:', error);
        req.flash('error_msg', 'Erreur lors du chargement.');
        res.redirect('/dashboard');
    }
});

// API - Récupérer les absences (CORRIGÉ avec filtre user_id)
app.get('/api/absences', async (req, res) => {
    if (!req.user) return res.status(401).json([]);
    
    try {
        const { user_id, user_type, class_name, date_debut, date_fin, status } = req.query;
        let query = db('absences')
            .where({ 'absences.establishment_id': req.user.establishment_id })
            .leftJoin('users', 'absences.user_id', 'users.id')
            .select(
                'absences.*',
                'users.name as user_name',
                'users.student_class'
            );
        
        // === FILTRE PAR USER_ID (prioritaire) ===
        if (user_id && user_id !== '') {
            query = query.where({ 'absences.user_id': parseInt(user_id) });
        }
        
        if (user_type) {
            query = query.where({ 'absences.user_type': user_type });
        }
        if (status && status !== '') {
            query = query.where({ 'absences.status': status });
        }
        if (date_debut && date_debut !== '') {
            query = query.where('absences.date', '>=', date_debut);
        }
        if (date_fin && date_fin !== '') {
            query = query.where('absences.date', '<=', date_fin);
        }
        if (class_name && class_name !== '' && user_type === 'student') {
            query = query.where('users.student_class', class_name);
        }

        const absences = await query
            .orderBy('absences.date', 'desc')
            .orderBy('absences.created_at', 'desc');

        console.log('📊 Absences trouvées:', absences.length, '| user_id:', user_id || 'tous');
        res.json(absences);
    } catch (error) {
        console.error('❌ Erreur GET /api/absences:', error.message);
        res.json([]);
    }
});
// API - Créer une absence/retard
app.post('/api/absences', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    
    try {
        const { user_id, user_type, type, date, heure_arrivee, motif, commentaire, status } = req.body;
        
        console.log('📝 Données reçues:', JSON.stringify(req.body));
        
        if (!user_id || !date) {
            return res.status(400).json({ success: false, error: 'Champs obligatoires manquants' });
        }
        
        const insertData = {
            establishment_id: req.user.establishment_id,
            user_id: parseInt(user_id),
            user_type: user_type || 'student',
            type: type || 'absence',
            status: status || 'non_justifiee',
            date: date,
            heure_arrivee: type === 'retard' ? heure_arrivee : null,
            motif: motif || '',
            commentaire: commentaire || '',
            created_by: req.user.id
        };
        
        // ✅ Correction : insert retourne directement l'ID avec SQLite, ou un tableau avec MySQL
        const result = await db('absences').insert(insertData);
        const id = Array.isArray(result) ? result[0] : result;
        
        console.log('✅ Absence créée, ID:', id);
        
        res.status(201).json({ success: true, id: id });
    } catch (error) {
        console.error('❌ Erreur:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API - Mettre à jour le statut
app.put('/api/absences/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    
    try {
        const { status, motif, commentaire } = req.body;
        await db('absences').where({ id: req.params.id }).update({
            status: status || 'non_justifiee',
            motif: motif || '',
            commentaire: commentaire || '',
            updated_at: new Date()
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API - Supprimer
app.delete('/api/absences/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    
    try {
        await db('absences').where({ id: req.params.id }).del();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API - Récupérer toutes les classes
app.get('/api/all-classes', async (req, res) => {
    if (!req.user) return res.status(401).json([]);
    
    try {
        const classes = await db('users')
            .where({ establishment_id: req.user.establishment_id, role: 'STUDENT' })
            .distinct('student_class')
            .whereNotNull('student_class')
            .orderBy('student_class')
            .pluck('student_class');
        res.json(classes);
    } catch (error) {
        res.status(500).json([]);
    }
});

// API - Récupérer la liste des professeurs
app.get('/api/professors-list', async (req, res) => {
    if (!req.user) return res.status(401).json([]);
    
    try {
        const professors = await db('users')
            .where({ establishment_id: req.user.establishment_id, role: 'PROFESSOR' })
            .select('id', 'name')
            .orderBy('name');
        res.json(professors);
    } catch (error) {
        res.status(500).json([]);
    }
});

// API - Récupérer les élèves d'une classe (insensible à la casse)
app.get('/api/students-by-class/:className', async (req, res) => {
    if (!req.user) return res.status(401).json([]);
    try {
        const className = decodeURIComponent(req.params.className);
        console.log('Recherche élèves - Classe:', className);
        
        const students = await db('users')
            .where({ 
                establishment_id: req.user.establishment_id, 
                student_class: className,
                approved: 1
            })
            .whereIn('role', ['STUDENT', 'student', 'eleve', 'élève'])
            .select('id', 'name', 'matricule', 'student_class')
            .orderBy('name');
        
        console.log('Élèves trouvés:', students.length);
        res.json(students);
    } catch (error) {
        console.error('Erreur students-by-class:', error);
        res.status(500).json([]);
    }
});

// Créer la table absences si elle n'existe pas
async function createAbsencesTable() {
    try {
        const hasTable = await db.schema.hasTable('absences');
        if (!hasTable) {
            await db.schema.createTable('absences', function(table) {
                table.increments('id').primary();
                table.integer('establishment_id').notNullable();
                table.integer('user_id').notNullable(); // ID de l'élève ou du professeur
                table.string('user_type', 20).notNullable(); // 'student' ou 'professor'
                table.string('type', 20).notNullable();
                table.string('status', 20).defaultTo('non_justifiee');
                table.date('date').notNullable();
                table.string('heure_arrivee', 10);
                table.string('motif', 500);
                table.string('justificatif_url', 500);
                table.text('commentaire');
                table.integer('created_by').notNullable();
                table.timestamps(true, true);
            });
            console.log('✅ Table absences créée');
        } else {
            console.log('✅ Table absences existe déjà');
        }
    } catch (error) {
        console.error('❌ Erreur création table absences:', error.message);
    }
}

createAbsencesTable();

// API - Récupérer toutes les classes (pour les filtres)
app.get('/api/all-classes', async (req, res) => {
    if (!req.user) return res.status(401).json([]);
    try {
        const classes = await db('users')
            .where({ establishment_id: req.user.establishment_id, role: 'STUDENT' })
            .distinct('student_class')
            .whereNotNull('student_class')
            .orderBy('student_class')
            .pluck('student_class');
        res.json(classes);
    } catch (error) {
        res.status(500).json([]);
    }
});

// API - Récupérer la liste des professeurs
app.get('/api/professors-list', async (req, res) => {
    if (!req.user) return res.status(401).json([]);
    try {
        const professors = await db('users')
            .where({ establishment_id: req.user.establishment_id, role: 'PROFESSOR' })
            .select('id', 'name')
            .orderBy('name');
        res.json(professors);
    } catch (error) {
        res.status(500).json([]);
    }
});

// ==========================================================================
// ROUTES DE CONSULTATION POUR TOUS LES RÔLES
// ==========================================================================

// Calendrier (consultation)
app.get('/calendar-view', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    try {
        const events = await db('events')
            .where({ establishment_id: req.user.establishment_id })
            .orderBy('start_date', 'asc')
            .select('*');
        
        res.render('shared/calendar-view', {
            title: 'Calendrier Scolaire',
            events: events,
            user: req.user,
            readOnly: true
        });
    } catch (error) {
        req.flash('error_msg', 'Erreur lors du chargement du calendrier.');
        res.redirect('/dashboard');
    }
});

// API - Récupérer l'emploi du temps d'une classe (avec correspondance des noms)
app.get('/api/timetables/:className', async (req, res) => {
    if (!req.user) return res.status(401).json([]);
    
    try {
        const className = req.params.className;
        console.log('📅 API - Chargement emploi du temps pour:', className);
        
        // Table de correspondance : noms courts → noms longs
        const classMap = {
            '6ème': ['6ème', 'Sixième', 'sixieme', '6eme', '6e'],
            '5ème': ['5ème', 'Cinquième', 'cinquieme', '5eme', '5e'],
            '4ème': ['4ème', 'Quatrième', 'quatrieme', '4eme', '4e'],
            '3ème': ['3ème', 'Troisième', 'troisieme', '3eme', '3e'],
            '2nde': ['2nde', 'Seconde', 'seconde', '2nd'],
            '1ère': ['1ère', 'Première', 'premiere', '1ere', '1re'],
            'Tle': ['Tle', 'Terminale', 'terminale', 'tle']
        };
        
        // Trouver toutes les variantes possibles pour cette classe
        let searchTerms = [className];
        for (var key in classMap) {
            if (classMap[key].indexOf(className) !== -1) {
                searchTerms = classMap[key];
                break;
            }
        }
        
        console.log('📅 Recherche avec les termes:', searchTerms);
        
        // Chercher avec toutes les variantes
        let entries = await db('timetables')
            .where({ establishment_id: req.user.establishishment_id })
            .whereIn('class_name', searchTerms)
            .orderBy('day_order')
            .orderBy('time_slot')
            .select('*');
        
        // Si rien trouvé avec establishment_id, essayer sans
        if (entries.length === 0) {
            console.log(' Aucune entrée avec establishment_id, recherche sans...');
            entries = await db('timetables')
                .whereIn('class_name', searchTerms)
                .orderBy('day_order')
                .orderBy('time_slot')
                .select('*');
        }
        
        console.log(' Entrées trouvées:', entries.length);
        
        const formatted = entries.map(function(entry) {
            return {
                id: entry.id,
                day: entry.day,
                time_slot: entry.time_slot,
                subject: entry.subject,
                teacher: entry.teacher,
                room: entry.room,
                color: entry.color
            };
        });
        
        res.json(formatted);
    } catch (error) {
        console.error('Erreur API timetables:', error);
        res.status(500).json([]);
    }
});

// Absences (consultation) - CORRIGÉ
app.get('/absences-view', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    
    try {
        let userId = null;
        let children = [];
        let selectedChildId = null;

        if (req.user.role === 'STUDENT' || req.user.role === 'eleve') {
            userId = req.user.id;
        } else if (req.user.role === 'PARENT' || req.user.role === 'parent') {
            children = await userModel.getLinkedChildrenForParent(req.user.id);
            if (req.session.selectedChildId) {
                selectedChildId = req.session.selectedChildId;
                userId = req.session.selectedChildId;
            }
        } else if (req.user.role === 'PROFESSOR' || req.user.role === 'professeur') {
            userId = req.user.id;
        }

        const classes = await db('users')
            .where({ establishment_id: req.user.establishment_id, role: 'STUDENT' })
            .distinct('student_class')
            .whereNotNull('student_class')
            .orderBy('student_class')
            .pluck('student_class');

        res.render('shared/absences-view', {
            title: 'Consultation des Absences',
            user: req.user,
            classes: classes,
            userId: userId,
            children: children,
            selectedChildId: selectedChildId,
            readOnly: true
        });
    } catch (error) {
        console.error('Erreur absences-view:', error);
        req.flash('error_msg', 'Erreur lors du chargement.');
        res.redirect('/dashboard');
    }
});

// Page documents secrétaire
app.get('/secretary/documents', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    
    // Vérifier que l'utilisateur est secrétaire ou admin
    if (req.user.role !== 'SECRETARY' && req.user.role !== 'secretaire' && 
        req.user.role !== 'ADMINISTRATOR' && req.user.role !== 'administrateur') {
        req.flash('error_msg', 'Accès non autorisé.');
        return res.redirect('/dashboard');
    }
    
    try {
        res.render('secretary/documents', {
            title: 'Documents Scolaires',
            user: req.user
        });
    } catch (error) {
        console.error('Erreur documents:', error);
        req.flash('error_msg', 'Erreur lors du chargement.');
        res.redirect('/dashboard');
    }
});

// ==========================================================================
//// ==========================================================================
// ROUTES DOCUMENTS SECRÉTAIRE
// ==========================================================================

// Page documents
app.get('/secretary/documents', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    
    if (req.user.role !== 'SECRETARY' && req.user.role !== 'secretaire' && 
        req.user.role !== 'ADMINISTRATOR' && req.user.role !== 'administrateur') {
        req.flash('error_msg', 'Accès non autorisé.');
        return res.redirect('/dashboard');
    }
    
    try {
        res.render('secretary/documents', {
            title: 'Documents Scolaires',
            user: req.user
        });
    } catch (error) {
        console.error('Erreur documents:', error);
        req.flash('error_msg', 'Erreur lors du chargement.');
        res.redirect('/dashboard');
    }

    res.render('secretary/documents', {
    title: 'Documents Scolaires',
    user: req.user,
    establishmentName: req.user.establishment_name || 'Établissement',
    adminName: req.user.name
});
});

// API - Récupérer toutes les classes
app.get('/api/all-classes', async (req, res) => {
    if (!req.user) return res.status(401).json([]);
    try {
        const classes = await db('users')
            .where({ 
                establishment_id: req.user.establishment_id, 
                approved: 1 
            })
            .whereIn('role', ['STUDENT', 'student', 'eleve', 'élève', 'Eleve', 'Élève'])
            .whereNotNull('student_class')
            .distinct('student_class')
            .orderBy('student_class')
            .pluck('student_class');
        
        // Filtrer les valeurs vides après coup
        const filteredClasses = classes.filter(c => c && c.trim() !== '');
        
        console.log('📋 Classes trouvées:', filteredClasses.length, filteredClasses);
        res.json(filteredClasses);
    } catch (error) {
        console.error('Erreur all-classes:', error);
        res.status(500).json([]);
    }
});

// API - Récupérer tous les élèves
app.get('/api/all-students', async (req, res) => {
    if (!req.user) return res.status(401).json([]);
    
    try {
        const students = await db('users')
            .where({ 
                establishment_id: req.user.establishment_id, 
                approved: 1 
            })
            .whereIn('role', ['STUDENT', 'student', 'eleve', 'élève', 'Eleve', 'Élève'])
            .select('id', 'name', 'student_class', 'matricule')
            .orderBy('name');
        
        console.log('📋 Élèves trouvés:', students.length);
        res.json(students);
    } catch (error) {
        console.error('Erreur all-students:', error);
        res.status(500).json([]);
    }
});

// API - Récupérer les archives de documents
app.get('/api/documents/archives', async (req, res) => {
    if (!req.user) return res.status(401).json([]);
    
    try {
        const archives = await db('document_archives')
            .where({ establishment_id: req.user.establishment_id })
            .orderBy('created_at', 'desc')
            .limit(50)
            .select('*');
        
        res.json(archives || []);
    } catch (error) {
        console.error('Erreur archives:', error);
        res.status(500).json([]);
    }
});

// API - Générer un document
app.post('/api/documents/generate', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    
    try {
        const { type, student_id, class_name, data } = req.body;
        
        const [id] = await db('document_archives').insert({
            establishment_id: req.user.establishment_id,
            type: type,
            student_id: student_id || null,
            student_name: data?.student_name || '',
            student_class: class_name || data?.student_class || '',
            created_by: req.user.id,
            created_by_name: req.user.name,
            file_url: '',
            created_at: new Date()
        });
        
        console.log('📄 Document archivé:', type, 'ID:', id);
        
        res.json({ success: true, id: id });
    } catch (error) {
        console.error('Erreur génération document:', error);
        res.status(500).json({ error: error.message });
    }
});

// API - Récupérer les détails complets d'un élève
app.get('/api/student-details/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    
    try {
        console.log('🔍 Recherche étudiant ID:', req.params.id);
        
        // Chercher l'étudiant sans filtre de rôle
        const student = await db('users')
            .where({ id: req.params.id })
            .first();
        
        console.log('👤 Étudiant trouvé:', student ? student.name : 'NON');
        console.log('📋 Matricule:', student ? student.matricule : 'N/A');
        console.log('📋 date_of_birth:', student ? student.date_of_birth : 'N/A');
        console.log('📋 place_of_birth:', student ? student.place_of_birth : 'N/A');
        console.log('📋 address:', student ? student.address : 'N/A');
        
        if (!student) {
            return res.status(404).json({ error: 'Élève non trouvé' });
        }
        
        // Récupérer les parents liés (si matricule existe)
        let linkedParents = [];
        if (student.matricule) {
            linkedParents = await db('parent_student_links as psl')
                .join('users as u', 'psl.parent_id', 'u.id')
                .where('psl.student_matricule', student.matricule)
                .select('u.id', 'u.name', 'u.phone_number');
            console.log('👥 Parents liés:', linkedParents.length);
        }
        
        // Parser les parents manuels
        let manualParents = [];
        if (student.manual_parents) {
            try {
                manualParents = typeof student.manual_parents === 'string' 
                    ? JSON.parse(student.manual_parents) 
                    : student.manual_parents;
                console.log('👥 Parents manuels:', manualParents.length);
            } catch (e) {
                manualParents = [];
            }
        }
        
        // Retourner TOUTES les colonnes
        res.json({
            id: student.id,
            name: student.name,
            matricule: student.matricule,
            student_class: student.student_class,
            date_of_birth: student.date_of_birth,
            place_of_birth: student.place_of_birth,
            address: student.address,
            email: student.email,
            phone_number: student.phone_number,
            linkedParents: linkedParents,
            manualParents: manualParents
        });
        
    } catch (error) {
        console.error('❌ Erreur student-details:', error);
        res.status(500).json({ error: error.message });
    }
});

// Créer la table document_archives
async function createDocumentArchivesTable() {
    try {
        const hasTable = await db.schema.hasTable('document_archives');
        if (!hasTable) {
            await db.schema.createTable('document_archives', function(table) {
                table.increments('id').primary();
                table.integer('establishment_id').notNullable().index();
                table.string('type', 100).notNullable();
                table.integer('student_id').nullable();
                table.string('student_name', 255).nullable();
                table.string('student_class', 100).nullable();
                table.string('file_url', 500).nullable();
                table.integer('created_by').notNullable();
                table.string('created_by_name', 255).nullable();
                table.timestamp('created_at').defaultTo(db.fn.now());
            });
            console.log('✅ Table document_archives créée');
        } else {
            console.log('✅ Table document_archives existe déjà');
        }
    } catch (error) {
        console.error('❌ Erreur création table document_archives:', error.message);
    }
}

createDocumentArchivesTable();

const timetableRoutes = require('./src/routes/timetableRoutes');
app.use('/', timetableRoutes);

// Lancement de l'application
startServer();
