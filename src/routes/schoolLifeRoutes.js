const express = require('express');
const router = express.Router();
const schoolLifeController = require('../controllers/schoolLifeController');

const isAuthenticated = (req, res, next) => {
    if (req.user) return next();
    res.redirect('/login');
};

// Page calendrier
router.get('/school-life/calendar', isAuthenticated, schoolLifeController.renderCalendar);

// API calendrier
router.get('/api/calendar/events', isAuthenticated, schoolLifeController.getEvents);
router.post('/api/calendar/events', isAuthenticated, schoolLifeController.createEvent);
router.put('/api/calendar/events/:id', isAuthenticated, schoolLifeController.updateEvent);
router.delete('/api/calendar/events/:id', isAuthenticated, schoolLifeController.deleteEvent);

module.exports = router;