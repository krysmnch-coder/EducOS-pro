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

document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // --- State ---
    let activeUserId = null;
    let typingTimeout = null;
    let onlineUserIds = new Set();
    const currentUserId = document.body.dataset.userId; // Assurez-vous que l'ID de l'utilisateur est disponible

    // --- DOM Selectors ---
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
            const conversations = await ChatLogic.fetchConversations();

            userListEl.innerHTML = ''; // Vider la liste
            if (conversations.length === 0) {
                userListEl.innerHTML = '<p class="p-3 text-muted text-center small">Aucune conversation récente.</p>';
                return;
            }

            conversations.forEach(convo => {
                const isOnline = onlineUserIds.has(convo.id.toString());
                const unreadCount = convo.unread_count > 0 ? `<span class="badge bg-danger rounded-pill ms-auto">${convo.unread_count}</span>` : '';

                // Logique d'affichage sécurisée pour le dernier message
                let lastMessageText = 'Pas de messages';
                if (convo.last_message) {
                    const safeMessage = ChatLogic.escapeHTML(convo.last_message);
                    lastMessageText = safeMessage.length > 25 ? safeMessage.substring(0, 25) + '...' : safeMessage;
                }

                const userItem = document.createElement('a');
                userItem.href = '#';
                userItem.className = 'list-group-item list-group-item-action d-flex align-items-center';
                userItem.dataset.userId = convo.id;
                userItem.innerHTML = `
                    <div class="avatar-container me-3 ${isOnline ? 'online' : ''}">
                        <img src="${ChatLogic.escapeHTML(convo.avatar_url || '/img/user.png')}" alt="${ChatLogic.escapeHTML(convo.name)}" class="list-avatar">
                    </div>
                    <div class="flex-grow-1">
                        ${ChatLogic.escapeHTML(convo.name)}
                        <div class="small text-muted">${lastMessageText}</div>
                    </div>
                    ${unreadCount}
                `;
                userListEl.appendChild(userItem);
            });
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('Error loading conversations: Request timed out.');
                userListEl.innerHTML = '<p class="p-3 text-danger text-center small">Le chargement des conversations a pris trop de temps.</p>';
            } else {
                console.error('Error loading conversations:', error);
                userListEl.innerHTML = '<p class="p-3 text-danger text-center small">Erreur de chargement des conversations.</p>';
            }
        }
    };

    /**
     * Charge et affiche les messages pour un utilisateur donné.
     * @param {string} userId - L'ID de l'autre utilisateur.
     */
    const loadMessages = async (userId) => {
        try {
            const messages = await ChatLogic.fetchMessages(userId);

            messageContainerEl.innerHTML = ''; // Vider les messages précédents
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

            // Marquer les messages comme lus sur le serveur
            socket.emit('markRead', { senderId: userId });

        } catch (error) {
            console.error(`Erreur lors du chargement/traitement des messages pour ${userId}:`, error);
            if (error.message.includes('Failed to fetch')) {
                messageContainerEl.innerHTML = '<p class="text-center text-danger">Impossible de charger les messages (Erreur réseau).</p>';
            } else {
                // Ceci se déclenchera si ChatUtils est indéfini, par exemple.
                messageContainerEl.innerHTML = '<p class="text-center text-danger">Une erreur est survenue lors de l\'affichage des messages.</p>';
            }
        }
    };

    /**
     * Ouvre une conversation spécifique.
     */
    const openChatWindow = async (userId, userName) => {
        // Si on clique sur la conversation déjà active, on ne fait rien.
        if (userId === activeUserId) return;

        activeUserId = userId;

        // 1. Afficher l'interface de chat et un état de chargement
        chatPlaceholder.style.display = 'none';
        chatWindow.style.display = 'flex';
        document.querySelector('.chat-page-container').classList.add('show-chat');
        messageContainerEl.innerHTML = '<div class="text-center p-5"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>';
        
        // 2. Mettre à jour l'en-tête immédiatement
        const isOnline = onlineUserIds.has(userId);
        chatHeaderTitle.innerHTML = `
            <div>
                ${ChatLogic.escapeHTML(userName)}
                <small class="d-block user-status ${isOnline ? 'online' : 'offline'}">
                    ${isOnline ? 'En ligne' : 'Hors ligne'}
                </small>
            </div>
        `;

        // 3. Charger les messages. Cette étape crée la conversation si elle n'existe pas.
        await loadMessages(activeUserId);
        ChatLogic.scrollToBottom(messageContainerEl);

        // 4. Recharger la liste des conversations pour qu'elle inclue la nouvelle conversation.
        await loadConversations();

        // 5. Mettre en surbrillance l'utilisateur actif dans la liste mise à jour.
        document.querySelectorAll('#user-list a').forEach(el => el.classList.remove('active'));
        const userLink = userListEl.querySelector(`a[data-user-id="${userId}"]`);
        if (userLink) {
            userLink.classList.add('active');
        }

        // 6. Activer le formulaire d'envoi
        messageInput.disabled = false;
        messageForm.querySelector('button').disabled = false;
        messageInput.focus();
    };

    const closeChatWindow = () => {
        activeUserId = null;
        document.querySelector('.chat-page-container').classList.remove('show-chat');
    };

    // --- Écouteurs d'événements ---

    // Clic sur un utilisateur dans la liste
    userListEl.addEventListener('click', (e) => {
        const userLink = e.target.closest('a.list-group-item');
        if (!userLink) return;
        e.preventDefault();
        const userName = userLink.querySelector('.flex-grow-1').textContent.trim().split('\n')[0];
        openChatWindow(userLink.dataset.userId, userName); // La fonction est async, mais on n'a pas besoin de l'attendre ici.
    });

    // Bouton retour pour la vue mobile
    if (backToListBtn) {
        backToListBtn.addEventListener('click', closeChatWindow);
    }

    // Envoi d'un message
    messageForm.addEventListener('submit', async (e) => {
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

        try {
            const sentMessage = await ChatLogic.sendMessage(socket, activeUserId, message);
            sentMessage.is_read = 0; // Un nouveau message n'est pas lu par défaut
            const messageEl = ChatLogic.renderMessage(sentMessage, currentUserId);
            ChatLogic.appendMessageToContainer(messageEl, messageContainerEl);
            ChatLogic.scrollToBottom(messageContainerEl);
            messageInput.value = '';
            messageInput.focus();
        } catch (error) {
            console.error('Failed to send message:', error);
            alert(`Erreur lors de l'envoi : ${error.message}`);
        } finally {
            // Réactiver le formulaire
            messageInput.disabled = false;
            sendButton.disabled = false;
            sendButton.innerHTML = originalButtonContent;
        }
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

            if (!lastMessageDate || !ChatLogic.isSameDay(newMessageDate, lastMessageDate)) {
                const separatorEl = ChatLogic.renderDateSeparator(newMessageDate);
                ChatLogic.appendMessageToContainer(separatorEl, messageContainerEl);
            }
            const messageEl = ChatLogic.renderMessage(data.message, data.senderId);
            ChatLogic.appendMessageToContainer(messageEl, messageContainerEl);
            ChatLogic.scrollToBottom(messageContainerEl);
            // Et on le marque comme lu si la fenêtre est visible
            if (isWindowFocused) {
                socket.emit('markRead', { senderId: activeUserId });
            }
        }

        if (!isForActiveChat || !isWindowFocused) {
            if (!isWindowFocused) ChatLogic.startTitleBlink();
            ChatLogic.showSystemNotification(`Nouveau message de ${data.senderName}`, {
                body: data.message.message.substring(0, 100),
                icon: '/img/logo.png' // Assurez-vous que ce fichier existe dans /public/img
            });
            ChatLogic.playNotificationSound();
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

            openChatWindow(newUserId, newUserName); // La fonction est async, mais on n'a pas besoin de l'attendre ici.
        }
    });
});