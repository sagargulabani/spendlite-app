// app.ts
import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { initializeDatabase, requestPersistenceOnInteraction } from './core/models/db';
import { StorageStatusComponent } from './components/storage-status/storage-status.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, StorageStatusComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  protected title = 'SpendLite Dashboard';
  private persistenceRequested = false;

  async ngOnInit() {
    try {
      await initializeDatabase();
    } catch (error) {
      console.error('Failed to initialize database:', error);
      // App can still work, but storage might not be persistent
    }
  }

  @HostListener('click')
  @HostListener('keydown')
  async onUserInteraction() {
    if (!this.persistenceRequested) {
      this.persistenceRequested = true;
      const granted = await requestPersistenceOnInteraction();
      if (granted) {
        console.log('✅ Persistent storage granted after user interaction');
      }
    }
  }
}
