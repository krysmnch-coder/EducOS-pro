const timetableModel = require('../models/timetableModel');
const userModel = require('../models/userModel');
const { ROLES } = require('../../constants');

const renderTimetable = async (req, res) => {
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
            if (classes.length > 0) {
                defaultClass = classes[0];
            }
        }
        // VIE SCOLAIRE : peut voir/modifier toutes les classes
        else if (user.role === ROLES.SCHOOL_LIFE_MANAGER || user.role === 'SCHOOL_LIFE_MANAGER') {
            classes = await timetableModel.getClassesWithTimetable(user.establishment_id);
            if (classes.length > 0) defaultClass = classes[0];
        }
        // AUTRES (admin, secrétaire, professeur) : classes de l'établissement
        else {
            classes = await timetableModel.getClassesWithTimetable(user.establishment_id);
            if (classes.length > 0) defaultClass = classes[0];
        }

        res.render('shared/timetable-view', {
            title: 'Emploi du Temps',
            user: user,
            classes: classes,
            defaultClass: defaultClass,
            children: children
        });

    } catch (error) {
        console.error('Erreur renderTimetable:', error);
        req.flash('error_msg', 'Erreur lors du chargement de l\'emploi du temps');
        res.redirect('/dashboard');
    }
};

module.exports = { renderTimetable };