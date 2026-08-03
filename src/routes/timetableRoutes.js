const express = require('express');
const router = express.Router();
const timetableModel = require('../models/timetableModel');
const userModel = require('../models/userModel');
const db = require('../models/db');
const { ROLES } = require('../../constants');

// Middleware d'authentification
const isAuthenticated = (req, res, next) => {
    if (req.user) return next();
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(401).json({ error: 'Non authentifié' });
    }
    res.redirect('/login');
};

// ==========================================================================
// ROUTE POUR AFFICHER LA PAGE EMPLOI DU TEMPS
// ==========================================================================
router.get('/timetable', isAuthenticated, async (req, res) => {
    try {
        const user = req.user;
        let classes = [];
        let defaultClass = '';
        let children = [];

        // ÉLÈVE : sa propre classe
        if (user.role === ROLES.STUDENT || user.role === 'eleve') {
            defaultClass = user.student_class || '';
            classes = [defaultClass];
        }
        // PARENT : classes de ses enfants
        else if (user.role === ROLES.PARENT) {
            children = await userModel.getLinkedChildrenForParent(user.id);
            classes = children.map(c => c.student_class).filter(Boolean);
            // Supprimer les doublons
            classes = [...new Set(classes)];
            if (classes.length > 0) {
                defaultClass = classes[0];
            }
        }
        // VIE SCOLAIRE, ADMIN, PROFESSEUR, etc.
        else {
            classes = await timetableModel.getClassesWithTimetable(user.establishment_id);
            if (classes.length > 0) {
                defaultClass = classes[0];
            }
        }

        res.render('shared/timetable-view', {
            title: 'Emploi du Temps | EducOS-pro',
            user: user,
            classes: classes,
            defaultClass: defaultClass,
            children: children
        });

    } catch (error) {
        console.error('Erreur renderTimetable:', error);
        req.flash('error_msg', 'Erreur lors du chargement de l\'emploi du temps.');
        res.redirect('/dashboard');
    }
});

// ==========================================================================
// API - Récupérer l'emploi du temps d'une classe
// ==========================================================================
router.get('/api/timetables/:className', isAuthenticated, async (req, res) => {
    try {
        const className = req.params.className;
        console.log('📅 Chargement emploi du temps pour:', className);
        const entries = await timetableModel.getFormattedTimetable(className, req.user.establishment_id);
        console.log('📅 Entrées trouvées:', entries.length);
        res.json(entries);
    } catch (error) {
        console.error('Erreur récupération emploi du temps:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ==========================================================================
// API - Récupérer les classes disponibles
// ==========================================================================
router.get('/api/timetable-classes', isAuthenticated, async (req, res) => {
    try {
        const classes = await timetableModel.getClassesWithTimetable(req.user.establishment_id);
        res.json(classes);
    } catch (error) {
        console.error('Erreur récupération classes:', error);
        res.json([]);
    }
});

// ==========================================================================
// API - Sauvegarder une entrée (vie scolaire / admin seulement)
// ==========================================================================
router.post('/api/timetables', isAuthenticated, async (req, res) => {
    try {
        const allowedRoles = ['SCHOOL_LIFE_MANAGER', 'ADMINISTRATOR', 'administrateur', 'superadmin'];
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }

        const { class_name, day, time_slot, subject, teacher, room, color } = req.body;

        if (!class_name || !day || !time_slot || !subject) {
            return res.status(400).json({ error: 'Champs requis manquants' });
        }

        await timetableModel.saveEntry({
            establishment_id: req.user.establishment_id,
            created_by: req.user.id,
            class_name,
            day,
            time_slot,
            subject,
            teacher: teacher || null,
            room: room || null,
            color: color || '#0d6efd'
        });

        console.log('✅ Entrée sauvegardée:', class_name, day, time_slot, subject);
        res.json({ success: true });

    } catch (error) {
        console.error('Erreur sauvegarde:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ==========================================================================
// API - Supprimer une entrée (vie scolaire / admin seulement)
// ==========================================================================
router.delete('/api/timetables/:id', isAuthenticated, async (req, res) => {
    try {
        const allowedRoles = ['SCHOOL_LIFE_MANAGER', 'ADMINISTRATOR', 'administrateur', 'superadmin'];
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }

        await timetableModel.deleteEntry(req.params.id, req.user.establishment_id);
        console.log('🗑️ Entrée supprimée:', req.params.id);
        res.json({ success: true });

    } catch (error) {
        console.error('Erreur suppression:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ==========================================================================
// API - Sauvegarder tout l'emploi du temps d'une classe (en masse)
// ==========================================================================
router.post('/api/timetables/bulk', isAuthenticated, async (req, res) => {
    try {
        const allowedRoles = ['SCHOOL_LIFE_MANAGER', 'ADMINISTRATOR', 'administrateur', 'superadmin'];
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }

        const { class_name, entries } = req.body;

        if (!class_name || !entries || !Array.isArray(entries)) {
            return res.status(400).json({ error: 'Données invalides' });
        }

        // Utiliser une transaction pour garantir l'atomicité de l'opération
        await db.transaction(async trx => {
            // Supprimer les anciennes entrées
            await timetableModel.deleteByClass(class_name, req.user.establishment_id, trx);

            // Insérer les nouvelles
            for (const entry of entries) {
                await timetableModel.saveEntry({
                    establishment_id: req.user.establishment_id,
                    created_by: req.user.id,
                    class_name,
                    day: entry.day,
                    time_slot: entry.time_slot,
                    subject: entry.subject,
                    teacher: entry.teacher || null,
                    room: entry.room || null,
                    color: entry.color || '#0d6efd'
                }, trx);
            }
        });

        console.log('✅ Emploi du temps sauvegardé en masse:', class_name, entries.length, 'entrées');
        res.json({ success: true });

    } catch (error) {
        console.error('Erreur sauvegarde en masse:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;