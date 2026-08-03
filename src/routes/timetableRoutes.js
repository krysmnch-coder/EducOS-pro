const express = require('express');
const router = express.Router();
const timetableModel = require('../models/timetableModel');
const userModel = require('../models/userModel');

// Middleware d'authentification
const isAuthenticated = (req, res, next) => {
    if (req.user) return next();
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(401).json({ error: 'Non authentifié' });
    }
    res.redirect('/login');
};

// API - Récupérer l'emploi du temps d'une classe (pour tous les utilisateurs connectés)
router.get('/api/timetables/:className', isAuthenticated, async (req, res) => {
    try {
        const className = req.params.className;
        const entries = await timetableModel.getFormattedTimetable(className);
        res.json(entries);
    } catch (error) {
        console.error('Erreur récupération emploi du temps:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// API - Récupérer les classes disponibles (pour le sélecteur)
router.get('/api/timetable-classes', isAuthenticated, async (req, res) => {
    try {
        const classes = await timetableModel.getClassesWithTimetable(req.user.establishment_id);
        res.json(classes);
    } catch (error) {
        console.error('Erreur récupération classes:', error);
        res.json([]);
    }
});

// API - Sauvegarder une entrée (vie scolaire seulement)
router.post('/api/timetables', isAuthenticated, async (req, res) => {
    try {
        // Vérifier que l'utilisateur est vie scolaire
        if (req.user.role !== 'SCHOOL_LIFE_MANAGER' && req.user.role !== 'ADMINISTRATOR' && req.user.role !== 'administrateur') {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }

        await timetableModel.saveEntry(req.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur sauvegarde:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// API - Supprimer une entrée (vie scolaire seulement)
router.delete('/api/timetables/:id', isAuthenticated, async (req, res) => {
    try {
        if (req.user.role !== 'SCHOOL_LIFE_MANAGER' && req.user.role !== 'ADMINISTRATOR' && req.user.role !== 'administrateur') {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }

        await timetableModel.deleteEntry(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur suppression:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;