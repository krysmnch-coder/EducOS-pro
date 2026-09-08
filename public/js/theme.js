(function() {
    'use strict';

    const storageKey = 'theme';
    const validThemes = ['light', 'dark'];

    function getStoredTheme() {
        try {
            const storedTheme = localStorage.getItem(storageKey);
            return validThemes.includes(storedTheme) ? storedTheme : null;
        } catch (error) {
            return null;
        }
    }

    function getInitialTheme() {
        // Clair par défaut ; le choix enregistré par l'utilisateur reste prioritaire.
        return getStoredTheme() || 'light';
    }

    function applyTheme(theme, persist = false) {
        const normalizedTheme = validThemes.includes(theme) ? theme : 'light';
        const root = document.documentElement;

        root.setAttribute('data-theme', normalizedTheme);
        root.setAttribute('data-bs-theme', normalizedTheme);
        document.body?.classList.toggle('dark-mode', normalizedTheme === 'dark');

        document.querySelectorAll('[data-theme-toggle], #themeToggle, #theme-toggle-btn').forEach(button => {
            button.setAttribute('aria-pressed', String(normalizedTheme === 'dark'));
            button.setAttribute('aria-label', normalizedTheme === 'dark' ? 'Activer le thème clair' : 'Activer le thème sombre');
            button.setAttribute('title', normalizedTheme === 'dark' ? 'Activer le thème clair' : 'Activer le thème sombre');
        });

        if (persist) {
            try {
                localStorage.setItem(storageKey, normalizedTheme);
            } catch (error) {
                // Le thème reste fonctionnel même si le stockage est indisponible.
            }
        }
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || getInitialTheme();
        applyTheme(currentTheme === 'dark' ? 'light' : 'dark', true);
    }

    applyTheme(getInitialTheme());

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-theme-toggle], #themeToggle, #theme-toggle-btn').forEach(button => {
            if (button.dataset.themeBound === 'true') return;
            button.dataset.themeBound = 'true';
            button.addEventListener('click', event => {
                event.preventDefault();
                toggleTheme();
            });
        });
        applyTheme(document.documentElement.getAttribute('data-theme') || getInitialTheme());
    });

    window.addEventListener('storage', event => {
        if (event.key === storageKey) applyTheme(event.newValue || getInitialTheme());
    });
})();