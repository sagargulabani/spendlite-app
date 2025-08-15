// components/category-management/category-management.component.ts
import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { db } from '../../core/models/db';
import { ROOT_CATEGORIES, RootCategory, SubCategory } from '../../core/models/category.model';

@Component({
  selector: 'app-category-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './category-management.component.html',
  styleUrls: ['./category-management.component.scss']
})
export class CategoryManagementComponent implements OnInit {
  rootCategories = ROOT_CATEGORIES;
  subCategories = signal<SubCategory[]>([]);
  selectedRoot = signal<RootCategory | null>(null);

  // Form state
  isCreating = signal(false);
  isEditing = signal<number | null>(null);
  formLabel = signal('');
  formDescription = signal('');

  // Loading states
  isLoading = signal(false);
  isSaving = signal(false);

  // Computed
  filteredSubCategories = computed(() => {
    const root = this.selectedRoot();
    if (!root) return [];

    return this.subCategories().filter(sub => sub.rootId === root.id);
  });

  subCategoryCount = computed(() => {
    const counts: Record<string, number> = {};
    for (const sub of this.subCategories()) {
      counts[sub.rootId] = (counts[sub.rootId] || 0) + 1;
    }
    return counts;
  });

  async ngOnInit() {
    await this.loadSubCategories();
  }

  async loadSubCategories() {
    this.isLoading.set(true);
    try {
      const subs = await db.subCategories.toArray();
      this.subCategories.set(subs);
    } catch (error) {
      console.error('Error loading subcategories:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  selectRoot(root: RootCategory) {
    this.selectedRoot.set(root);
    this.cancelForm();
  }

  startCreate() {
    this.isCreating.set(true);
    this.isEditing.set(null);
    this.formLabel.set('');
    this.formDescription.set('');
  }

  startEdit(sub: SubCategory) {
    this.isCreating.set(false);
    this.isEditing.set(sub.id!);
    this.formLabel.set(sub.label);
    this.formDescription.set(sub.description || '');
  }

  cancelForm() {
    this.isCreating.set(false);
    this.isEditing.set(null);
    this.formLabel.set('');
    this.formDescription.set('');
  }

  async saveSubCategory() {
    const label = this.formLabel().trim();
    if (!label || !this.selectedRoot()) return;

    this.isSaving.set(true);

    try {
      const editId = this.isEditing();

      if (editId) {
        // Update existing
        await db.subCategories.update(editId, {
          label,
          description: this.formDescription().trim() || undefined,
          updatedAt: new Date()
        });
      } else {
        // Create new
        await db.subCategories.add({
          rootId: this.selectedRoot()!.id,
          label,
          description: this.formDescription().trim() || undefined,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      await this.loadSubCategories();
      this.cancelForm();
    } catch (error) {
      console.error('Error saving subcategory:', error);
    } finally {
      this.isSaving.set(false);
    }
  }

  async deleteSubCategory(sub: SubCategory) {
    if (!confirm(`Delete "${sub.label}"? This cannot be undone.`)) return;

    try {
      await db.subCategories.delete(sub.id!);

      // Also delete any rules using this subcategory
      await db.categoryRules
        .where('subCategory')
        .equals(sub.label)
        .delete();

      await this.loadSubCategories();
    } catch (error) {
      console.error('Error deleting subcategory:', error);
    }
  }

  getRootIcon(rootId: string): string {
    const root = this.rootCategories.find(r => r.id === rootId);
    return root?.icon || '📁';
  }

  getRootColor(rootId: string): string {
    const root = this.rootCategories.find(r => r.id === rootId);
    return root?.color || '#666';
  }
}
