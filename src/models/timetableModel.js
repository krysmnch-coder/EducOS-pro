const db = require('./db');

const timetableModel = {
    // Récupérer l'emploi du temps formaté d'une classe
    async getFormattedTimetable(className, establishmentId) {
        const entries = await db('timetables')
            .where({ class_name: className, establishment_id: establishmentId })
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
    async getTimetableByClass(className, establishmentId) {
        return db('timetables')
            .where({ class_name: className, establishment_id: establishmentId })
            .orderBy('day_order')
            .orderBy('time_slot');
    },

    // Sauvegarder ou mettre à jour une entrée
    async saveEntry(data, trx) {
        const db_conn = trx || db;
        const existing = await db_conn('timetables')
            .where({
                establishment_id: data.establishment_id,
                class_name: data.class_name,
                day: data.day,
                time_slot: data.time_slot
            })
            .first();

        if (existing) {
            return db_conn('timetables')
                .where({ id: existing.id })
                .update({
                    subject: data.subject,
                    teacher: data.teacher,
                    room: data.room,
                    color: data.color,
                    updated_at: db_conn.fn.now()
                });
        } else {
            const dayOrder = { 'Lundi': 1, 'Mardi': 2, 'Mercredi': 3, 'Jeudi': 4, 'Vendredi': 5 };
            return db_conn('timetables').insert({
                establishment_id: data.establishment_id,
                class_name: data.class_name,
                day: data.day,
                day_order: dayOrder[data.day] || 0,
                time_slot: data.time_slot,
                subject: data.subject,
                teacher: data.teacher || null,
                room: data.room || null,
                color: data.color || '#0d6efd',
                created_by: data.created_by,
                created_at: db_conn.fn.now(),
                updated_at: db_conn.fn.now()
            });
        }
    },

    // Supprimer une entrée
    async deleteEntry(id, establishmentId, trx) {
        const db_conn = trx || db;
        return db_conn('timetables').where({ id, establishment_id: establishmentId }).del();
    },

    // Supprimer toutes les entrées d'une classe
    async deleteByClass(className, establishmentId, trx) {
        const db_conn = trx || db;
        return db_conn('timetables').where({ class_name: className, establishment_id: establishmentId }).del();
    },

    // Récupérer les classes qui ont un emploi du temps
    async getClassesWithTimetable(establishmentId) {
        return db('timetables')
            .where({ establishment_id: establishmentId })
            .distinct('class_name')
            .orderBy('class_name')
            .pluck('class_name');
    }
};

module.exports = timetableModel;