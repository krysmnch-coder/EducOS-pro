document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // --- Audio ---
    let activeUserId = null;
    let typingTimeout = null;
    let onlineUserIds = new Set();
    const currentUserId = document.body.dataset.userId; // Assurez-vous que l'ID de l'utilisateur est disponible

    // --- Sélecteurs DOM ---
    const userListEl = document.getElementById('user-list');
    const messageContainerEl = document.getElementById('message-container');
    const messageForm = document.getElementById('message-form');
    const messageInput = document.getElementById('message-input');
    const chatWindow = document.getElementById('chat-window');
    const chatPlaceholder = document.getElementById('chat-placeholder');
    const chatHeaderEl = document.getElementById('chat-header');
    const chatHeaderTitle = document.getElementById('chat-header-title');
    const backToListBtn = document.getElementById('back-to-list-btn');
    const typingIndicatorEl = document.getElementById('typing-indicator');

    /**
     * Charge et affiche la liste des conversations depuis l'API.
     */
    const loadConversations = async () => {
        try {
            const response = await fetch('/chat/api/conversations');
            if (!response.ok) throw new Error('Failed to fetch conversations');
            const conversations = await response.json();

            userListEl.innerHTML = ''; // Vider la liste
            if (conversations.length === 0) {
                userListEl.innerHTML = '<p class="p-3 text-muted">Aucune conversation récente.</p>';
                return;
            }

            conversations.forEach(convo => {
                const isOnline = onlineUserIds.has(convo.id.toString());
                const unreadCount = convo.unread_count > 0 ? `<span class="badge bg-danger rounded-pill ms-auto">${convo.unread_count}</span>` : '';
                const userItem = document.createElement('a');
                userItem.href = '#';
                userItem.className = 'list-group-item list-group-item-action d-flex align-items-center';
                userItem.dataset.userId = convo.id;
                userItem.innerHTML = `
                    <div class="avatar-container me-3 ${isOnline ? 'online' : ''}">
                        <img src="${convo.avatar_url || '/img/user.png'}" alt="${convo.name}" class="list-avatar">
                    </div>
                    <div class="flex-grow-1">
                        ${convo.name}
                        <div class="small text-muted">${convo.last_message ? convo.last_message.substring(0, 25) + '...' : 'Pas de messages'}</div>
                    </div>
                    ${unreadCount}
                `;
                userListEl.appendChild(userItem);
            });
        } catch (error) {
            console.error('Error loading conversations:', error);
            userListEl.innerHTML = '<p class="p-3 text-danger">Erreur de chargement.</p>';
        }
    };

    /**
     * Charge et affiche les messages pour un utilisateur donné.
     * @param {string} userId - L'ID de l'autre utilisateur.
     */
    const loadMessages = async (userId) => {
        try {
            const response = await fetch(`/chat/api/messages/${userId}`);
            if (!response.ok) throw new Error('Failed to fetch messages');
            const messages = await response.json();

            messageContainerEl.innerHTML = ''; // Vider les messages précédents
            let lastDate = null;
            messages.forEach(msg => {
                const messageDate = new Date(msg.created_at);
                if (!lastDate || !ChatUtils.isSameDay(messageDate, lastDate)) {
                    ChatUtils.appendDateSeparator(messageDate, messageContainerEl);
                }
                appendMessage(msg, msg.sender_id);
                lastDate = messageDate;
            });

            // Marquer les messages comme lus sur le serveur
            socket.emit('markRead', { senderId: userId });

        } catch (error) {
            console.error(`Error loading messages for user ${userId}:`, error);
            messageContainerEl.innerHTML = '<p class="text-center text-danger">Impossible de charger les messages.</p>';
        }
    };

    /**
     * Ajoute un message à la fenêtre de chat.
     * @param {object} msg - L'objet message.
     * @param {string} senderId - L'ID de l'expéditeur.
     */
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

        messageContainerEl.appendChild(messageEl);
        scrollToBottom();
    };

    const scrollToBottom = () => {
        messageContainerEl.scrollTop = messageContainerEl.scrollHeight;
    };

    const openChatWindow = async (userId, userName) => {
        activeUserId = userId;

        // Mettre en surbrillance l'utilisateur actif dans la liste
        document.querySelectorAll('#user-list a').forEach(el => el.classList.remove('active'));
        const userLink = userListEl.querySelector(`a[data-user-id="${userId}"]`);
        if (userLink) {
            userLink.classList.add('active');
        }

        // Afficher la fenêtre de chat et masquer le placeholder
        chatPlaceholder.style.display = 'none';
        chatWindow.style.display = 'flex';
        document.querySelector('.chat-page-container').classList.add('show-chat');

        // Activer le formulaire
        messageInput.disabled = false;
        messageForm.querySelector('button').disabled = false;

        // Mettre à jour l'en-tête
        const isOnline = onlineUserIds.has(userId);
        chatHeaderTitle.innerHTML = `
            <div>
                ${userName}
                <small class="d-block user-status ${isOnline ? 'online' : 'offline'}">
                    ${isOnline ? 'En ligne' : 'Hors ligne'}
                </small>
            </div>
        `;

        await loadMessages(activeUserId);
        loadConversations(); // Recharger pour mettre à jour les badges et l'ordre
    };

    const closeChatWindow = () => {
        activeUserId = null;
        document.querySelector('.chat-page-container').classList.remove('show-chat');
    };

    // --- Écouteurs d'événements ---

    // Clic sur un utilisateur dans la liste
    userListEl.addEventListener('click', async (e) => {
        const userLink = e.target.closest('a.list-group-item');
        if (!userLink) return;
        e.preventDefault();
        const userName = userLink.querySelector('.flex-grow-1').textContent.trim().split('\n')[0];
        openChatWindow(userLink.dataset.userId, userName);
    });

    // Bouton retour pour la vue mobile
    if (backToListBtn) {
        backToListBtn.addEventListener('click', closeChatWindow);
    }

    // Envoi d'un message
    messageForm.addEventListener('submit', (e) => { // Remplacé par une logique avec confirmation
        e.preventDefault();
        const message = messageInput.value.trim();
        const sendButton = messageForm.querySelector('button');

        if (!message || !activeUserId || sendButton.disabled) {
            return;
        }

        // Désactiver le formulaire pour éviter les doubles envois
        messageInput.disabled = true;
        sendButton.disabled = true;
        const originalButtonContent = sendButton.innerHTML;
        sendButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';

        socket.emit('sendMessage', {
            receiverId: activeUserId,
            message: message
        }, (response) => {
            // Réactiver le formulaire
            messageInput.disabled = false;
            sendButton.disabled = false;
            sendButton.innerHTML = originalButtonContent;

            if (response.success) {
                const sentMessage = response.message;
                sentMessage.is_read = 0; // Un nouveau message n'est pas lu par défaut
                appendMessage(sentMessage, currentUserId); // Affiche notre message
                messageInput.value = '';
                messageInput.focus();
            } else {
                // En cas d'erreur, on peut alerter l'utilisateur
                console.error('Failed to send message:', response.error);
                alert(`Erreur lors de l'envoi : ${response.error}`);
            }
        });
    });

    // Indicateur de saisie (typing)
    messageInput.addEventListener('input', () => {
        if (activeUserId) {
            socket.emit('typing', { receiverId: activeUserId });
        }
    });

    // --- Écouteurs Socket.IO ---

    socket.on('connect', () => {
        console.log('Connecté au serveur de chat via Socket.IO');
    });

    // Réception de la liste des utilisateurs en ligne
    socket.on('onlineUsersUpdate', (users) => {
        onlineUserIds = new Set(users.map(String));
        loadConversations(); // Met à jour la liste des conversations avec le statut

        // Mettre à jour le statut dans l'en-tête du chat actif
        if (activeUserId) {
            const statusEl = document.querySelector('#chat-header .user-status');
            if (statusEl) {
                const isOnline = onlineUserIds.has(activeUserId);
                statusEl.textContent = isOnline ? 'En ligne' : 'Hors ligne';
                statusEl.className = `d-block user-status ${isOnline ? 'online' : 'offline'}`;
            }
        }
    });

    // Réception d'un nouveau message
    socket.on('newMessage', (data) => {
        const isForActiveChat = data.senderId == activeUserId;
        const isWindowFocused = !document.hidden;

        // Si le message est pour la conversation active, on l'ajoute à la vue
        if (isForActiveChat) {
            const lastMessageEl = messageContainerEl.querySelector('.chat-message:last-child');
            const lastMessageDate = lastMessageEl ? new Date(lastMessageEl.dataset.timestamp) : null;
            const newMessageDate = new Date(data.message.created_at);

            if (!lastMessageDate || !ChatUtils.isSameDay(newMessageDate, lastMessageDate)) {
                ChatUtils.appendDateSeparator(newMessageDate, messageContainerEl);
            }
            appendMessage(data.message, data.senderId);
            // Et on le marque comme lu si la fenêtre est visible
            if (isWindowFocused) {
                socket.emit('markRead', { senderId: activeUserId });
            }
        }

        // Si le message n'est pas pour la conversation active OU si la fenêtre est en arrière-plan
        if (!isForActiveChat || !isWindowFocused) {
            if (!isWindowFocused) ChatUtils.startTitleBlink();
            ChatUtils.showSystemNotification(`Nouveau message de ${data.senderName}`, {
                body: data.message.message.substring(0, 100),
                icon: '/img/logo.png' // Assurez-vous que ce fichier existe dans /public/img
            });
            ChatUtils.playNotificationSound();
            loadConversations();
        }
    });

    // Réception de la confirmation de lecture
    socket.on('messageRead', (data) => {
        // Si la personne qui a lu est celle avec qui nous discutons activement
        if (data.readerId == activeUserId) {
            const sentStatuses = messageContainerEl.querySelectorAll('.message-status[data-status="sent"]');
            sentStatuses.forEach(statusEl => {
                statusEl.dataset.status = 'read';
            });
        }
    });

    // Mise à jour du badge de chat global dans la navbar
    socket.on('unreadChatUpdate', (data) => {
        const chatBadge = document.getElementById('chat-badge');
        if (chatBadge) {
            chatBadge.textContent = data.count;
            if (data.count > 0) {
                chatBadge.style.display = 'flex';
            } else {
                chatBadge.style.display = 'none';
            }
        }
        // Recharger la liste des conversations pour mettre à jour les badges individuels
        loadConversations();
    });

    // Réception de l'indicateur de saisie
    socket.on('userTyping', (data) => {
        if (data.userId == activeUserId) {
            typingIndicatorEl.textContent = `${data.userName} est en train d'écrire...`;
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                typingIndicatorEl.textContent = '';
            }, 3000); // Masquer après 3 secondes d'inactivité
        }
    });

    // --- Initialisation ---
    loadConversations();

    // Demander la permission pour les notifications au chargement
    if ('Notification' in window && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }

    // Gérer la sélection d'un nouvel utilisateur depuis la modale
    document.getElementById('new-chat-modal')?.addEventListener('click', (e) => {
        const userLink = e.target.closest('.new-chat-user');
        if (userLink) {
            e.preventDefault();
            const newUserId = userLink.dataset.userId;
            const newUserName = userLink.dataset.userName;
            
            // Fermer la modale manuellement si elle est ouverte
            const modal = bootstrap.Modal.getInstance(document.getElementById('new-chat-modal'));
            modal?.hide();

            openChatWindow(newUserId, newUserName);
        }
    });
});