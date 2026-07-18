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

document.addEventListener('DOMContentLoaded', function() {
    const currentUserId = document.body.dataset.userId;
    if (!currentUserId) {
        const btn = document.getElementById('chatFloatBtn');
        if (btn) btn.style.display = 'none';
        return;
    }

    const socket = io();

    // --- State ---
    let activeUserId = null;
    let onlineUserIds = new Set();
    let buttonBlinkInterval = null;

    // --- DOM Elements ---
    const chatFloatBtn = document.getElementById('chatFloatBtn');
    const chatPanel = document.getElementById('chatPanel');
    const closeBtn = document.getElementById('chatCloseBtn');
    const closeBtnAlt = document.getElementById('chat-widget-close-btn-alt');
    const backBtn = document.getElementById('chat-widget-back-btn');

    const listView = document.getElementById('chat-widget-list-view');
    const conversationView = document.getElementById('chat-widget-conversation-view');
    
    const userListEl = document.getElementById('chat-widget-user-list');
    const messageContainerEl = document.getElementById('chat-widget-messages');
    const messageInput = document.getElementById('chat-widget-input');
    const sendBtn = document.getElementById('chat-widget-send-btn');
    const headerNameEl = document.getElementById('chat-widget-header-name');
    const chatBadge = document.getElementById('chatBadge');

    /**
     * Fait clignoter le bouton de chat en alternant une classe CSS.
     */
    const startButtonBlink = () => {
        if (buttonBlinkInterval) return; // Déjà en cours
        stopButtonBlink(); // Sécurité pour nettoyer un intervalle précédent
        buttonBlinkInterval = setInterval(() => {
            chatFloatBtn.classList.toggle('is-pulsing');
        }, 800); // Alterne la couleur toutes les 800ms
    };

    const stopButtonBlink = () => {
        if (buttonBlinkInterval) {
            clearInterval(buttonBlinkInterval);
            buttonBlinkInterval = null;
        }
        chatFloatBtn.classList.remove('is-pulsing'); // S'assure que le bouton revient à son état normal
    };

    const openPanel = () => {
        chatPanel.classList.add('open');
        loadConversations();
        stopButtonBlink(); // Arrêter le clignotement du bouton
        try {
            localStorage.setItem('chatPanelOpen', 'true');
        } catch (e) {
            console.warn('Impossible de sauvegarder l\'état du chat.', e);
        }
    };
    const closePanel = () => {
        chatPanel.classList.remove('open');
        conversationView.style.display = 'none'; // Cacher la vue conversation
        listView.style.display = 'flex'; // Réinitialiser la vue liste en mode flex pour la prochaine ouverture
        activeUserId = null;
        try {
            localStorage.setItem('chatPanelOpen', 'false');
        } catch (e) {
            console.warn('Impossible de sauvegarder l\'état du chat.', e);
        }
    };

    const loadConversations = async () => {
        try {
            const conversations = await ChatLogic.fetchConversations();

            userListEl.innerHTML = '';
            if (conversations.length === 0) {
                userListEl.innerHTML = '<p class="p-3 text-muted text-center small">Aucune conversation.</p>';
                return;
            }

            conversations.forEach(convo => {
                const isOnline = onlineUserIds.has(convo.id.toString());
                const unreadHtml = convo.unread_count > 0 ? `<div class="unread-badge">${convo.unread_count}</div>` : '';

                // Logique d'affichage sécurisée pour le dernier message
                let lastMessageText = 'Pas de messages';
                if (convo.last_message) {
                    const safeMessage = ChatLogic.escapeHTML(convo.last_message);
                    lastMessageText = safeMessage.length > 25 ? safeMessage.substring(0, 25) + '...' : safeMessage;
                }

                const item = document.createElement('div');
                item.className = 'list-group-item';
                item.dataset.userId = convo.id;
                item.dataset.userName = convo.name;
                item.dataset.userAvatar = convo.avatar_url || '/img/user.png';
                item.innerHTML = `
                    <div class="avatar-container ${isOnline ? 'online' : ''}"><img src="${ChatLogic.escapeHTML(item.dataset.userAvatar)}" alt="${ChatLogic.escapeHTML(convo.name)}" class="widget-avatar"></div>
                    <div class="user-info">
                        <div class="user-name">${ChatLogic.escapeHTML(convo.name)}</div>
                        <div class="last-message">${lastMessageText}</div>
                    </div>
                    ${unreadHtml}
                `;
                item.addEventListener('click', () => openConversation(item.dataset.userId, item.dataset.userName, item.dataset.userAvatar));
                userListEl.appendChild(item);
            });
        } catch (error) {
            console.error('Error loading widget conversations:', error);
            userListEl.innerHTML = '<p class="p-3 text-danger text-center small">Erreur de chargement.</p>';
        }
    };

    const openConversation = async (userId, userName, userAvatar) => {
        activeUserId = userId;
        const isOnline = onlineUserIds.has(userId);
        headerNameEl.innerHTML = `
            ${userName}
            <small class="d-block user-status ${isOnline ? 'online' : 'offline'}">
                ${isOnline ? 'En ligne' : 'Hors ligne'}
            </small>
        `;
        headerNameEl.style.lineHeight = '1.2';

        listView.style.display = 'none';
       
        conversationView.style.display = 'flex';
        messageContainerEl.innerHTML = '<div class="text-center p-4"><div class="spinner-border spinner-border-sm" role="status"></div></div>';
        await loadMessages(userId);
    };

    const loadMessages = async (userId) => {
        try {
            const messages = await ChatLogic.fetchMessages(userId);

            messageContainerEl.innerHTML = '';
            let lastDate = null;
            messages.forEach(msg => {
                const messageDate = new Date(msg.created_at);
                if (!lastDate || !ChatLogic.isSameDay(messageDate, lastDate)) {
                    const separatorEl = ChatLogic.renderDateSeparator(messageDate);
                    ChatLogic.appendMessageToContainer(separatorEl, messageContainerEl);
                }
                const messageEl = ChatLogic.renderMessage(msg, currentUserId);
                ChatLogic.appendMessageToContainer(messageEl, messageContainerEl);
                lastDate = messageDate;
            });
            ChatLogic.scrollToBottom(messageContainerEl);
            socket.emit('markRead', { senderId: userId });
        } catch (error) {
            console.error(`Error loading widget messages for user ${userId}:`, error);
            messageContainerEl.innerHTML = '<p class="text-center text-danger small">Erreur de chargement.</p>';
        }
    };
    
    const sendMessage = async () => {
        const message = messageInput.value.trim();
        if (!message || !activeUserId || sendBtn.disabled) return;

        sendBtn.disabled = true;
        try {
            const sentMessage = await ChatLogic.sendMessage(socket, activeUserId, message);
            sentMessage.is_read = 0; // Un nouveau message n'est pas lu par défaut
            const messageEl = ChatLogic.renderMessage(sentMessage, currentUserId);
            ChatLogic.appendMessageToContainer(messageEl, messageContainerEl);
            ChatLogic.scrollToBottom(messageContainerEl);
            messageInput.value = '';
            messageInput.focus();
        } catch (error) {
            console.error('Failed to send message from widget:', error);
        } finally {
            sendBtn.disabled = false;
        }
    };

    const updateBadge = (count) => {
        if (chatBadge) {
            if (count > 0) {
                chatBadge.textContent = count;
                chatBadge.style.display = 'flex';
            } else {
                chatBadge.style.display = 'none';
            }
        }
    };

    // --- Event Listeners ---
    chatFloatBtn.addEventListener('click', () => chatPanel.classList.contains('open') ? closePanel() : openPanel());
    closeBtn.addEventListener('click', closePanel);
    closeBtnAlt.addEventListener('click', closePanel);

    backBtn.addEventListener('click', () => {
        conversationView.style.display = 'none'; // Cacher la vue conversation
        listView.style.display = 'flex'; // Revenir à la vue liste en mode flex
        activeUserId = null;
        loadConversations(); // Recharger pour mettre à jour les badges
    });

    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendMessage();
        }
    });

    // --- Socket.IO Listeners ---
    socket.on('connect', () => {
        console.log('Widget connecté au serveur de chat.');
    });

    // Réception de la liste des utilisateurs en ligne
    socket.on('onlineUsersUpdate', (users) => {
        onlineUserIds = new Set(users.map(String));
        // Si le panneau est ouvert et en mode liste, on met à jour.
        if (chatPanel.classList.contains('open') && !activeUserId) {
            loadConversations();
        }

        // Mettre à jour le statut dans l'en-tête du widget si une conversation est active
        if (chatPanel.classList.contains('open') && activeUserId) {
            const statusEl = headerNameEl.querySelector('.user-status');
            if (statusEl) {
                const isOnline = onlineUserIds.has(activeUserId);
                statusEl.textContent = isOnline ? 'En ligne' : 'Hors ligne';
                statusEl.className = `d-block user-status ${isOnline ? 'online' : 'offline'}`;
            }
        }
    });

    // Réception de la confirmation de lecture
    socket.on('messageRead', (data) => {
        // Si la personne qui a lu est celle avec qui nous discutons activement dans le widget
        if (chatPanel.classList.contains('open') && data.readerId == activeUserId) {
            const sentStatuses = messageContainerEl.querySelectorAll('.message-status[data-status="sent"]');
            sentStatuses.forEach(statusEl => {
                statusEl.dataset.status = 'read';
            });
        }
    });

    socket.on('newMessage', (data) => {
        const isPanelOpen = chatPanel.classList.contains('open');
        const isForActiveChat = data.senderId == activeUserId;
        const isWindowFocused = !document.hidden;

        // Condition pour simplement afficher le message : le panel est ouvert, pour la bonne conversation, et la fenêtre est visible.
        if (isPanelOpen && isForActiveChat) {
            const lastMessageEl = messageContainerEl.querySelector('.chat-message:last-child');
            const lastMessageDate = lastMessageEl ? new Date(lastMessageEl.dataset.timestamp) : null;
            const newMessageDate = new Date(data.message.created_at);

            if (!lastMessageDate || !ChatLogic.isSameDay(newMessageDate, lastMessageDate)) {
                const separatorEl = ChatLogic.renderDateSeparator(newMessageDate);
                ChatLogic.appendMessageToContainer(separatorEl, messageContainerEl);
            }
            
            const messageEl = ChatLogic.renderMessage(data.message, data.senderId);
            ChatLogic.appendMessageToContainer(messageEl, messageContainerEl);
            ChatLogic.scrollToBottom(messageContainerEl);
            if (isWindowFocused) socket.emit('markRead', { senderId: activeUserId });
        } else {
            // Dans tous les autres cas, on notifie.
            if (!isWindowFocused) ChatLogic.startTitleBlink();
            ChatLogic.showSystemNotification(`Nouveau message de ${data.senderName}`, {
                body: data.message.message.substring(0, 100),
                icon: '/img/logo.png' // Assurez-vous que ce fichier existe dans /public/img
            }, openPanel); // Le callback ouvre le panneau de chat
            ChatLogic.playNotificationSound();

            // Faire clignoter le bouton si le panneau est fermé
            if (!isPanelOpen) {
                startButtonBlink();
            }

            if (isPanelOpen) {
                loadConversations();
            }
        }
    });

    socket.on('unreadChatUpdate', (data) => {
        updateBadge(data.count);
        // Si le panneau est ouvert, on met à jour la liste des conversations
        if (chatPanel.classList.contains('open') && !activeUserId) {
            loadConversations();
        }
    });

    // Initial fetch for badge count on page load
    (async () => {
        try {
            const response = await fetch('/chat/api/unread');
            if (response.ok) {
                const data = await response.json();
                updateBadge(data.count);
            }
        } catch (e) {
            console.error("Could not fetch initial unread count for widget.");
        }
    })();

    // --- Initialisation de l'état du panneau ---
    // Vérifie si le panneau doit être ouvert au chargement de la page
    try {
        if (localStorage.getItem('chatPanelOpen') === 'true') {
            openPanel();
        }
    } catch (e) {
        console.warn('Impossible de lire l\'état du chat depuis localStorage.', e);
    }
});
