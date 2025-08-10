// app.routes.ts
import { Routes } from '@angular/router';
import { CsvUploadComponent } from './features/upload/csv-upload.component';
import { AccountsListComponent } from './features/accounts-list/accounts-list.component';
import { ImportsListComponent } from './features/import-list/import-list.component';

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
    path: '**',
    redirectTo: '/upload'
  }
];
