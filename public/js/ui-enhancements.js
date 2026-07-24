document.addEventListener('DOMContentLoaded', () => {
  /**
   * Gère les indicateurs de défilement pour la barre de navigation
   * lorsque son contenu déborde.
   */
  const handleNavbarScroll = () => {
    const scrollContainer = document.getElementById('navbar-scroll-container');
    if (!scrollContainer) return;

    const checkScroll = () => {
      // Vérifie si on peut défiler à gauche
      const canScrollLeft = scrollContainer.scrollLeft > 0;
      // Vérifie si on peut défiler à droite
      const canScrollRight = scrollContainer.scrollWidth > scrollContainer.clientWidth &&
                             scrollContainer.scrollLeft < (scrollContainer.scrollWidth - scrollContainer.clientWidth - 1); // -1 pour la précision

      if (canScrollLeft) {
        scrollContainer.classList.add('is-scrollable-start');
      } else {
        scrollContainer.classList.remove('is-scrollable-start');
      }

      if (canScrollRight) {
        scrollContainer.classList.add('is-scrollable-end');
      } else {
        scrollContainer.classList.remove('is-scrollable-end');
      }
    };

    // Écoute les événements de défilement et de redimensionnement
    scrollContainer.addEventListener('scroll', checkScroll);
    window.addEventListener('resize', checkScroll);

    // Vérification initiale au chargement
    checkScroll();
  };

  // Initialiser les améliorations de l'interface
  handleNavbarScroll();
});