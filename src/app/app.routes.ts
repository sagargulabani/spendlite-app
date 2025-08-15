// app.routes.ts
import { Routes } from '@angular/router';
import { CsvUploadComponent } from './features/upload/csv-upload.component';
import { AccountsListComponent } from './features/accounts-list/accounts-list.component';
import { ImportsListComponent } from './features/import-list/import-list.component';
import { ImportDetailComponent } from './features/import-detail/import-detail.component';
import { CategoryManagementComponent } from './features/category-management/category-management.component';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/upload',
    pathMatch: 'full'
  },
  {
    path: 'upload',
    component: CsvUploadComponent,
    title: 'Import Transactions - SpendLite'
  },
  {
    path: 'accounts',
    component: AccountsListComponent,
    title: 'Manage Accounts - SpendLite'
  },
  {
    path: 'imports',
    component: ImportsListComponent,
    title: 'Import History - SpendLite'
  },
  {
    path: 'imports/:id',
    component: ImportDetailComponent,
    title: 'Import Details - SpendLite'
  },
  {
    path: 'categories',
    component: CategoryManagementComponent,
    title: 'Category Management - SpendLite'
  },
  {
    path: '**',
    redirectTo: '/upload'
  }
];
