const dotenv = require('dotenv');
dotenv.config();
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
const establishmentRoutes = require('./src/routes/establishmentRoutes');
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
const { initializeEmailService } = require('./src/utils/emailService');
const { createAdapter } = require("@socket.io/redis-adapter");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 5000;

if (!process.env.SESSION_SECRET) {
  throw new Error('FATAL ERROR: SESSION_SECRET is not defined in environment variables.');
}

let pubClient, subClient;
if (process.env.REDIS_URL) {
  console.log('Configuration des clients Redis car REDIS_URL est fournie.');
  const redisOptions = { url: process.env.REDIS_URL };
  if (process.env.NODE_ENV === 'production' && process.env.REDIS_URL.startsWith('rediss://')) {
    redisOptions.socket = { tls: true, rejectUnauthorized: false };
  }
  pubClient = createClient(redisOptions);
  subClient = pubClient.duplicate();
}

initializePassport(passport);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

app.use(express.static(path.join(__dirname, 'public')));

const uploadsPath = path.join(__dirname, 'uploads');
const avatarsPath = path.join(uploadsPath, 'avatars');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
if (!fs.existsSync(avatarsPath)) fs.mkdirSync(avatarsPath, { recursive: true });
app.use('/uploads', express.static(uploadsPath));

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarsPath),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `avatar-${req.user.id}-${uniqueSuffix}${extension}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Type de fichier non supporté.'));
  }
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('trust proxy', 1);

let sessionStore;
if (process.env.NODE_ENV === 'production') {
  console.log('Configuration du store de session pour la production (PostgreSQL).');
  sessionStore = new pgSession({
    knex: db,
    tableName: 'user_sessions',
    createTableIfMissing: true,
  });
} else {
  console.log('Configuration du store de session pour le développement (en mémoire).');
}

const sessionMiddleware = session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 1000 * 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax'
  }
});
app.use(sessionMiddleware);

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

app.use(async (req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  res.locals.user = req.user || null;
  res.locals.currentPath = req.path;

  if (req.user) {
    try {
      const unreadGeneral = await notificationModel.getUnreadNotificationCountForUser(req.user);
      res.locals.unreadCount = unreadGeneral;
      const unreadChat = await chatModel.getUnreadCount(req.user.id);
      res.locals.unreadChatCount = unreadChat;
    } catch (error) {
      res.locals.unreadCount = 0;
      res.locals.unreadChatCount = 0;
    }
  } else {
    res.locals.unreadCount = 0;
    res.locals.unreadChatCount = 0;
  }
  next();
});

app.use(forcePasswordChange);

app.get('/api/dashboard-stats', async (req, res) => {
  try {
    const stats = await getDashboardStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

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
    const stats = await getDashboardStats();
    publicNamespace.emit('dashboardUpdate', stats);
  } catch (error) {
    console.error('Erreur broadcastDashboardStats:', error);
  }
}

async function broadcastAdminStats(options = {}) {
  try {
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
      totalUserCount, adminCount,
      establishmentCount: establishmentCountResult ? Number(establishmentCountResult.count) : 0,
      pendingCount: pendingCountGlobal,
      establishmentsWithCounts
    };
    authNamespace.emit('adminStatsUpdate', { superAdminStats });

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

// Routes principales
app.use('/', authRoutes);
app.use('/chat', chatRoutes);
app.use('/api', apiRoutes);
app.use('/communications', communicationRoutes);
app.use('/admin', adminRoutes);
app.use('/students', studentRoutes);
app.use('/establishments', establishmentRoutes);
app.use('/notifications', notificationRoutes);

const wrap = (middleware) => (socket, next) => middleware(socket.request, {}, next);

const publicNamespace = io.of('/public');
const authNamespace = io.of('/');

publicNamespace.on('connection', (socket) => {
  console.log('Client public connecté à /public');
});

authNamespace.use(wrap(sessionMiddleware));
authNamespace.use(wrap(passport.initialize()));
authNamespace.use(wrap(passport.session()));

authNamespace.use((socket, next) => {
  if (socket.request && socket.request.user) {
    socket.userId = socket.request.user.id;
    socket.user = socket.request.user;
    return next();
  }
  return next(new Error('Non authentifié'));
});

authNamespace.on('connection', (socket) => {
  (async () => {
    console.log(`Utilisateur connecté: ${socket.user.name} (${socket.userId})`);
    if (pubClient) {
      await pubClient.sAdd('online_users', socket.userId.toString());
      const onlineUserIds = await pubClient.sMembers('online_users');
      authNamespace.emit('onlineUsersUpdate', onlineUserIds);
    }
    socket.join(`user_${socket.userId}`);
  })();

  socket.on('sendMessage', async (data, callback) => {
    try {
      const { receiverId, message } = data;
      if (!message || message.trim().length === 0) {
        if (typeof callback === 'function') callback({ success: false, error: 'Le message ne peut pas être vide.' });
        return;
      }
      const sender = socket.user;
      const receiver = await userModel.getUserById(receiverId);
      if (!receiver) {
        if (typeof callback === 'function') callback({ success: false, error: 'Destinataire introuvable.' });
        return;
      }
      const canInteract = sender.role === ROLES.SUPER_ADMIN || (sender.establishment_id && sender.establishment_id === receiver.establishment_id);
      if (!canInteract) {
        if (typeof callback === 'function') callback({ success: false, error: 'Non autorisé.' });
        return;
      }
      const newMessage = await db.transaction(async (trx) => {
        const savedMessage = await chatModel.sendMessage(socket.userId, receiverId, message, trx);
        await notificationModel.createNotification({
          user_id: parseInt(receiverId), user_role: 'all', type: 'message',
          title: `Nouveau message de ${socket.user.name}`,
          body: message.trim().substring(0, 100),
          message: message.trim().substring(0, 100),
          link: '/chat'
        }, trx);
        return savedMessage;
      });
      authNamespace.to(`user_${receiverId}`).emit('newMessage', {
        message: newMessage, senderId: socket.userId, senderName: socket.user.name, timestamp: new Date()
      });
      if (typeof callback === 'function') callback({ success: true, message: newMessage });
      const unreadChatCount = await chatModel.getUnreadCount(receiverId);
      authNamespace.to(`user_${receiverId}`).emit('unreadChatUpdate', { count: unreadChatCount });
      emitNotificationUpdate(receiverId);
    } catch (error) {
      console.error('Erreur sendMessage:', error);
      if (typeof callback === 'function') callback({ success: false, error: 'Impossible d\'enregistrer le message.' });
    }
  });

  socket.on('markRead', async (data) => {
    try {
      const { senderId } = data;
      const conversationId = await chatModel.getOrCreateConversation(socket.userId, senderId);
      await chatModel.markMessagesAsRead(conversationId, socket.userId);
      authNamespace.to(`user_${senderId}`).emit('messageRead', { readerId: socket.userId, conversationId: conversationId });
      const unreadCount = await chatModel.getUnreadCount(socket.userId);
      authNamespace.to(`user_${socket.userId}`).emit('unreadChatUpdate', { count: unreadCount });
    } catch (error) {
      console.error('Erreur markRead:', error);
    }
  });

  socket.on('typing', (data) => {
    socket.to(`user_${data.receiverId}`).emit('userTyping', { userId: socket.userId, userName: socket.user.name });
  });

  socket.on('disconnect', async () => {
    if (socket.user) {
      console.log(`Utilisateur déconnecté: ${socket.user.name} (${socket.userId})`);
      if (pubClient) {
        await pubClient.sRem('online_users', socket.userId.toString());
        const onlineUserIds = await pubClient.sMembers('online_users');
        authNamespace.emit('onlineUsersUpdate', onlineUserIds);
      }
    }
  });
});

app.set('io', io);
app.set('authIo', authNamespace);
app.set('publicIo', publicNamespace);
app.set('broadcastDashboardStats', broadcastDashboardStats);
app.set('broadcastAdminStats', broadcastAdminStats);

async function emitNotificationUpdate(userId) {
  try {
    const unreadCount = await notificationModel.getUnreadNotificationCountForUser({ id: userId });
    authNamespace.to(`user_${userId}`).emit('newNotification', { unreadCount });
  } catch (error) {
    console.error(`Failed to emit notification update for user ${userId}:`, error);
  }
}
app.set('emitNotificationUpdate', emitNotificationUpdate);

async function startServer() {
  if (pubClient && subClient) {
    try {
      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      console.log('Adaptateur Redis pour Socket.IO configuré avec succès.');
      pubClient.on('error', (err) => console.error('Erreur client Redis (Pub):', err));
      subClient.on('error', (err) => console.error('Erreur client Redis (Sub):', err));
    } catch (err) {
      console.error('Erreur de connexion à Redis.', err);
    }
  }
  try {
    await initializeEmailService();
    console.log('Service d\'e-mail initialisé.');
  } catch (err) {
    console.error('Erreur lors de l\'initialisation du service d\'e-mail:', err);
  }
  server.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
  });
}

const gracefulShutdown = (signal, callback) => {
    console.log(`\n${signal} reçu. Arrêt du serveur en cours...`);
    const timeout = setTimeout(() => { console.error('Arrêt forcé.'); callback(); }, 5000);
    io.close();
    server.close(async () => {
        clearTimeout(timeout);
        console.log('Serveur HTTP arrêté.');
        try {
            if (pubClient && subClient && pubClient.isOpen) {
            await Promise.all([pubClient.quit(), subClient.quit()]);
            console.log('Connexions Redis fermées.');
            }
            await db.destroy();
            console.log('Connexion à la base de données fermée.');
        } catch (err) {
            console.error('Erreur lors de la fermeture:', err.message);
        } finally { callback(); }
    });
};

process.once('SIGINT', () => { gracefulShutdown('SIGINT', () => { process.kill(process.pid, 'SIGINT'); }); });
process.once('SIGTERM', () => { gracefulShutdown('SIGTERM', () => { process.kill(process.pid, 'SIGTERM'); }); });
process.once('SIGUSR2', () => { gracefulShutdown('SIGUSR2', () => { process.kill(process.pid, 'SIGUSR2'); }); });

// ==========================================================================
// ROUTES CALENDRIER
// ==========================================================================
app.get('/school-life/calendar', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    try {
        res.render('school-life/calendar', { title: 'Calendrier Scolaire', events: [], user: req.user });
    } catch (error) { req.flash('error_msg', 'Erreur: ' + error.message); res.redirect('/dashboard'); }
});

app.get('/api/calendar/events', async (req, res) => {
    if (!req.user) return res.status(401).json([]);
    try {
        const type = req.query.type;
        let query = db('events').where({ establishment_id: req.user.establishment_id });
        if (type && type !== 'all') query = query.where({ event_type: type });
        const events = await query.orderBy('start_date', 'asc').select('*');
        const formatted = events.map(e => ({
            id: e.id, title: e.title, start: e.start_date, end: e.end_date,
            backgroundColor: e.color || '#0d6efd', borderColor: e.color || '#0d6efd', textColor: '#ffffff',
            extendedProps: { description: e.description || '', type: e.event_type || 'Période scolaire' }
        }));
        res.json(formatted);
    } catch (error) { res.status(500).json([]); }
});

app.post('/api/calendar/events', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const { title, description, event_type, start_date, end_date, color } = req.body;
        const [id] = await db('events').insert({
            establishment_id: req.user.establishment_id, title, description: description || '',
            event_type: event_type || 'Période scolaire', start_date, end_date, color: color || '#0d6efd',
            created_by: req.user.id, created_at: new Date(), updated_at: new Date()
        });
        res.status(201).json({ success: true, event: { id, title, start: start_date, end: end_date, backgroundColor: color } });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/calendar/events/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const { title, description, event_type, start_date, end_date, color } = req.body;
        await db('events').where({ id: req.params.id, establishment_id: req.user.establishment_id })
            .update({ title, description, event_type, start_date, end_date, color, updated_at: new Date() });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/calendar/events/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        await db('events').where({ id: req.params.id, establishment_id: req.user.establishment_id }).del();
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

const schoolLifeRoutes = require('./src/routes/schoolLifeRoutes');
app.use('/', schoolLifeRoutes);

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
            console.log('✅ Table events créée');
        }
    } catch (error) { console.error('❌ Erreur création table events:', error.message); }
}
createEventsTable();

// ==========================================================================
// ROUTES EMPLOI DU TEMPS
// ==========================================================================
app.get('/school-life/timetables', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    try {
        const classes = await db('users')
            .where({ establishment_id: req.user.establishment_id, role: 'STUDENT' })
            .distinct('student_class').whereNotNull('student_class').orderBy('student_class').pluck('student_class');
        res.render('school-life/timetables', { title: 'Emplois du Temps', user: req.user, classes: classes });
    } catch (error) { req.flash('error_msg', 'Erreur lors du chargement.'); res.redirect('/dashboard'); }
});

app.get('/timetable-view', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    try {
        let defaultClass = '', children = [], classes = [];
        if (req.user.role === 'STUDENT' || req.user.role === 'eleve') {
            defaultClass = req.user.student_class || ''; classes = [defaultClass];
        } else if (req.user.role === 'PARENT' || req.user.role === 'parent') {
            children = await userModel.getLinkedChildrenForParent(req.user.id);
            classes = [...new Set(children.map(c => c.student_class).filter(Boolean))];
            if (classes.length > 0) defaultClass = classes[0];
            if (req.session.selectedChildId) {
                const sc = children.find(c => c.id == req.session.selectedChildId);
                if (sc && sc.student_class) defaultClass = sc.student_class;
            }
        } else {
            classes = await db('users').where({ establishment_id: req.user.establishment_id, role: 'STUDENT' })
                .distinct('student_class').whereNotNull('student_class').orderBy('student_class').pluck('student_class');
            if (classes.length > 0) defaultClass = classes[0];
        }
        res.render('shared/timetable-view', { title: 'Emploi du Temps', user: req.user, classes, defaultClass, children, readOnly: true });
    } catch (error) { req.flash('error_msg', 'Erreur lors du chargement.'); res.redirect('/dashboard'); }
});

app.get('/api/timetables/:className', async (req, res) => {
    if (!req.user) return res.status(401).json([]);
    try {
        const className = req.params.className;
        let entries = await db('timetables').where({ establishment_id: req.user.establishment_id, class_name: className })
            .orderBy('day_order').orderBy('time_slot').select('*');
        if (entries.length === 0) {
            entries = await db('timetables').where({ class_name: className }).orderBy('day_order').orderBy('time_slot').select('*');
        }
        res.json(entries.map(e => ({ id: e.id, day: e.day, time_slot: e.time_slot, subject: e.subject, teacher: e.teacher, room: e.room, color: e.color })));
    } catch (error) { res.status(500).json([]); }
});

app.post('/api/timetables', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const { class_name, day, time_slot, subject, teacher, room, color } = req.body;
        const classMap = { 'Sixième': '6ème', 'Cinquième': '5ème', 'Quatrième': '4ème', 'Troisième': '3ème', 'Seconde': '2nde', 'Première': '1ère', 'Terminale': 'Tle' };
        const normalizedClassName = classMap[class_name] || class_name;
        const dayOrder = { 'Lundi': 1, 'Mardi': 2, 'Mercredi': 3, 'Jeudi': 4, 'Vendredi': 5 };
        const existing = await db('timetables').where({ establishment_id: req.user.establishment_id, class_name, day, time_slot }).first();
        if (existing) {
            await db('timetables').where({ id: existing.id }).update({ subject, teacher: teacher || null, room: room || null, color: color || '#0d6efd', day_order: dayOrder[day] || 0, updated_at: new Date() });
        } else {
            await db('timetables').insert({ establishment_id: req.user.establishment_id, class_name, day, day_order: dayOrder[day] || 0, time_slot, subject, teacher: teacher || null, room: room || null, color: color || '#0d6efd', created_by: req.user.id, created_at: new Date(), updated_at: new Date() });
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/timetables/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        await db('timetables').where({ id: req.params.id, establishment_id: req.user.establishment_id }).del();
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/timetables/bulk', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const { class_name, entries } = req.body;
        if (!class_name || !entries || !Array.isArray(entries)) return res.status(400).json({ error: 'Données invalides' });
        await db('timetables').where({ establishment_id: req.user.establishment_id, class_name }).del();
        const dayOrder = { 'Lundi': 1, 'Mardi': 2, 'Mercredi': 3, 'Jeudi': 4, 'Vendredi': 5 };
        for (const entry of entries) {
            await db('timetables').insert({ establishment_id: req.user.establishment_id, class_name, day: entry.day, day_order: dayOrder[entry.day] || 0, time_slot: entry.time_slot, subject: entry.subject, teacher: entry.teacher || null, room: entry.room || null, color: entry.color || '#0d6efd', created_by: req.user.id, created_at: new Date(), updated_at: new Date() });
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

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
        }
        const hasDayOrder = await db.schema.hasColumn('timetables', 'day_order');
        if (!hasDayOrder) {
            await db.schema.alterTable('timetables', function(table) { table.integer('day_order').defaultTo(0); });
        }
    } catch (error) { console.error('❌ Erreur création table timetables:', error.message); }
}

async function normalizeTimetableClassNames() {
    try {
        const classMap = {
            '6ème': ['Sixième', 'sixieme', '6eme', '6e'], '5ème': ['Cinquième', 'cinquieme', '5eme', '5e'],
            '4ème': ['Quatrième', 'quatrieme', '4eme', '4e'], '3ème': ['Troisième', 'troisieme', '3eme', '3e'],
            '2nde': ['Seconde', 'seconde', '2nd'], '1ère': ['Première', 'premiere', '1ere', '1re'],
            'Tle': ['Terminale', 'terminale', 'tle']
        };
        let totalUpdated = 0;
        for (const [normalizedName, variants] of Object.entries(classMap)) {
            const updatedRows = await db('timetables').whereIn('class_name', variants).update({ class_name: normalizedName });
            totalUpdated += updatedRows;
        }
        if (totalUpdated > 0) console.log(`✅ Normalisation: ${totalUpdated} entrées mises à jour.`);
    } catch (error) { console.error('❌ Erreur normalisation:', error.message); }
}

createTimetablesTable();
normalizeTimetableClassNames();

// ==========================================================================
// ROUTES ABSENCES
// ==========================================================================
app.get('/school-life/absences', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    try {
        const classes = await db('users').where({ establishment_id: req.user.establishment_id, role: 'STUDENT' })
            .distinct('student_class').whereNotNull('student_class').orderBy('student_class').pluck('student_class');
        const professors = await db('users').where({ establishment_id: req.user.establishment_id, role: 'PROFESSOR' }).select('id', 'name').orderBy('name');
        res.render('school-life/absences', { title: 'Gestion des Absences & Retards', user: req.user, classes, professors });
    } catch (error) { req.flash('error_msg', 'Erreur lors du chargement.'); res.redirect('/dashboard'); }
});

app.get('/api/absences', async (req, res) => {
    if (!req.user) return res.status(401).json([]);
    try {
        const { user_id, user_type, class_name, date_debut, date_fin, status } = req.query;
        let query = db('absences').where({ 'absences.establishment_id': req.user.establishment_id })
            .leftJoin('users', 'absences.user_id', 'users.id').select('absences.*', 'users.name as user_name', 'users.student_class');
        if (user_id && user_id !== '') query = query.where({ 'absences.user_id': parseInt(user_id) });
        if (user_type) query = query.where({ 'absences.user_type': user_type });
        if (status && status !== '') query = query.where({ 'absences.status': status });
        if (date_debut && date_debut !== '') query = query.where('absences.date', '>=', date_debut);
        if (date_fin && date_fin !== '') query = query.where('absences.date', '<=', date_fin);
        if (class_name && class_name !== '' && user_type === 'student') query = query.where('users.student_class', class_name);
        const absences = await query.orderBy('absences.date', 'desc').orderBy('absences.created_at', 'desc');
        res.json(absences);
    } catch (error) { res.json([]); }
});

app.post('/api/absences', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const { user_id, user_type, type, date, heure_arrivee, motif, commentaire, status } = req.body;
        if (!user_id || !date) return res.status(400).json({ success: false, error: 'Champs obligatoires manquants' });
        const result = await db('absences').insert({
            establishment_id: req.user.establishment_id, user_id: parseInt(user_id), user_type: user_type || 'student',
            type: type || 'absence', status: status || 'non_justifiee', date,
            heure_arrivee: type === 'retard' ? heure_arrivee : null, motif: motif || '', commentaire: commentaire || '', created_by: req.user.id
        });
        const id = Array.isArray(result) ? result[0] : result;
        res.status(201).json({ success: true, id: id });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.put('/api/absences/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const { status, motif, commentaire } = req.body;
        await db('absences').where({ id: req.params.id }).update({ status: status || 'non_justifiee', motif: motif || '', commentaire: commentaire || '', updated_at: new Date() });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/absences/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    try { await db('absences').where({ id: req.params.id }).del(); res.json({ success: true }); }
    catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/students-by-class/:className', async (req, res) => {
    if (!req.user) return res.status(401).json([]);
    try {
        const className = decodeURIComponent(req.params.className);
        const students = await db('users').where({ establishment_id: req.user.establishment_id, student_class: className, approved: 1 })
            .whereIn('role', ['STUDENT', 'student', 'eleve', 'élève']).select('id', 'name', 'matricule', 'student_class').orderBy('name');
        res.json(students);
    } catch (error) { res.status(500).json([]); }
});

async function createAbsencesTable() {
    try {
        const hasTable = await db.schema.hasTable('absences');
        if (!hasTable) {
            await db.schema.createTable('absences', function(table) {
                table.increments('id').primary();
                table.integer('establishment_id').notNullable();
                table.integer('user_id').notNullable();
                table.string('user_type', 20).notNullable();
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
        }
    } catch (error) { console.error('❌ Erreur création table absences:', error.message); }
}
createAbsencesTable();

// ==========================================================================
// ROUTES DE CONSULTATION
// ==========================================================================
app.get('/calendar-view', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    try {
        const events = await db('events').where({ establishment_id: req.user.establishment_id }).orderBy('start_date', 'asc').select('*');
        res.render('shared/calendar-view', { title: 'Calendrier Scolaire', events, user: req.user, readOnly: true });
    } catch (error) { req.flash('error_msg', 'Erreur lors du chargement.'); res.redirect('/dashboard'); }
});

app.get('/absences-view', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    try {
        let userId = null, children = [], selectedChildId = null;
        if (req.user.role === 'STUDENT' || req.user.role === 'eleve') userId = req.user.id;
        else if (req.user.role === 'PARENT' || req.user.role === 'parent') {
            children = await userModel.getLinkedChildrenForParent(req.user.id);
            if (req.session.selectedChildId) { selectedChildId = req.session.selectedChildId; userId = req.session.selectedChildId; }
        } else if (req.user.role === 'PROFESSOR' || req.user.role === 'professeur') userId = req.user.id;
        const classes = await db('users').where({ establishment_id: req.user.establishment_id, role: 'STUDENT' })
            .distinct('student_class').whereNotNull('student_class').orderBy('student_class').pluck('student_class');
        res.render('shared/absences-view', { title: 'Consultation des Absences', user: req.user, classes, userId, children, selectedChildId, readOnly: true });
    } catch (error) { req.flash('error_msg', 'Erreur lors du chargement.'); res.redirect('/dashboard'); }
});

// ==========================================================================
// ROUTES DOCUMENTS SECRÉTAIRE (VERSION UNIQUE CORRIGÉE)
// ==========================================================================
app.get('/secretary/documents', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    
    if (req.user.role !== 'SECRETARY' && req.user.role !== 'secretaire' && 
        req.user.role !== 'ADMINISTRATOR' && req.user.role !== 'administrateur') {
        req.flash('error_msg', 'Accès non autorisé.');
        return res.redirect('/dashboard');
    }
    
    try {
        // Récupérer le nom de l'admin (directeur) de l'établissement
        let adminName = req.user.name;
        let establishmentName = 'Établissement';
        
        const admin = await db('users')
            .where({ establishment_id: req.user.establishment_id })
            .whereIn('role', ['ADMINISTRATOR', 'administrateur'])
            .select('name')
            .first();
        
        if (admin) adminName = admin.name;
        
        const establishment = await db('establishments')
            .where({ id: req.user.establishment_id })
            .select('name')
            .first();
        
        if (establishment) establishmentName = establishment.name;
        
        console.log('📄 Documents - Admin:', adminName, 'Établissement:', establishmentName);
        
        res.render('secretary/documents', {
            title: 'Documents Scolaires',
            user: req.user,
            establishmentName: establishmentName,
            adminName: adminName
        });
    } catch (error) {
        console.error('Erreur documents:', error);
        req.flash('error_msg', 'Erreur lors du chargement.');
        res.redirect('/dashboard');
    }
});

// API - Récupérer toutes les classes
app.get('/api/all-classes', async (req, res) => {
    if (!req.user) return res.status(401).json([]);
    try {
        const classes = await db('users')
            .where({ establishment_id: req.user.establishment_id, approved: 1 })
            .whereIn('role', ['STUDENT', 'student', 'eleve', 'élève', 'Eleve', 'Élève'])
            .whereNotNull('student_class')
            .distinct('student_class')
            .orderBy('student_class')
            .pluck('student_class');
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
            .where({ establishment_id: req.user.establishment_id, approved: 1 })
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

// API - Récupérer les détails complets d'un élève
app.get('/api/student-details/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        console.log('🔍 Recherche étudiant ID:', req.params.id);
        const student = await db('users').where({ id: req.params.id }).first();
        console.log('👤 Étudiant trouvé:', student ? student.name : 'NON');
        
        if (!student) return res.status(404).json({ error: 'Élève non trouvé' });
        
        let linkedParents = [];
        if (student.matricule) {
            linkedParents = await db('parent_student_links as psl')
                .join('users as u', 'psl.parent_id', 'u.id')
                .where('psl.student_matricule', student.matricule)
                .select('u.id', 'u.name', 'u.phone_number');
            console.log('👥 Parents liés:', linkedParents.length);
        }
        
        let manualParents = [];
        if (student.manual_parents) {
            try {
                manualParents = typeof student.manual_parents === 'string' ? JSON.parse(student.manual_parents) : student.manual_parents;
                console.log('👥 Parents manuels:', manualParents.length);
            } catch (e) { manualParents = []; }
        }
        
        res.json({
            id: student.id, name: student.name, matricule: student.matricule,
            student_class: student.student_class, date_of_birth: student.date_of_birth,
            place_of_birth: student.place_of_birth, address: student.address,
            email: student.email, phone_number: student.phone_number,
            linkedParents: linkedParents, manualParents: manualParents
        });
    } catch (error) {
        console.error('❌ Erreur student-details:', error);
        res.status(500).json({ error: error.message });
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
        }
    } catch (error) {
        console.error('❌ Erreur création table document_archives:', error.message);
    }
}
createDocumentArchivesTable();

// ==========================================================================
// ROUTES PAIEMENTS SECRÉTAIRE
// ==========================================================================

// Page paiements
app.get('/secretary/payments', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    if (req.user.role !== 'SECRETARY' && req.user.role !== 'secretaire' && 
        req.user.role !== 'ADMINISTRATOR' && req.user.role !== 'administrateur') {
        req.flash('error_msg', 'Accès non autorisé.');
        return res.redirect('/dashboard');
    }
    try {
        res.render('secretary/payments', {
            title: 'Suivi des Paiements',
            user: req.user
        });
    } catch (error) {
        console.error('Erreur payments:', error);
        req.flash('error_msg', 'Erreur lors du chargement.');
        res.redirect('/dashboard');
    }
});

// API - Récupérer les paiements
app.get('/api/payments', async (req, res) => {
    if (!req.user) return res.status(401).json([]);
    try {
        const payments = await db('payments')
            .where({ establishment_id: req.user.establishment_id })
            .orderBy('created_at', 'desc')
            .limit(50)
            .select('*');
        res.json(payments);
    } catch (error) {
        res.status(500).json([]);
    }
});

// API - Créer un paiement
app.post('/api/payments', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const { student_id, amount, method, reference, description } = req.body;
        if (!student_id || !amount) {
            return res.status(400).json({ error: 'Élève et montant requis.' });
        }
        const [id] = await db('payments').insert({
            establishment_id: req.user.establishment_id,
            student_id,
            amount,
            method: method || 'espèces',
            reference: reference || '',
            description: description || '',
            created_by: req.user.id,
            created_at: new Date()
        });
        res.status(201).json({ success: true, id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API - Détails d'un paiement (pour reçu)
app.get('/api/payments/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({});
    try {
        const payment = await db('payments')
            .where({ id: req.params.id })
            .first();
        if (!payment) return res.status(404).json({ error: 'Non trouvé' });
        const student = await db('users').where({ id: payment.student_id }).first();
        res.json({
            ...payment,
            student_name: student ? student.name : 'Inconnu',
            student_class: student ? student.student_class : ''
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Créer la table payments si elle n'existe pas
async function createPaymentsTable() {
    try {
        const hasTable = await db.schema.hasTable('payments');
        if (!hasTable) {
            await db.schema.createTable('payments', function(table) {
                table.increments('id').primary();
                table.integer('establishment_id').notNullable().index();
                table.integer('student_id').notNullable();
                table.decimal('amount', 10, 2).notNullable();
                table.string('method', 50).defaultTo('espèces');
                table.string('reference', 100);
                table.text('description');
                table.integer('created_by').notNullable();
                table.timestamp('created_at').defaultTo(db.fn.now());
                table.foreign('student_id').references('users.id').onDelete('CASCADE');
            });
            console.log('✅ Table payments créée');
        } else {
            console.log('✅ Table payments existe déjà');
        }
    } catch (error) {
        console.error('❌ Erreur création table payments:', error.message);
    }
}

createPaymentsTable();

// ==========================================================================
// ROUTES NOTES (PROFESSEUR)
// ==========================================================================

// Page saisie des notes
app.get('/professor/grades', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    if (req.user.role !== 'PROFESSOR' && req.user.role !== 'professeur') {
        req.flash('error_msg', 'Accès réservé aux professeurs.');
        return res.redirect('/dashboard');
    }
    try {
        // Récupérer les classes où le professeur a des entrées dans l'emploi du temps
        const classes = await db('timetables')
            .where({ establishment_id: req.user.establishment_id, teacher: req.user.name })
            .distinct('class_name')
            .pluck('class_name');
        
        res.render('professor/grades', {
            title: 'Saisie des Notes',
            user: req.user,
            classes: classes || []
        });
    } catch (error) {
        console.error('Erreur professor/grades:', error);
        req.flash('error_msg', 'Erreur lors du chargement.');
        res.redirect('/dashboard');
    }
});

// API - Récupérer les élèves d'une classe
app.get('/api/grades/students/:className', async (req, res) => {
    if (!req.user) return res.status(401).json([]);
    try {
        const students = await db('users')
            .where({ 
                establishment_id: req.user.establishment_id,
                student_class: req.params.className,
                approved: 1
            })
            .whereIn('role', ['STUDENT', 'student', 'eleve', 'élève', 'Eleve', 'Élève'])
            .select('id', 'name', 'student_class')
            .orderBy('name');
        res.json(students);
    } catch (error) {
        res.status(500).json([]);
    }
});

// API - Récupérer les notes d'une classe pour une matière
app.get('/api/grades/:className/:subject', async (req, res) => {
    if (!req.user) return res.status(401).json({});
    try {
        const grades = await db('grades')
            .where({
                establishment_id: req.user.establishment_id,
                class_name: req.params.className,
                subject: req.params.subject,
                period: req.query.period || '1'
            });
        res.json(grades);
    } catch (error) {
        res.status(500).json({});
    }
});

// API - Sauvegarder/modifier une note
app.post('/api/grades', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const { student_id, class_name, subject, period, grade, comment } = req.body;
        
        const existing = await db('grades')
            .where({ establishment_id: req.user.establishment_id, student_id, class_name, subject, period })
            .first();
        
        if (existing) {
            await db('grades').where({ id: existing.id }).update({
                grade, comment, updated_at: new Date(), created_by: req.user.id
            });
        } else {
            await db('grades').insert({
                establishment_id: req.user.establishment_id,
                student_id, class_name, subject, period,
                grade, comment: comment || '',
                created_by: req.user.id,
                created_at: new Date(), updated_at: new Date()
            });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API - Sauvegarder toutes les notes d'un coup
app.post('/api/grades/bulk', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const { class_name, subject, period, grades } = req.body;
        if (!grades || !Array.isArray(grades)) return res.status(400).json({ error: 'Données invalides' });
        
        for (const g of grades) {
            const existing = await db('grades')
                .where({ establishment_id: req.user.establishment_id, student_id: g.student_id, class_name, subject, period })
                .first();
            if (existing) {
                await db('grades').where({ id: existing.id }).update({
                    grade: g.grade, comment: g.comment || '', updated_at: new Date()
                });
            } else {
                await db('grades').insert({
                    establishment_id: req.user.establishment_id,
                    student_id: g.student_id, class_name, subject, period,
                    grade: g.grade, comment: g.comment || '',
                    created_by: req.user.id, created_at: new Date(), updated_at: new Date()
                });
            }
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Créer la table grades
async function createGradesTable() {
    try {
        const hasTable = await db.schema.hasTable('grades');
        if (!hasTable) {
            await db.schema.createTable('grades', function(table) {
                table.increments('id').primary();
                table.integer('establishment_id').notNullable().index();
                table.integer('student_id').notNullable();
                table.string('class_name', 100).notNullable();
                table.string('subject', 100).notNullable();
                table.string('period', 10).defaultTo('1');
                table.decimal('grade', 5, 2);
                table.text('comment');
                table.integer('created_by').notNullable();
                table.timestamps(true, true);
                table.unique(['student_id', 'class_name', 'subject', 'period'], 'unique_grade');
            });
            console.log('✅ Table grades créée');
        } else {
            console.log('✅ Table grades existe déjà');
        }
    } catch (error) {
        console.error('❌ Erreur création table grades:', error.message);
    }
}

createGradesTable();
const timetableRoutes = require('./src/routes/timetableRoutes');
app.use('/', timetableRoutes);

// Lancement de l'application
startServer();