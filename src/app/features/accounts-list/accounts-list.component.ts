// accounts-list.component.ts
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AccountService } from '../../core/services/account.service';
import { ImportService } from '../../core/services/import.service';
import { AccountPickerComponent } from '../account-picker-component/account-picker-component';
import { Account } from '../../core/models/db';

interface AccountStats {
  totalImports: number;
  totalTransactions: number;
  lastImportDate: Date | null;
}

@Component({
  selector: 'app-accounts-list',
  standalone: true,
  imports: [CommonModule, AccountPickerComponent],
  templateUrl: './accounts-list.component.html',
  styleUrls: ['./accounts-list.component.scss']
})
export class AccountsListComponent {
  deleteConfirm = signal<Account | null>(null);
  accountStats: Record<number, AccountStats> = {};

  constructor(
    public accountService: AccountService,
    private importService: ImportService
  ) {
    this.loadAccountStats();
  }

  async loadAccountStats(): Promise<void> {
    for (const account of this.accountService.accounts()) {
      if (account.id) {
        const stats = await this.importService.getImportStats(account.id);
        this.accountStats[account.id] = stats;
      }
    }
  }

  formatAccountType(type: string): string {
    const types: Record<string, string> = {
      'savings': 'Savings Account',
      'current': 'Current Account',
      'credit': 'Credit Card'
    };
    return types[type] || type;
  }

  formatDate(date: Date): string {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;

    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  async toggleStatus(id: number): Promise<void> {
    await this.accountService.toggleAccountStatus(id);
    await this.loadAccountStats(); // Reload stats
  }

  confirmDelete(account: Account): void {
    this.deleteConfirm.set(account);
  }

  cancelDelete(): void {
    this.deleteConfirm.set(null);
  }

  async deleteAccount(): Promise<void> {
    const account = this.deleteConfirm();
    if (account && account.id) {
      await this.accountService.deleteAccount(account.id);
      delete this.accountStats[account.id];
      this.deleteConfirm.set(null);
    }
  }
}
