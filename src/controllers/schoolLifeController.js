const db = require('../models/db');

/**
 * Affiche la page du calendrier
 */
const renderCalendar = async (req, res) => {
    try {
        const establishmentId = req.user.establishment_id;
        
        const events = await db('events')
            .where({ establishment_id: establishmentId })
            .orderBy('start_date', 'asc')
            .select('*');

        res.render('school-life/calendar', {
            title: 'Calendrier Scolaire',
            events: events,
            user: req.user
        });
    } catch (error) {
        console.error('Erreur renderCalendar:', error);
        req.flash('error_msg', 'Erreur lors du chargement du calendrier.');
        res.redirect('/dashboard');
    }
};

/**
 * API - Récupérer les événements (format JSON pour FullCalendar)
 */
const getEvents = async (req, res) => {
    try {
        const establishmentId = req.user.establishment_id;
        
        const events = await db('events')
            .where({ establishment_id: establishmentId })
            .select('*');

        const formattedEvents = events.map(event => ({
            id: event.id,
            title: event.title,
            start: event.start_date,
            end: event.end_date,
            backgroundColor: event.color,
            borderColor: event.color,
            extendedProps: {
                description: event.description,
                type: event.event_type
            }
        }));

        res.json(formattedEvents);
    } catch (error) {
        console.error('Erreur getEvents:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

/**
 * API - Créer un événement
 */
const createEvent = async (req, res) => {
    try {
        const { title, description, event_type, start_date, end_date, color } = req.body;
        const establishmentId = req.user.establishment_id;

        if (!title || !start_date || !end_date) {
            return res.status(400).json({ error: 'Titre, date début et date fin requis.' });
        }

        const [eventId] = await db('events').insert({
            establishment_id: establishmentId,
            title,
            description: description || '',
            event_type: event_type || 'event',
            start_date,
            end_date,
            color: color || '#0d6efd',
            created_by: req.user.id,
            created_at: new Date(),
            updated_at: new Date()
        });

        res.status(201).json({ 
            success: true, 
            event: { id: eventId, title, start: start_date, end: end_date, backgroundColor: color }
        });
    } catch (error) {
        console.error('Erreur createEvent:', error);
        res.status(500).json({ error: 'Erreur lors de la création.' });
    }
};

/**
 * API - Mettre à jour un événement
 */
const updateEvent = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, event_type, start_date, end_date, color } = req.body;

        await db('events')
            .where({ id, establishment_id: req.user.establishment_id })
            .update({
                title,
                description,
                event_type,
                start_date,
                end_date,
                color,
                updated_at: new Date()
            });

        res.json({ success: true });
    } catch (error) {
        console.error('Erreur updateEvent:', error);
        res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
    }
};

/**
 * API - Supprimer un événement
 */
const deleteEvent = async (req, res) => {
    try {
        const { id } = req.params;
        
        await db('events')
            .where({ id, establishment_id: req.user.establishment_id })
            .del();

        res.json({ success: true });
    } catch (error) {
        console.error('Erreur deleteEvent:', error);
        res.status(500).json({ error: 'Erreur lors de la suppression.' });
    }
};

module.exports = {
    renderCalendar,
    getEvents,
    createEvent,
    updateEvent,
    deleteEvent
};