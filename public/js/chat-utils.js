(() => {
	'use strict';

	const apiRequest = async (url, options) => {
		const response = await fetch(url, options);
		const data = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(data.error || 'La requête du chat a échoué.');
		return data;
	};

	const normalizeMessage = message => ({
		id: message.id,
		senderId: String(message.sender_id ?? message.senderId ?? ''),
		content: message.message ?? message.content ?? '',
		timestamp: message.created_at ?? message.timestamp ?? new Date().toISOString(),
		isRead: Boolean(message.is_read ?? message.isRead)
	});

	window.ChatLogic = {
		fetchConversations() {
			return apiRequest('/chat/api/conversations').then(data =>
				(Array.isArray(data) ? data : data.conversations || []).map(conversation => ({
					id: String(conversation.id),
					name: conversation.name || 'Utilisateur',
					avatar_url: conversation.avatar_url || '/img/user.png',
					last_message: conversation.last_message || '',
					last_activity: conversation.last_activity || null,
					unread_count: Number(conversation.unread_count) || 0
				}))
			);
		},

		fetchMessages(userId) {
			return apiRequest(`/chat/api/messages/${encodeURIComponent(userId)}`).then(data =>
				(Array.isArray(data) ? data : data.messages || []).map(normalizeMessage)
			);
		},

		sendMessage(socket, receiverId, message) {
			return new Promise((resolve, reject) => {
				if (!socket) {
					reject(new Error('La connexion au chat est indisponible.'));
					return;
				}

				const emitMessage = () => socket.emit('sendMessage', { receiverId, message }, response => {
					if (!response || !response.success) {
						reject(new Error(response?.error || 'Impossible d’envoyer le message.'));
						return;
					}
					resolve(normalizeMessage(response.message));
				});

				if (socket.connected) {
					emitMessage();
					return;
				}

				const timeout = window.setTimeout(() => {
					socket.off('connect', onConnect);
					reject(new Error('Connexion au chat indisponible. Réessayez dans un instant.'));
				}, 5000);
				const onConnect = () => {
					window.clearTimeout(timeout);
					emitMessage();
				};
				socket.once('connect', onConnect);
				if (!socket.active) socket.connect();
			});
		},

		escapeHTML(value) {
			const element = document.createElement('div');
			element.textContent = value == null ? '' : String(value);
			return element.innerHTML;
		},

		isSameDay(firstDate, secondDate) {
			return firstDate.toDateString() === secondDate.toDateString();
		},

		renderDateSeparator(date) {
			const separator = document.createElement('div');
			separator.className = 'chat-date-separator';
			separator.textContent = date.toLocaleDateString('fr-FR', {
				weekday: 'long', day: 'numeric', month: 'long'
			});
			return separator;
		},

		renderMessage(message, currentUserId) {
			const normalized = normalizeMessage(message);
			const wrapper = document.createElement('div');
			const isSent = normalized.senderId === String(currentUserId);
			wrapper.className = `message-wrapper chat-message ${isSent ? 'message-sent' : 'message-received'}`;
			wrapper.dataset.timestamp = normalized.timestamp;
			wrapper.innerHTML = `
				<div class="message-bubble">
					<div class="message-content">${this.escapeHTML(normalized.content)}</div>
					<div class="message-time">${new Date(normalized.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
				</div>`;
			return wrapper;
		},

		appendMessageToContainer(element, container) {
			if (element && container) container.appendChild(element);
		},

		scrollToBottom(container) {
			if (container) container.scrollTop = container.scrollHeight;
		},

		startTitleBlink() {
			document.title = 'Nouveau message | EducOS-pro';
			window.setTimeout(() => { document.title = 'EducOS-pro'; }, 3000);
		},

		showSystemNotification(title, options, onClick) {
			if (!('Notification' in window)) return;
			const show = () => {
				const notification = new Notification(title, options);
				if (onClick) notification.onclick = onClick;
			};
			if (Notification.permission === 'granted') show();
			else if (Notification.permission !== 'denied') Notification.requestPermission().then(permission => {
				if (permission === 'granted') show();
			});
		},

		playNotificationSound() {}
	};
})();
