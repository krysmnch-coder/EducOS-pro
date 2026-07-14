const express = require('express');
const router = express.Router();
const { isAuthenticated: ensureAuthenticated } = require('../middleware/authMiddleware');
const { getAllUsersApi, getDashboardStatsApi } = require('../controllers/apiController');
const studentApiRoutes = require('./studentApiRoutes');
const notificationRoutes = require('./notificationRoutes');

router.use('/students', studentApiRoutes);
router.use('/notifications', notificationRoutes);
router.get('/users', ensureAuthenticated, getAllUsersApi);
router.get('/dashboard-stats', getDashboardStatsApi);

module.exports = router;
