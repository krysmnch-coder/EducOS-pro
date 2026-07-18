// public/js/chat-utils.js

const ChatUtils = (() => {
    // --- État géré par l'utilitaire ---
    let originalTitle = document.title;
    let blinkInterval = null;
    let hasWarnedAboutAudio = false;

    // Créer une seule instance de l'objet Audio
    const notificationSound = new Audio('/sounds/notification.mp3');
    notificationSound.onerror = function() {
        console.error("Erreur: Impossible de charger le fichier audio '/sounds/notification.mp3'.");
    };

    // --- Fonctions Publiques ---

    /**
     * Joue le son de notification, en gérant les restrictions de lecture automatique du navigateur.
     */
    const playNotificationSound = () => {
        const promise = notificationSound.play();
        if (promise !== undefined) {
            promise.catch(error => {
                if (!hasWarnedAboutAudio) {
                    console.warn("La lecture du son a été bloquée par le navigateur. C'est normal avant la première interaction de l'utilisateur.", error);
                    hasWarnedAboutAudio = true;
                }
            });
        }
    };

    /**
     * Fait clignoter le titre de l'onglet pour attirer l'attention de l'utilisateur.
     */
    const startTitleBlink = () => {
        if (blinkInterval) return; // Déjà en cours de clignotement
        let isOriginal = true;
        blinkInterval = setInterval(() => {
            document.title = isOriginal ? 'Nouveau message !' : originalTitle;
            isOriginal = !isOriginal;
        }, 1000);
    };

    /**
     * Arrête le clignotement du titre et restaure le titre original.
     */
    const stopTitleBlink = () => {
        if (blinkInterval) {
            clearInterval(blinkInterval);
            blinkInterval = null;
        }
        document.title = originalTitle;
    };

    /**
     * Affiche une notification système si la permission est accordée.
     * @param {string} title - Le titre de la notification.
     * @param {object} options - Les options de la notification (body, icon, etc.).
     * @param {function} [onClickCallback] - Callback optionnel à exécuter lors du clic sur la notification.
     */
    const showSystemNotification = (title, options, onClickCallback) => {
        if (!('Notification' in window) || Notification.permission !== 'granted') {
            return;
        }
        const notification = new Notification(title, options);
        notification.onclick = () => {
            window.focus();
            if (typeof onClickCallback === 'function') {
                onClickCallback();
            }
        };
    };

    /**
     * Vérifie si deux objets Date correspondent au même jour.
     * @param {Date} date1
     * @param {Date} date2
     * @returns {boolean}
     */
    const isSameDay = (date1, date2) => {
        if (!date1 || !date2) return false;
        return date1.getFullYear() === date2.getFullYear() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getDate() === date2.getDate();
    };

    /**
     * Formate une date pour le séparateur de date dans le chat.
     * @param {Date} date
     * @returns {string} "Aujourd'hui", "Hier", ou la date complète.
     */
    const formatDateSeparator = (date) => {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (isSameDay(date, today)) return "Aujourd'hui";
        if (isSameDay(date, yesterday)) return "Hier";
        return date.toLocaleDateString(navigator.language || 'fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    /**
     * Ajoute un séparateur de date à un conteneur de messages donné.
     * @param {Date} date - La date pour le séparateur.
     * @param {HTMLElement} containerEl - L'élément DOM auquel l'ajouter.
     */
    const appendDateSeparator = (date, containerEl) => {
        if (!containerEl) return;
        const separatorEl = document.createElement('div');
        separatorEl.className = 'date-separator';
        separatorEl.textContent = formatDateSeparator(date);
        containerEl.appendChild(separatorEl);
    };

    // Arrête le clignotement lorsque l'utilisateur revient sur l'onglet
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            stopTitleBlink();
        }
    });

    // Exposer les fonctions publiques
    return {
        playNotificationSound,
        startTitleBlink,
        stopTitleBlink,
        showSystemNotification,
        isSameDay,
        formatDateSeparator,
        appendDateSeparator
    };
})();