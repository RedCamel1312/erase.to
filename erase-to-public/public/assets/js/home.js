/**
 * home.js
 * Nur Startseiten-Interaktionen (index.php).
 * z.B. sanfte Navigation ("How it works")
 */
document.addEventListener('DOMContentLoaded', () => {
    // Smooth scroll for internal anchor links auf der Landingpage
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const target = document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
});
