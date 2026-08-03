const db = require('./db');

const timetableModel = {
    // Récupérer l'emploi du temps formaté d'une classe
    async getFormattedTimetable(className, establishmentId) {
        const query = db('timetables')
            .where({ class_name: className });
        if (establishmentId) {
            query.andWhere({ establishment_id: establishmentId });
        }
        const entries = await query
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
        const query = db('timetables')
            .where({ class_name: className });
        if (establishmentId) {
            query.andWhere({ establishment_id: establishmentId });
        }
        return query
            .orderBy('day_order')
            .orderBy('time_slot');
    },

    // Sauvegarder ou mettre à jour une entrée
    async saveEntry(data, trx) {
        const query = (trx || db)('timetables')
            .where({
                class_name: data.class_name,
                day: data.day,
                time_slot: data.time_slot
            });
        if (data.establishment_id) {
            query.andWhere({ establishment_id: data.establishment_id });
        }

        const existing = await query.first();

        if (existing) {
            return (trx || db)('timetables')
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
            return (trx || db)('timetables').insert({
                establishment_id: data.establishment_id || null,
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
    async deleteEntry(id, establishmentId) {
        const query = db('timetables').where({ id });
        if (establishmentId) {
            query.andWhere({ establishment_id: establishmentId });
        }
        return query.del();
    },

    // Supprimer toutes les entrées d'une classe
    async deleteByClass(className, establishmentId, trx) {
        const query = (trx || db)('timetables').where({ class_name: className });
        if (establishmentId) {
            query.andWhere({ establishment_id: establishmentId });
        }
        return query.del();
    },

    // Récupérer les classes qui ont un emploi du temps
    async getClassesWithTimetable(establishmentId) {
        const query = db('timetables');
        if (establishmentId) {
            query.where({ establishment_id: establishmentId });
        }
        return query
            .distinct('class_name')
            .orderBy('class_name')
            .pluck('class_name');
    }
};

module.exports = timetableModel;