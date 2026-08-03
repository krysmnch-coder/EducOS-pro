const db = require('./db');

const timetableModel = {
    // Récupérer l'emploi du temps formaté d'une classe
    async getFormattedTimetable(className) {
        const entries = await db('timetables')
            .where({ class_name: className })
            .orderBy('day_order')
            .orderBy('time_slot');

        return entries.map(entry => ({
            id: entry.id,
            day: entry.day,
            time_slot: entry.time_slot,
            subject: entry.subject,
            teacher: entry.teacher,
            room: entry.room,
            color: entry.color
        }));
    },

    // Récupérer toutes les entrées brutes d'une classe
    async getTimetableByClass(className) {
        return db('timetables')
            .where({ class_name: className })
            .orderBy('day_order')
            .orderBy('time_slot');
    },

    // Sauvegarder ou mettre à jour une entrée
    async saveEntry(data) {
        const existing = await db('timetables')
            .where({
                class_name: data.class_name,
                day: data.day,
                time_slot: data.time_slot
            })
            .first();

        if (existing) {
            return db('timetables')
                .where({ id: existing.id })
                .update({
                    subject: data.subject,
                    teacher: data.teacher,
                    room: data.room,
                    color: data.color,
                    updated_at: db.fn.now()
                });
        } else {
            const dayOrder = { 'Lundi': 1, 'Mardi': 2, 'Mercredi': 3, 'Jeudi': 4, 'Vendredi': 5 };
            return db('timetables').insert({
                class_name: data.class_name,
                day: data.day,
                day_order: dayOrder[data.day] || 0,
                time_slot: data.time_slot,
                subject: data.subject,
                teacher: data.teacher || null,
                room: data.room || null,
                color: data.color || '#0d6efd',
                created_at: db.fn.now(),
                updated_at: db.fn.now()
            });
        }
    },

    // Supprimer une entrée
    async deleteEntry(id) {
        return db('timetables').where({ id }).del();
    },

    // Supprimer toutes les entrées d'une classe
    async deleteByClass(className) {
        return db('timetables').where({ class_name: className }).del();
    },

    // Récupérer les classes qui ont un emploi du temps
    async getClassesWithTimetable(establishmentId) {
        return db('timetables')
            .distinct('class_name')
            .orderBy('class_name')
            .pluck('class_name');
    }
};

module.exports = timetableModel;