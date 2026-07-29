document.addEventListener('DOMContentLoaded', () => {
    // Se connecte à l'espace de noms par défaut de Socket.IO
    const socket = io();

    const currentUserRole = document.body.dataset.userRole;
    const establishmentId = document.body.dataset.establishmentId;

    /**
     * Met à jour la valeur d'une carte de statistique.
     * @param {string} id - L'ID de l'élément HTML contenant la valeur.
     * @param {string|number} value - La nouvelle valeur à afficher.
     */
    const updateStat = (id, value) => {
        const el = document.getElementById(id);
        if (el) {
            // Ajoute une classe pour une animation CSS (optionnel)
            el.classList.add('stat-updated');
            el.textContent = value;
            // Retire la classe après l'animation
            setTimeout(() => el.classList.remove('stat-updated'), 600);
        }
    };

    // Écoute l'événement 'adminStatsUpdate' envoyé par le serveur
    socket.on('adminStatsUpdate', (data) => {
        // Mise à jour pour le SUPER_ADMIN
        if (data.superAdminStats && currentUserRole === 'super_admin') {
            const stats = data.superAdminStats;
            updateStat('total-users-stat', stats.totalUserCount);
            updateStat('admin-count-stat', stats.adminCount);
            updateStat('establishment-count-stat', stats.establishmentCount);
            updateStat('pending-users-stat', stats.pendingCount);

            // Met à jour la liste des établissements
            const establishmentList = document.getElementById('establishment-user-counts');
            if (establishmentList && stats.establishmentsWithCounts) {
                let html = '';
                stats.establishmentsWithCounts.forEach(est => {
                    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
                                ${est.name}
                                <span class="badge bg-primary rounded-pill">${est.userCount} utilisateur(s)</span>
                             </li>`;
                });
                establishmentList.innerHTML = html;
            }
        }

        // Mise à jour pour l'ADMINISTRATOR d'un établissement
        if (data.adminStats && currentUserRole === 'administrateur') {
            if (data.adminStats.establishmentId == establishmentId) {
                const stats = data.adminStats;
                updateStat('student-count-stat', stats.studentCount);
                updateStat('professor-count-stat', stats.professorCount);
                updateStat('parent-count-stat', stats.parentCount);
                updateStat('pending-users-stat', stats.pendingCount);
            }
        }
    });
});