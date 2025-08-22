import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StorageMonitorService } from '../../core/services/storage-monitor.service';
import { BackupService } from '../../core/services/backup.service';
import { ChromePersistenceService } from '../../core/services/chrome-persistence.service';

@Component({
  selector: 'app-storage-status',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="storage-status">
      @if (storageMonitor.storage()) {
        <div class="storage-indicator" 
             [class.warning]="storageMonitor.storageWarning()"
             [class.critical]="storageMonitor.storageCritical()"
             (click)="showDetails = !showDetails">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z"/>
          </svg>
          <span class="storage-text">
            {{ storageMonitor.storage()!.percentage.toFixed(0) }}%
          </span>
          @if (!storageMonitor.persistent()) {
            <span class="persist-warning" title="Storage not persistent">⚠️</span>
          }
        </div>

        @if (showDetails) {
          <div class="storage-dropdown">
            <div class="storage-details">
              <h4>Storage Status</h4>
              
              <div class="storage-bar">
                <div class="storage-used" 
                     [style.width.%]="storageMonitor.storage()!.percentage">
                </div>
              </div>
              
              <div class="storage-info">
                <p>Used: {{ storageMonitor.storage()!.usageFormatted }}</p>
                <p>Total: {{ storageMonitor.storage()!.quotaFormatted }}</p>
                <p>Status: 
                  @if (storageMonitor.persistent()) {
                    <span class="status-ok">✅ Persistent</span>
                  } @else {
                    <span class="status-warning">⚠️ Not Persistent</span>
                  }
                </p>
              </div>

              @if (!storageMonitor.persistent()) {
                <button class="btn-persist" (click)="requestPersistence()">
                  Enable Persistent Storage
                </button>
              }

              <div class="backup-actions">
                <h5>Data Backup</h5>
                <button class="btn-backup" (click)="downloadBackup()">
                  📥 Download Backup
                </button>
                <button class="btn-restore" (click)="triggerRestore()">
                  📤 Restore Backup
                </button>
                <input #fileInput 
                       type="file" 
                       accept=".json"
                       style="display: none"
                       (change)="onFileSelected($event)">
              </div>

              @if (backupStats()) {
                <div class="backup-stats">
                  <p>{{ backupStats()!.transactionsCount }} transactions</p>
                  <p>{{ backupStats()!.accountsCount }} accounts</p>
                  <p>{{ backupStats()!.importsCount }} imports</p>
                </div>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .storage-status {
      position: relative;
      z-index: 9999;
    }

    .storage-indicator {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 12px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.1);
      cursor: pointer;
      transition: all 0.2s;
    }

    .storage-indicator:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .storage-indicator.warning {
      background: rgba(255, 193, 7, 0.2);
      color: #ffc107;
    }

    .storage-indicator.critical {
      background: rgba(244, 67, 54, 0.2);
      color: #f44336;
    }

    .storage-text {
      font-size: 12px;
      font-weight: 500;
    }

    .persist-warning {
      font-size: 12px;
    }

    .storage-dropdown {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 8px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      padding: 16px;
      min-width: 280px;
      z-index: 10000;
    }

    .storage-details h4 {
      margin: 0 0 12px 0;
      font-size: 14px;
      font-weight: 600;
    }

    .storage-details h5 {
      margin: 16px 0 8px 0;
      font-size: 13px;
      font-weight: 600;
    }

    .storage-bar {
      width: 100%;
      height: 8px;
      background: #e0e0e0;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 12px;
    }

    .storage-used {
      height: 100%;
      background: linear-gradient(90deg, #4caf50, #8bc34a);
      transition: width 0.3s;
    }

    .storage-indicator.warning .storage-used {
      background: linear-gradient(90deg, #ff9800, #ffc107);
    }

    .storage-indicator.critical .storage-used {
      background: linear-gradient(90deg, #f44336, #ff5722);
    }

    .storage-info {
      font-size: 12px;
      color: #666;
      margin-bottom: 12px;
    }

    .storage-info p {
      margin: 4px 0;
    }

    .status-ok {
      color: #4caf50;
    }

    .status-warning {
      color: #ff9800;
    }

    .btn-persist, .btn-backup, .btn-restore {
      width: 100%;
      padding: 8px;
      margin: 4px 0;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-persist {
      background: #2196f3;
      color: white;
    }

    .btn-persist:hover {
      background: #1976d2;
    }

    .btn-backup {
      background: #4caf50;
      color: white;
    }

    .btn-backup:hover {
      background: #388e3c;
    }

    .btn-restore {
      background: #ff9800;
      color: white;
    }

    .btn-restore:hover {
      background: #f57c00;
    }

    .backup-actions {
      border-top: 1px solid #e0e0e0;
      padding-top: 12px;
      margin-top: 12px;
    }

    .backup-stats {
      font-size: 11px;
      color: #999;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #e0e0e0;
    }

    .backup-stats p {
      margin: 2px 0;
    }
  `]
})
export class StorageStatusComponent implements OnInit {
  protected storageMonitor = inject(StorageMonitorService);
  private backupService = inject(BackupService);
  private chromePersistence = inject(ChromePersistenceService);
  
  protected showDetails = false;
  protected backupStats = signal<any>(null);

  async ngOnInit() {
    await this.storageMonitor.checkStorageStatus();
    this.loadBackupStats();
    
    // Check Chrome-specific status
    const chromeStatus = await this.chromePersistence.checkChromeEngagement();
    if (chromeStatus.isChrome && !chromeStatus.canPersist) {
      console.log('Chrome persistence status:', chromeStatus);
    }
  }

  async requestPersistence() {
    // Try Chrome-specific approach first
    const chromeStatus = await this.chromePersistence.checkChromeEngagement();
    
    if (chromeStatus.isChrome) {
      console.log('Using Chrome-specific persistence approach...');
      const granted = await this.chromePersistence.forcePersistence();
      if (granted) {
        alert('✅ Persistent storage enabled! Your data is now protected from automatic cleanup.');
        await this.storageMonitor.checkStorageStatus();
        return;
      }
    }
    
    // Fallback to standard approach
    const granted = await this.storageMonitor.requestPersistence();
    if (granted) {
      alert('✅ Persistent storage enabled! Your data is now protected from automatic cleanup.');
    } else {
      const message = 'Your data is currently stored locally but may be cleared by the browser if storage space runs low.\n\nTo protect your data, please use the backup feature regularly to download your transactions.';
      alert(message);
    }
  }

  async downloadBackup() {
    try {
      await this.backupService.downloadBackup();
    } catch (error) {
      alert('Failed to download backup. Please try again.');
      console.error(error);
    }
  }

  triggerRestore() {
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fileInput?.click();
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (file) {
      if (confirm('This will replace all existing data. Are you sure?')) {
        try {
          await this.backupService.uploadAndRestore(file);
          alert('✅ Backup restored successfully!');
          window.location.reload(); // Reload to show new data
        } catch (error) {
          alert('Failed to restore backup. Please check the file format.');
          console.error(error);
        }
      }
    }
  }

  private async loadBackupStats() {
    try {
      const stats = await this.backupService.getBackupStats();
      this.backupStats.set(stats);
    } catch (error) {
      console.error('Failed to load backup stats:', error);
    }
  }
}