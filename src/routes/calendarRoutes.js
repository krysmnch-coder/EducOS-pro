const express = require('express');
const db = require('../models/db');

const router = express.Router();

router.get('/school-life/calendar', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    try {
        res.render('school-life/calendar', { title: 'Calendrier Scolaire', events: [], user: req.user });
    } catch (error) { req.flash('error_msg', 'Erreur: ' + error.message); res.redirect('/dashboard'); }
});

router.get('/api/calendar/events', async (req, res) => {
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

router.post('/api/calendar/events', async (req, res) => {
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

router.put('/api/calendar/events/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        const { title, description, event_type, start_date, end_date, color } = req.body;
        await db('events').where({ id: req.params.id, establishment_id: req.user.establishment_id })
            .update({ title, description, event_type, start_date, end_date, color, updated_at: new Date() });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.delete('/api/calendar/events/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        await db('events').where({ id: req.params.id, establishment_id: req.user.establishment_id }).del();
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;