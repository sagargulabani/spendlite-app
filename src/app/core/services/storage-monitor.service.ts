import { Injectable, signal, computed } from '@angular/core';
import { getStorageEstimate, requestPersistentStorage } from '../models/db';

export interface StorageInfo {
  usage: number;
  quota: number;
  percentage: number;
  usageFormatted: string;
  quotaFormatted: string;
  isPersistent: boolean;
  isWarning: boolean;
  isCritical: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class StorageMonitorService {
  private storageInfo = signal<StorageInfo | null>(null);
  private isPersistent = signal<boolean>(false);

  readonly storage = this.storageInfo.asReadonly();
  readonly persistent = this.isPersistent.asReadonly();
  
  readonly storageWarning = computed(() => {
    const info = this.storageInfo();
    return info ? info.isWarning : false;
  });

  readonly storageCritical = computed(() => {
    const info = this.storageInfo();
    return info ? info.isCritical : false;
  });

  constructor() {
    this.checkStorageStatus();
    // Check storage status periodically
    setInterval(() => this.checkStorageStatus(), 60000); // Every minute
  }

  async checkStorageStatus(): Promise<void> {
    const estimate = await getStorageEstimate();
    
    if (estimate) {
      const usageMB = estimate.usage / 1024 / 1024;
      const quotaMB = estimate.quota / 1024 / 1024;
      
      const info: StorageInfo = {
        usage: estimate.usage,
        quota: estimate.quota,
        percentage: estimate.percentage,
        usageFormatted: this.formatSize(estimate.usage),
        quotaFormatted: this.formatSize(estimate.quota),
        isPersistent: await this.checkPersistence(),
        isWarning: estimate.percentage > 70,
        isCritical: estimate.percentage > 90
      };
      
      this.storageInfo.set(info);
      
      if (info.isCritical) {
        console.error(`⚠️ CRITICAL: Storage usage at ${estimate.percentage.toFixed(1)}%`);
      } else if (info.isWarning) {
        console.warn(`⚠️ Storage usage at ${estimate.percentage.toFixed(1)}%`);
      }
    }
  }

  async checkPersistence(): Promise<boolean> {
    if ('storage' in navigator && 'persisted' in navigator.storage) {
      try {
        const isPersisted = await navigator.storage.persisted();
        this.isPersistent.set(isPersisted);
        return isPersisted;
      } catch (error) {
        console.error('Error checking persistence:', error);
        return false;
      }
    }
    return false;
  }

  async requestPersistence(): Promise<boolean> {
    const granted = await requestPersistentStorage();
    if (granted) {
      this.isPersistent.set(true);
      await this.checkStorageStatus(); // Refresh storage info
    }
    return granted;
  }

  private formatSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async clearOldData(daysOld: number = 90): Promise<void> {
    // This would be implemented to clear old transactions
    // For now, just log
    console.log(`Would clear data older than ${daysOld} days`);
  }
}