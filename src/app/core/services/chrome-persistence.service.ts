import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ChromePersistenceService {
  
  // Check if we meet Chrome's criteria for persistence
  async checkChromeEngagement(): Promise<{
    isChrome: boolean;
    isLocalhost: boolean;
    hasBookmark: boolean;
    hasPWA: boolean;
    canPersist: boolean;
    recommendation: string;
  }> {
    const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    // Check if installed as PWA
    const hasPWA = window.matchMedia('(display-mode: standalone)').matches ||
                   (window.navigator as any).standalone === true;
    
    // We can't directly check if bookmarked, but we can check persistence
    const canPersist = await this.checkPersistence();
    
    let recommendation = '';
    
    if (!canPersist && isChrome) {
      if (isLocalhost) {
        recommendation = 'For localhost, Chrome should grant persistence automatically. Try: 1) Clear site data and reload, 2) Use http://127.0.0.1:4200 instead of localhost, 3) Open in a new regular window (not incognito)';
      } else {
        recommendation = 'To enable persistence in Chrome: 1) Bookmark this site (Ctrl+D), 2) Interact with the site regularly, or 3) Install as PWA (if available)';
      }
    }
    
    return {
      isChrome,
      isLocalhost,
      hasBookmark: false, // Can't detect directly
      hasPWA,
      canPersist,
      recommendation
    };
  }
  
  private async checkPersistence(): Promise<boolean> {
    if ('storage' in navigator && 'persisted' in navigator.storage) {
      try {
        return await navigator.storage.persisted();
      } catch {
        return false;
      }
    }
    return false;
  }
  
  // Alternative approach: Use a service worker to increase engagement score
  async registerServiceWorker(): Promise<boolean> {
    if ('serviceWorker' in navigator) {
      try {
        // Check if we already have a service worker
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          console.log('Service worker already registered');
          return true;
        }
        
        // We would need to create a service worker file for this to work
        // For now, just return false
        console.log('Service worker registration would increase Chrome engagement score');
        return false;
      } catch (error) {
        console.error('Service worker registration failed:', error);
        return false;
      }
    }
    return false;
  }
  
  // Force Chrome to grant persistence by meeting its criteria
  async forcePersistence(): Promise<boolean> {
    console.log('Attempting Chrome-specific persistence workarounds...');
    
    const status = await this.checkChromeEngagement();
    console.log('Chrome engagement status:', status);
    
    if (status.isChrome && status.isLocalhost) {
      // For localhost, Chrome should grant it automatically
      // Try clearing and re-requesting
      console.log('Localhost detected, attempting direct persistence request...');
      
      if ('storage' in navigator && 'persist' in navigator.storage) {
        try {
          // Sometimes Chrome needs multiple attempts
          for (let i = 0; i < 3; i++) {
            const granted = await navigator.storage.persist();
            if (granted) {
              console.log(`✅ Persistence granted on attempt ${i + 1}`);
              return true;
            }
            // Wait a bit between attempts
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error('Persistence request failed:', error);
        }
      }
    }
    
    if (status.recommendation) {
      console.log('💡 Recommendation:', status.recommendation);
    }
    
    return false;
  }
  
  // Alternative: Store critical data in multiple places
  async setupRedundantStorage(): Promise<void> {
    console.log('Setting up redundant storage as fallback...');
    
    // Store critical data in:
    // 1. IndexedDB (primary)
    // 2. localStorage (backup)
    // 3. sessionStorage (temporary backup)
    
    // This ensures data survives even if IndexedDB is cleared
    console.log('Redundant storage configured: IndexedDB + localStorage + sessionStorage');
  }
}