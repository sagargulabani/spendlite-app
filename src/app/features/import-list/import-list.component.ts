// imports-list.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ImportService } from '../../core/services/import.service';
import { AccountService } from '../../core/services/account.service';
import { TransactionService } from '../../core/services/transaction.service';
import { ImportRecord, Account } from '../../core/models/db';

interface ImportWithAccount extends ImportRecord {
  accountName?: string;
}

@Component({
  selector: 'app-imports-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './import-list.component.html',
  styleUrls: ['./import-list.component.scss']
})
export class ImportsListComponent implements OnInit {
  imports = signal<ImportWithAccount[]>([]);
  isLoading = signal(true);

  // Edit states
  editingNameId = signal<number | null>(null);
  editingName = signal('');

  editingAccountId = signal<number | null>(null);
  selectedNewAccountId = signal<number | null>(null);

  // Delete confirmation
  deleteConfirmId = signal<number | null>(null);
  isDeleting = signal(false);

  // Filters
  filterAccountId = signal<number | null>(null);
  searchQuery = signal('');

  constructor(
    private importService: ImportService,
    public accountService: AccountService,
    private transactionService: TransactionService
  ) {}

  async ngOnInit() {
    await this.loadImports();
  }

  async loadImports() {
    this.isLoading.set(true);

    try {
      const imports = await this.importService.getAllImports();

      // Enrich with account names
      const enrichedImports: ImportWithAccount[] = [];
      for (const imp of imports) {
        const account = await this.accountService.getAccount(imp.accountId);
        enrichedImports.push({
          ...imp,
          accountName: account?.name
        });
      }

      this.imports.set(enrichedImports);
    } catch (error) {
      console.error('Error loading imports:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  // Filtering
  get filteredImports(): ImportWithAccount[] {
    let filtered = this.imports();

    // Filter by account
    if (this.filterAccountId()) {
      filtered = filtered.filter(imp => imp.accountId === this.filterAccountId());
    }

    // Filter by search query
    const query = this.searchQuery().toLowerCase();
    if (query) {
      filtered = filtered.filter(imp =>
        (imp.displayName?.toLowerCase().includes(query)) ||
        imp.fileName.toLowerCase().includes(query) ||
        imp.accountName?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }

  // Edit display name
  startEditName(imp: ImportWithAccount) {
    this.editingNameId.set(imp.id!);
    this.editingName.set(imp.displayName || imp.fileName);
  }

  async saveName() {
    const id = this.editingNameId();
    if (!id) return;

    try {
      await this.importService.updateImportDisplayName(id, this.editingName());
      await this.loadImports();
      this.cancelEditName();
    } catch (error) {
      console.error('Error updating import name:', error);
    }
  }

  cancelEditName() {
    this.editingNameId.set(null);
    this.editingName.set('');
  }

  // Edit account
  startEditAccount(imp: ImportWithAccount) {
    this.editingAccountId.set(imp.id!);
    this.selectedNewAccountId.set(imp.accountId);
  }

  async saveAccount() {
    const importId = this.editingAccountId();
    const newAccountId = this.selectedNewAccountId();

    if (!importId || !newAccountId) return;

    try {
      // Update import record
      await this.importService.updateImportAccount(importId, newAccountId);

      // Update all related transactions
      await this.transactionService.updateTransactionsAccount(importId, newAccountId);

      await this.loadImports();
      this.cancelEditAccount();
    } catch (error) {
      console.error('Error updating import account:', error);
    }
  }

  cancelEditAccount() {
    this.editingAccountId.set(null);
    this.selectedNewAccountId.set(null);
  }

  // Delete import
  confirmDelete(imp: ImportWithAccount) {
    this.deleteConfirmId.set(imp.id!);
  }

  async deleteImport() {
    const id = this.deleteConfirmId();
    if (!id) return;

    this.isDeleting.set(true);

    try {
      await this.importService.deleteImport(id);
      await this.loadImports();
      this.cancelDelete();
    } catch (error) {
      console.error('Error deleting import:', error);
    } finally {
      this.isDeleting.set(false);
    }
  }

  cancelDelete() {
    this.deleteConfirmId.set(null);
  }

  // Formatting helpers
  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  getImportForDelete(): ImportWithAccount | undefined {
    const id = this.deleteConfirmId();
    if (!id) return undefined;
    return this.imports().find(imp => imp.id === id);
  }
}
