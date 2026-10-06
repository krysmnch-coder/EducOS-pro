const express = require('express');
const db = require('../models/db');
const userModel = require('../models/userModel');

const router = express.Router();

// Page emplois du temps (Vie Scolaire - édition)
router.get('/school-life/timetables', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    try {
        const classes = await db('users')
            .where({ establishment_id: req.user.establishment_id, role: 'STUDENT' })
            .distinct('student_class').whereNotNull('student_class').orderBy('student_class').pluck('student_class');
        res.render('school-life/timetables', { title: 'Emplois du Temps', user: req.user, classes: classes });
    } catch (error) { req.flash('error_msg', 'Erreur lors du chargement.'); res.redirect('/dashboard'); }
});

// Page emploi du temps (Consultation pour tous les rôles)
router.get('/timetable-view', async (req, res) => {
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

// API - Récupérer l'emploi du temps d'une classe
router.get('/api/timetables/:className', async (req, res) => {
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

router.post('/api/timetables', async (req, res) => {
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

// API - Supprimer une entrée
router.delete('/api/timetables/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    try {
        await db('timetables').where({ id: req.params.id, establishment_id: req.user.establishment_id }).del();
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// API - Sauvegarder tout l'emploi du temps d'une classe (en masse)
router.post('/api/timetables/bulk', async (req, res) => {
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

// API - Récupérer la liste des professeurs (version unique et robuste)
router.get('/api/professors-list', async (req, res) => {
    if (!req.user) return res.status(401).json([]);
    try {
        const professors = await db('users')
            .where({
                establishment_id: req.user.establishment_id,
                approved: 1
            })
            .whereIn('role', ['PROFESSOR', 'professor', 'professeur', 'Professeur'])
            .select('id', 'name')
            .orderBy('name');
        res.json(professors);
    } catch (error) {
        console.error('Erreur professors-list:', error);
        res.status(500).json([]);
    }
});

module.exports = router;