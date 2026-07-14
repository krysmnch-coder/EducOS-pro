document.addEventListener('DOMContentLoaded', function() {
    const currentUserId = document.body.dataset.userId;
    if (!currentUserId) {
        const btn = document.getElementById('chatFloatBtn');
        if (btn) btn.style.display = 'none';
        return;
    }

    const socket = io();

    // --- Audio ---
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
            const response = await fetch('/chat/api/conversations');
            if (!response.ok) throw new Error('Failed to fetch conversations');
            const conversations = await response.json();

            userListEl.innerHTML = '';
            if (conversations.length === 0) {
                userListEl.innerHTML = '<p class="p-3 text-muted text-center small">Aucune conversation.</p>';
                return;
            }

            conversations.forEach(convo => {
                const isOnline = onlineUserIds.has(convo.id.toString());
                const unreadHtml = convo.unread_count > 0 ? `<div class="unread-badge">${convo.unread_count}</div>` : '';
                const item = document.createElement('div');
                item.className = 'list-group-item';
                item.dataset.userId = convo.id;
                item.dataset.userName = convo.name;
                item.dataset.userAvatar = convo.avatar_url || '/img/user.png';
                item.innerHTML = `
                    <div class="avatar-container ${isOnline ? 'online' : ''}">
                        <img src="${item.dataset.userAvatar}" alt="${convo.name}" class="widget-avatar">
                    </div>
                    <div class="user-info">
                        <div class="user-name">${convo.name}</div>
                        <div class="last-message">${convo.last_message ? convo.last_message.substring(0, 25) + '...' : 'Pas de messages'}</div>
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
            const response = await fetch(`/chat/api/messages/${userId}`);
            if (!response.ok) throw new Error('Failed to fetch messages');
            const messages = await response.json();

            messageContainerEl.innerHTML = '';
            let lastDate = null;
            messages.forEach(msg => {
                const messageDate = new Date(msg.created_at);
                if (!lastDate || !ChatUtils.isSameDay(messageDate, lastDate)) {
                    ChatUtils.appendDateSeparator(messageDate, messageContainerEl);
                }
                appendMessage(msg, msg.sender_id);
                lastDate = messageDate;
            });
            socket.emit('markRead', { senderId: userId });
        } catch (error) {
            console.error(`Error loading widget messages for user ${userId}:`, error);
            messageContainerEl.innerHTML = '<p class="text-center text-danger small">Erreur de chargement.</p>';
        }
    };

    const appendMessage = (msg, senderId) => {
        const container = messageContainerEl;
        // Détermine si l'utilisateur est déjà en bas du conteneur AVANT d'ajouter le nouveau message.
        // On ajoute une petite marge (5px) pour être plus tolérant.
        const isScrolledToBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 5;

        const messageEl = document.createElement('div');
        const isSent = senderId == currentUserId;
        messageEl.className = `chat-message ${isSent ? 'sent' : 'received'}`;
        messageEl.dataset.messageId = msg.id;
        messageEl.dataset.timestamp = msg.created_at || new Date().toISOString();

        // Formatage de l'heure
        const messageDate = new Date(msg.created_at || Date.now());
        const timeString = messageDate.toLocaleTimeString(navigator.language, {
            hour: '2-digit',
            minute: '2-digit'
        });

        let readStatusHtml = '';
        if (isSent) {
            const status = msg.is_read == 1 ? 'read' : 'sent';
            readStatusHtml = `<span class="message-status" data-status="${status}"></span>`;
        }

        // Le contenu du message est directement dans la bulle pour que le float fonctionne correctement
        messageEl.innerHTML = `
            ${msg.message}
            <div class="message-meta-container">
                <span class="message-time">${timeString}</span>
                ${readStatusHtml}
            </div>
        `;

        container.appendChild(messageEl);
        // Ne fait défiler vers le bas que si l'utilisateur était déjà en bas.
        if (isScrolledToBottom) {
            container.scrollTop = container.scrollHeight;
        }
    };

    const sendMessage = () => {
        const message = messageInput.value.trim();
        if (!message || !activeUserId || sendBtn.disabled) return;

        sendBtn.disabled = true;
        socket.emit('sendMessage', { receiverId: activeUserId, message: message }, (response) => {
            sendBtn.disabled = false;
            if (response.success) {
                const sentMessage = response.message;
                sentMessage.is_read = 0; // Un nouveau message n'est pas lu par défaut
                appendMessage(sentMessage, currentUserId);
                messageInput.value = '';
                messageInput.focus();
            } else {
                console.error('Failed to send message from widget:', response.error);
            }
        });
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
        if (isPanelOpen && isForActiveChat && isWindowFocused) {
            const lastMessageEl = messageContainerEl.querySelector('.chat-message:last-child');
            const lastMessageDate = lastMessageEl ? new Date(lastMessageEl.dataset.timestamp) : null;
            const newMessageDate = new Date(data.message.created_at);

            if (!lastMessageDate || !ChatUtils.isSameDay(newMessageDate, lastMessageDate)) {
                ChatUtils.appendDateSeparator(newMessageDate, messageContainerEl);
            }
            
            appendMessage(data.message, data.senderId);
            socket.emit('markRead', { senderId: activeUserId });
        } else {
            // Dans tous les autres cas, on notifie.
            if (!isWindowFocused) ChatUtils.startTitleBlink();
            
            ChatUtils.showSystemNotification(`Nouveau message de ${data.senderName}`, {
                body: data.message.message.substring(0, 100),
                icon: '/img/logo.png' // Assurez-vous que ce fichier existe dans /public/img
            }, openPanel); // Le callback ouvre le panneau de chat
            ChatUtils.playNotificationSound();

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

    // Demander la permission pour les notifications au chargement
    if ('Notification' in window && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }

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
