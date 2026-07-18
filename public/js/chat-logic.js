// public/js/chat-logic.js

/**
 * Ce module contient toute la logique métier et la communication avec le serveur pour le chat.
 * Il est conçu pour être utilisé à la fois par la page de chat complète et le widget de chat.
 */
const ChatLogic = (() => {

    // --- Fonctions Utilitaires Internes ---

    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return str.toString()
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function isSameDay(date1, date2) {
        if (!date1 || !date2) return false;
        return date1.getFullYear() === date2.getFullYear() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getDate() === date2.getDate();
    }

    function formatDateSeparator(date) {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (isSameDay(date, today)) return "Aujourd'hui";
        if (isSameDay(date, yesterday)) return "Hier";
        return date.toLocaleDateString(navigator.language || 'fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    // --- Fonctions d'API (Communication avec le serveur) ---

    async function fetchConversations(timeout = 20000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch('/chat/api/conversations', { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) {
                throw new Error(`Failed to fetch conversations with status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            console.error('Error fetching conversations:', error);
            throw error;
        }
    }

    async function fetchMessages(userId) {
        try {
            const response = await fetch(`/chat/api/messages/${userId}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch messages with status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Error fetching messages for user ${userId}:`, error);
            throw error;
        }
    }

    function sendMessage(socket, receiverId, message) {
        return new Promise((resolve, reject) => {
            if (!message || !receiverId) {
                return reject(new Error('Receiver ID and message are required.'));
            }

            socket.emit('sendMessage', { receiverId, message }, (response) => {
                if (response && response.success) {
                    resolve(response.message);
                } else {
                    reject(new Error(response?.error || 'Failed to send message.'));
                }
            });
        });
    }

    // --- Fonctions de Rendu (Manipulation du DOM) ---

    function renderMessage(msg, currentUserId) {
        const isSent = msg.sender_id == currentUserId;
        const timeString = new Date(msg.created_at || Date.now()).toLocaleTimeString(navigator.language, {
            hour: '2-digit',
            minute: '2-digit'
        });

        let readStatusHtml = '';
        if (isSent) {
            const status = msg.is_read == 1 ? 'read' : 'sent';
            readStatusHtml = `<span class="message-status" data-status="${status}"></span>`;
        }

        const messageEl = document.createElement('div');
        messageEl.className = `chat-message ${isSent ? 'sent' : 'received'}`;
        messageEl.dataset.messageId = msg.id;
        messageEl.dataset.timestamp = msg.created_at || new Date().toISOString();
        messageEl.innerHTML = `
            ${escapeHTML(msg.message)}
            <div class="message-meta-container">
                <span class="message-time">${timeString}</span>
                ${readStatusHtml}
            </div>
        `;
        return messageEl;
    }

    function renderDateSeparator(date) {
        const separatorEl = document.createElement('div');
        separatorEl.className = 'date-separator';
        separatorEl.textContent = formatDateSeparator(date);
        return separatorEl;
    }

    function appendMessageToContainer(messageEl, containerEl) {
        if (!containerEl) return;
        containerEl.appendChild(messageEl);
    }

    function scrollToBottom(containerEl) {
        if (containerEl) {
            containerEl.scrollTop = containerEl.scrollHeight;
        }
    }

    // --- Notifications ---
    const notificationSound = new Audio('/sounds/notification.mp3');
    let originalTitle = document.title;
    let blinkInterval = null;

    function playNotificationSound() {
        notificationSound.play().catch(e => console.warn("La lecture du son a été bloquée.", e));
    }

    function startTitleBlink() {
        if (blinkInterval) return;
        let isOriginal = true;
        blinkInterval = setInterval(() => {
            document.title = isOriginal ? 'Nouveau message !' : originalTitle;
            isOriginal = !isOriginal;
        }, 1000);
    }

    function stopTitleBlink() {
        if (blinkInterval) {
            clearInterval(blinkInterval);
            blinkInterval = null;
        }
        document.title = originalTitle;
    }

    function showSystemNotification(title, options, onClickCallback) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        const notification = new Notification(title, options);
        notification.onclick = () => {
            window.focus();
            if (typeof onClickCallback === 'function') onClickCallback();
        };
    }

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            stopTitleBlink();
        }
    });

    if ('Notification' in window && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }

    // --- Exposition des fonctions publiques ---
    return {
        escapeHTML,
        isSameDay,
        fetchConversations,
        fetchMessages,
        sendMessage,
        renderMessage,
        renderDateSeparator,
        appendMessageToContainer,
        scrollToBottom,
        playNotificationSound,
        startTitleBlink,
        stopTitleBlink,
        showSystemNotification
    };
})();