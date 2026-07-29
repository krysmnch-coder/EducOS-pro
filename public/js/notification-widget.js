document.addEventListener('DOMContentLoaded', function() {
    const currentUserId = document.body.dataset.userId;
    if (!currentUserId) return;

    // --- DOM Elements ---
    const dropdownElement = document.querySelector('.notifications.dropdown-menu');
    if (!dropdownElement) return;

    const listContainer = document.getElementById('notification-list-items');
    const badge = document.getElementById('notification-badge');
    const headerCount = document.getElementById('notification-header-count');
    const loader = document.getElementById('notification-loader');
    const markAllReadLink = document.getElementById('mark-all-as-read-link');

    let notificationsLoaded = false;

    const getIconForType = (type) => {
        switch(type) {
            case 'message': return 'message-square';
            case 'user_approval': return 'user-check';
            case 'new_user': return 'user-plus';
            case 'payment': return 'dollar-sign';
            case 'communication': return 'send';
            default: return 'bell';
        }
    };

    const renderNotifications = (notifications) => {
        listContainer.innerHTML = ''; // Clear loader or old content
        if (!notifications || notifications.length === 0) {
            listContainer.innerHTML = '<div class="px-3 py-2 text-muted text-center small">Aucune notification pour le moment.</div>';
            if (headerCount) headerCount.textContent = '0';
            if (markAllReadLink) markAllReadLink.style.display = 'none';
            return;
        }

        let unreadCount = 0;
        notifications.forEach(notif => {
            if (!notif.is_read) unreadCount++;

            const itemLink = document.createElement('a');
            itemLink.href = notif.link || '#';
            itemLink.className = 'notification-item-link dropdown-item d-flex align-items-start';
            if (!notif.is_read) {
                itemLink.classList.add('unread');
            }
            
            const icon = getIconForType(notif.type);

            itemLink.innerHTML = `
                <i data-feather="${icon}" class="notification-item-icon me-3 mt-1"></i>
                <div>
                    <h6 class="notification-title mb-0">${notif.title}</h6>
                    <p class="notification-body mb-1">${notif.body || ''}</p>
                    <p class="notification-time text-muted small mb-0">${notif.timeAgo}</p>
                </div>
            `;
            listContainer.appendChild(itemLink);
        });

        if (headerCount) headerCount.textContent = unreadCount;
        if (markAllReadLink) {
            markAllReadLink.style.display = unreadCount > 0 ? 'inline' : 'none';
        }

        if (typeof feather !== 'undefined') {
            feather.replace();
        }
    };

    const loadNotifications = async () => {
        if (loader) loader.style.display = 'block';
        listContainer.innerHTML = '';
        
        try {
            const response = await fetch('/notifications/api/json');
            if (!response.ok) throw new Error('Failed to fetch notifications');
            
            const notifications = await response.json();
            renderNotifications(notifications);
            notificationsLoaded = true;

        } catch (error) {
            console.error('Error loading notifications:', error);
            listContainer.innerHTML = '<div class="px-3 py-2 text-danger text-center small">Erreur de chargement.</div>';
        } finally {
            if (loader) loader.style.display = 'none';
        }
    };

    const markAllAsRead = async () => {
        try {
            await fetch('/notifications/api/mark-all-read', { method: 'POST' });

            if (badge) {
                badge.textContent = '0';
                badge.style.display = 'none';
            }
            if (headerCount) headerCount.textContent = '0';
            
            document.querySelectorAll('.notification-item-link.unread').forEach(item => {
                item.classList.remove('unread');
            });
            if (markAllReadLink) markAllReadLink.style.display = 'none';

        } catch (error) {
            console.error('Error marking all as read:', error);
        }
    };

    // Utilise l'événement de Bootstrap pour charger les notifications à l'ouverture
    dropdownElement.parentElement.addEventListener('show.bs.dropdown', () => {
        loadNotifications();
    });

    // Marque tout comme lu après un court délai pour que l'utilisateur voie l'état "non lu"
    dropdownElement.parentElement.addEventListener('shown.bs.dropdown', () => {
        setTimeout(() => {
            if (headerCount && parseInt(headerCount.textContent, 10) > 0) {
                markAllAsRead();
            }
        }, 3000);
    });

    if (markAllReadLink) {
        markAllReadLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            markAllAsRead();
        });
    }

    // Écoute les mises à jour en temps réel si Socket.IO est disponible
    if (typeof io !== 'undefined') {
        const socket = io();
        socket.on('newNotification', (data) => {
            if (badge && data.unreadCount) {
                badge.textContent = data.unreadCount;
                badge.style.display = data.unreadCount > 0 ? 'inline-block' : 'none';
            }
            notificationsLoaded = false; // Force le rechargement à la prochaine ouverture
        });
    }
});