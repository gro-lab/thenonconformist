// ============================================
// GDPR COOKIE CONSENT MANAGEMENT
// Add this to a NEW FILE: cookie-consent.js
// OR add to the TOP of your script.js (BEFORE Firebase initialization)
// ============================================

// Cookie Consent Manager
const CookieConsent = {
    STORAGE_KEY: 'cookie-consent',
    CONSENT_TYPES: {
        ESSENTIAL: 'essential',
        ANALYTICS: 'analytics'
    },
    
    // Check if user has made a choice
    hasConsent() {
        return localStorage.getItem(this.STORAGE_KEY) !== null;
    },
    
    // Get consent preferences
    getConsent() {
        const consent = localStorage.getItem(this.STORAGE_KEY);
        if (!consent) return null;
        
        try {
            return JSON.parse(consent);
        } catch {
            return null;
        }
    },
    
    // Set consent preferences
    setConsent(preferences) {
        const consent = {
            essential: true, // Always true
            analytics: preferences.analytics || false,
            timestamp: new Date().toISOString(),
            version: '1.0'
        };
        
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(consent));
        return consent;
    },
    
    // Check if specific consent type is granted
    isGranted(type) {
        const consent = this.getConsent();
        if (!consent) return false;
        return consent[type] === true;
    },
    
    // Clear consent (for testing or user request)
    clearConsent() {
        localStorage.removeItem(this.STORAGE_KEY);
    }
};

// Show cookie banner on first visit
function initCookieBanner() {
    const banner = document.getElementById('cookie-banner');
    const settingsModal = document.getElementById('cookie-settings-modal');
    
    if (!banner) return;
    
    // Show banner if no consent exists
    if (!CookieConsent.hasConsent()) {
        banner.removeAttribute('hidden');
    }
    
    // Accept All button
    document.getElementById('cookie-accept')?.addEventListener('click', () => {
        CookieConsent.setConsent({ analytics: true });
        banner.setAttribute('hidden', '');
        
        // Initialize analytics if accepted
        initializeAnalytics();
        
        // Show success message (optional)
        showConsentMessage('✓ Cookie preferences saved');
    });
    
    // Reject Analytics button
    document.getElementById('cookie-reject')?.addEventListener('click', () => {
        CookieConsent.setConsent({ analytics: false });
        banner.setAttribute('hidden', '');
        
        // Show success message (optional)
        showConsentMessage('✓ Only essential cookies will be used');
    });
    
    // Settings button
    document.getElementById('cookie-settings')?.addEventListener('click', () => {
        banner.setAttribute('hidden', '');
        openCookieSettings();
    });
    
    // Learn more link
    document.getElementById('cookie-learn-more')?.addEventListener('click', (e) => {
        e.preventDefault();
        banner.setAttribute('hidden', '');
        document.getElementById('terms-btn')?.click();
    });
}

// Cookie Settings Modal
function openCookieSettings() {
    const modal = document.getElementById('cookie-settings-modal');
    if (!modal) return;
    
    // Pre-populate settings
    const consent = CookieConsent.getConsent();
    const analyticsCheckbox = document.getElementById('cookie-analytics');
    
    if (analyticsCheckbox && consent) {
        analyticsCheckbox.checked = consent.analytics;
    }
    
    modal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
}

function closeCookieSettings() {
    const modal = document.getElementById('cookie-settings-modal');
    if (!modal) return;
    
    modal.setAttribute('hidden', '');
    document.body.style.overflow = 'auto';
}

// Initialize cookie settings modal handlers
function initCookieSettingsModal() {
    const modal = document.getElementById('cookie-settings-modal');
    if (!modal) return;
    
    // Close button
    modal.querySelector('.modal-close')?.addEventListener('click', closeCookieSettings);
    
    // Click outside to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeCookieSettings();
        }
    });
    
    // Save settings button
    document.getElementById('cookie-save-settings')?.addEventListener('click', () => {
        const analyticsCheckbox = document.getElementById('cookie-analytics');
        
        CookieConsent.setConsent({
            analytics: analyticsCheckbox?.checked || false
        });
        
        closeCookieSettings();
        
        // Initialize or disable analytics based on choice
        if (analyticsCheckbox?.checked) {
            initializeAnalytics();
            showConsentMessage('✓ Analytics enabled');
        } else {
            showConsentMessage('✓ Analytics disabled');
        }
    });
    
    // Cancel button
    document.getElementById('cookie-cancel-settings')?.addEventListener('click', () => {
        closeCookieSettings();
        
        // Show banner again if no consent exists
        if (!CookieConsent.hasConsent()) {
            document.getElementById('cookie-banner')?.removeAttribute('hidden');
        }
    });
}

// Optional: Show toast message
function showConsentMessage(message) {
    const toast = document.createElement('div');
    toast.className = 'cookie-toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 2rem;
        left: 50%;
        transform: translateX(-50%);
        background: var(--text-primary);
        color: white;
        padding: 1rem 2rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideUp 0.3s ease-out;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        toast.style.transition = 'all 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Optional: Floating cookie settings button (for users who already consented)
function createCookieManageButton() {
    if (!CookieConsent.hasConsent()) return;
    
    const btn = document.createElement('button');
    btn.id = 'cookie-manage-floating';
    btn.className = 'cookie-manage-btn';
    btn.innerHTML = '<i class="fas fa-cookie-bite"></i>';
    btn.title = 'Manage Cookie Preferences';
    btn.setAttribute('aria-label', 'Manage Cookie Preferences');
    
    btn.addEventListener('click', openCookieSettings);
    
    document.body.appendChild(btn);
}

// ============================================
// CONDITIONAL FIREBASE ANALYTICS INITIALIZATION
// Replace your existing Firebase initialization with this:
// ============================================

let analytics = null;

function initializeAnalytics() {
    // Only initialize if user has consented AND analytics hasn't been initialized yet
    if (CookieConsent.isGranted('analytics') && !analytics) {
        import('https://www.gstatic.com/firebasejs/12.8.0/firebase-analytics.js')
            .then(({ getAnalytics }) => {
                analytics = getAnalytics(app);
                console.log('✓ Analytics initialized with user consent');
            })
            .catch(err => {
                console.warn('Failed to initialize analytics:', err);
            });
    }
}

// ============================================
// INITIALIZATION
// Call this when DOM is ready
// ============================================

function initCookieConsent() {
    initCookieBanner();
    initCookieSettingsModal();
    
    // If user has already consented to analytics, initialize it
    if (CookieConsent.isGranted('analytics')) {
        initializeAnalytics();
    }
    
    // Optional: Show floating cookie settings button
    // createCookieManageButton();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCookieConsent);
} else {
    initCookieConsent();
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CookieConsent, initializeAnalytics };
}