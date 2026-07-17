const dotenv = require('dotenv');
dotenv.config(); // Charge les variables d'environnement depuis le fichier .env
const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const flash = require('connect-flash');
const passport = require('passport');
const multer = require('multer');
const initializeDatabase = require('./src/config/db-init'); // Import de la fonction d'initialisation
const initializePassport = require('./src/config/passport-config');
const authRoutes = require('./src/routes/authRoutes');
const chatRoutes = require('./src/routes/chatRoutes');
const { forcePasswordChange } = require('./src/middleware/securityMiddleware');
const communicationRoutes = require('./src/routes/communicationRoutes');
const studentRoutes = require('./src/routes/studentRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const apiRoutes = require('./src/routes/apiRoutes');
const establishmentRoutes = require('./src/routes/establishmentRoutes'); // Ajout des routes pour les établissements
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
  pubClient = createClient({ url: process.env.REDIS_URL });
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

// Sessions - Configuration conditionnelle pour la production et le développement
let sessionStore;
if (process.env.NODE_ENV === 'production') {
  console.log('Configuration du store de session pour la production (PostgreSQL).');
  sessionStore = new pgSession({
    pool: db, // Utilise le pool Knex existant
    tableName: 'user_sessions', // Nom de la table pour les sessions
    createTableIfMissing: true, // Crée la table automatiquement
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
    httpOnly: true
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

// Routes
app.use('/', authRoutes);
app.use('/chat', chatRoutes);
app.use('/api', apiRoutes);
app.use('/communications', communicationRoutes);
app.use('/admin', adminRoutes);
app.use('/students', studentRoutes);
app.use('/establishments', establishmentRoutes); // Utilisation des nouvelles routes

// Partager la session Express avec Socket.IO (wrapper pour middleware Express)
const wrap = (middleware) => (socket, next) => middleware(socket.request, {}, next);

const publicNamespace = io.of('/public');
const authNamespace = io.of('/');

async function broadcastDashboardStats() {
  try {
    const totalUserCountResult = await db('users').where('status', 'active').count('id as count').first();
    const professorCount = await userModel.countUsersByRole('professeur');
    const establishmentCountResult = await db('establishments').count('id as count').first();
    const pendingCount = await userModel.countPendingUsers();

    publicNamespace.emit('dashboardUpdate', {
      totalUserCount: totalUserCountResult ? totalUserCountResult.count : 0,
      professorCount,
      establishmentCount: establishmentCountResult ? establishmentCountResult.count : 0,
      pendingCount
    });
  } catch (error) {
    console.error('Erreur broadcastDashboardStats:', error);
  }
}

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

      // 5. Mettre à jour le badge de chat non lu pour le destinataire
      try {
        const unreadCount = await chatModel.getUnreadCount(receiverId);
        authNamespace.to(`user_${receiverId}`).emit('unreadChatUpdate', {
          count: unreadCount
        });
      } catch (postSendError) {
        console.error('Erreur post-envoi (notification/badge):', postSendError);
      }

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
  
  // 2. Initialise la base de données (crée les tables si elles n'existent pas)
  await initializeDatabase();

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

// Lancement de l'application
startServer();
