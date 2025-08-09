// account-picker.component.ts
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AccountService } from '../../core/services/account.service';
import { Account } from '../../core/models/db';

@Component({
  selector: 'app-account-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './account-picker-component.html',
  styleUrls: ['./account-picker-component.scss']
})
export class AccountPickerComponent {
  showCreateForm = signal(false);
  isCreating = signal(false);
  errors = signal<{name?: string; bankName?: string}>({});

  newAccount = {
    name: '',
    bankName: '',
    accountType: 'savings' as 'savings' | 'current' | 'credit',
    accountNumber: '',
    isActive: true
  };

  constructor(public accountService: AccountService) {}

  onAccountChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const accountId = select.value ? parseInt(select.value) : null;
    this.accountService.selectAccount(accountId);
  }

  async createAccount(): Promise<void> {
    // Validate
    const errors: {name?: string; bankName?: string} = {};

    if (!this.newAccount.name.trim()) {
      errors.name = 'Account name is required';
    }

    if (!this.newAccount.bankName) {
      errors.bankName = 'Please select a bank';
    }

    if (Object.keys(errors).length > 0) {
      this.errors.set(errors);
      return;
    }

    this.isCreating.set(true);
    this.errors.set({});

    try {
      await this.accountService.createAccount({
        name: this.newAccount.name.trim(),
        bankName: this.newAccount.bankName,
        accountType: this.newAccount.accountType,
        accountNumber: this.newAccount.accountNumber || undefined,
        isActive: true
      });

      // Reset form
      this.resetForm();
      this.showCreateForm.set(false);
    } catch (error) {
      console.error('Failed to create account:', error);
      this.errors.set({ name: 'Failed to create account. Please try again.' });
    } finally {
      this.isCreating.set(false);
    }
  }

  cancelCreate(): void {
    this.resetForm();
    this.showCreateForm.set(false);
  }

  private resetForm(): void {
    this.newAccount = {
      name: '',
      bankName: '',
      accountType: 'savings',
      accountNumber: '',
      isActive: true
    };
    this.errors.set({});
  }
}
