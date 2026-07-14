const gradeModel = require('../models/gradeModel');
const userModel = require('../models/userModel');
const notificationModel = require('../models/notificationModel');

const listGrades = async (req, res) => {
    try {
        const grades = await gradeModel.getGradesForUser(req.user);
        res.render('grades', {
            title: 'Mes Notes | EducOS-pro',
            user: req.user,
            grades: grades
        });
    } catch (error) {
        console.error('Error listing grades:', error);
        req.flash('error_msg', 'Impossible de charger les notes.');
        return res.redirect('/dashboard');
    }
};

const renderGradeForm = async (req, res) => {
    try {
        const grade = req.params.id ? await gradeModel.getGradeById(req.params.id) : null;
        const students = (await userModel.getAllUsers()).filter(u => u.role === 'eleve');
        
        if (grade && req.user.role === 'professeur' && grade.professor_id !== req.user.id) {
            req.flash('error_msg', 'Action non autorisée.');
            return res.redirect('/students/grades');
        }

        res.render('gradeForm', {
            title: (grade ? 'Modifier une note' : 'Ajouter une note') + ' | EducOS-pro',
            user: req.user,
            grade,
            students
        });
    } catch (error) {
        console.error('Error rendering grade form:', error);
        req.flash('error_msg', 'Erreur lors du chargement du formulaire.');
        res.redirect('/students/grades');
    }
};

const createOrUpdateGrade = async (req, res) => {
    const { student_id, subject, grade, comment } = req.body;
    const { id } = req.params;

    try {
        if (id) {
            await gradeModel.updateGrade(id, { student_id, subject, grade, comment });
            req.flash('success_msg', 'Note mise à jour avec succès.');
        } else {
            await gradeModel.createGrade({
                student_id,
                subject,
                grade,
                comment,
                professor_id: req.user.id
            });

            const student = await userModel.getUserById(student_id);
            const parents = await userModel.getParentsOfStudent(student_id);
            const io = req.app.get('io');

            const notificationPayload = {
                type: 'grade',
                title: `Nouvelle note en ${subject}`,
                body: `La note de ${grade} a été ajoutée.`,
                link: '/students/grades'
            };

            await notificationModel.createNotification({ ...notificationPayload, user_id: student.id });
            const studentUnread = await notificationModel.getUnreadNotificationCountForUser(student);
            if (io) io.to(`user_${student.id}`).emit('unreadNotificationUpdate', { count: studentUnread });

            for (const parent of parents) {
                await notificationModel.createNotification({ ...notificationPayload, user_id: parent.id, title: `Nouvelle note pour ${student.name}` });
                const parentUnread = await notificationModel.getUnreadNotificationCountForUser(parent);
                if (io) io.to(`user_${parent.id}`).emit('unreadNotificationUpdate', { count: parentUnread });
            }
            
            req.flash('success_msg', 'Note ajoutée avec succès.');
        }
        res.redirect('/students/grades');
    } catch (error) {
        console.error('Error creating/updating grade:', error);
        req.flash('error_msg', "Erreur lors de l'enregistrement de la note.");
        res.redirect(id ? `/students/grades/${id}/edit` : '/students/grades/new');
    }
};

const deleteGrade = async (req, res) => {
    try {
        const grade = await gradeModel.getGradeById(req.params.id);
        if (req.user.role === 'professeur' && grade.professor_id !== req.user.id) {
             req.flash('error_msg', 'Action non autorisée.');
             return res.redirect('/students/grades');
        }
        await gradeModel.deleteGrade(req.params.id);
        req.flash('success_msg', 'Note supprimée avec succès.');
        res.redirect('/students/grades');
    } catch (error) {
        console.error('Error deleting grade:', error);
        req.flash('error_msg', 'Impossible de supprimer la note.');
        res.redirect('/students/grades');
    }
};

module.exports = {
    listGrades,
    renderGradeForm,
    createOrUpdateGrade,
    deleteGrade
};