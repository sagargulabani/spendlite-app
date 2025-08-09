import { Injectable, signal, computed } from '@angular/core';
import { db, Account } from '../models/db';
import { liveQuery } from 'dexie';
import { from, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AccountService {
  // Signals for reactive state
  private accountsSignal = signal<Account[]>([]);
  private selectedAccountIdSignal = signal<number | null>(null);
  private loadingSignal = signal(false);
  private errorSignal = signal<string | null>(null);

  // Public computed signals
  accounts = this.accountsSignal.asReadonly();
  selectedAccountId = this.selectedAccountIdSignal.asReadonly();
  selectedAccount = computed(() => {
    const id = this.selectedAccountIdSignal();
    if (!id) return null;
    return this.accountsSignal().find(a => a.id === id) || null;
  });
  loading = this.loadingSignal.asReadonly();
  error = this.errorSignal.asReadonly();
  hasAccounts = computed(() => this.accountsSignal().length > 0);
  activeAccounts = computed(() =>
    this.accountsSignal().filter(a => a.isActive)
  );

  constructor() {
    this.initializeAccounts();
  }

  private async initializeAccounts(): Promise<void> {
    this.loadingSignal.set(true);
    try {
      // Subscribe to live changes
      liveQuery(() => db.accounts.toArray()).subscribe(
        accounts => {
          this.accountsSignal.set(accounts);

          // Auto-select if only one account exists
          if (accounts.length === 1 && !this.selectedAccountIdSignal()) {
            this.selectedAccountIdSignal.set(accounts[0].id!);
          }
        }
      );

      // Load initial data
      const accounts = await db.accounts.toArray();
      this.accountsSignal.set(accounts);

      // Restore last selected account from localStorage
      const lastSelectedId = localStorage.getItem('lastSelectedAccountId');
      if (lastSelectedId) {
        const id = parseInt(lastSelectedId);
        if (accounts.some(a => a.id === id)) {
          this.selectedAccountIdSignal.set(id);
        }
      }
    } catch (error) {
      this.errorSignal.set('Failed to load accounts');
      console.error('Error loading accounts:', error);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async createAccount(account: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
    try {
      const newAccount: Account = {
        ...account,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const id = await db.accounts.add(newAccount);

      // Auto-select the new account
      this.selectAccount(id as number);

      return id as number;
    } catch (error) {
      this.errorSignal.set('Failed to create account');
      throw error;
    }
  }

  async updateAccount(id: number, updates: Partial<Account>): Promise<void> {
    try {
      await db.accounts.update(id, {
        ...updates,
        updatedAt: new Date()
      });
    } catch (error) {
      this.errorSignal.set('Failed to update account');
      throw error;
    }
  }

  async deleteAccount(id: number): Promise<void> {
    try {
      // Check if this is the selected account
      if (this.selectedAccountIdSignal() === id) {
        this.selectedAccountIdSignal.set(null);
        localStorage.removeItem('lastSelectedAccountId');
      }

      // Delete the account and related data
      await db.transaction('rw', db.accounts, db.imports, db.transactions, async () => {
        await db.transactions.where('accountId').equals(id).delete();
        await db.imports.where('accountId').equals(id).delete();
        await db.accounts.delete(id);
      });
    } catch (error) {
      this.errorSignal.set('Failed to delete account');
      throw error;
    }
  }

  selectAccount(id: number | null): void {
    this.selectedAccountIdSignal.set(id);

    // Persist selection
    if (id) {
      localStorage.setItem('lastSelectedAccountId', id.toString());
    } else {
      localStorage.removeItem('lastSelectedAccountId');
    }
  }

  async getAccount(id: number): Promise<Account | undefined> {
    return await db.accounts.get(id);
  }

  async toggleAccountStatus(id: number): Promise<void> {
    const account = await db.accounts.get(id);
    if (account) {
      await this.updateAccount(id, { isActive: !account.isActive });
    }
  }
}
