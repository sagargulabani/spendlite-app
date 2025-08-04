import { Routes } from '@angular/router';
import { CsvUploadComponent } from './features/upload/csv-upload.component';

export const routes: Routes = [
  {
    path: '',
    component: CsvUploadComponent
  },
  {
    path: '**',
    redirectTo: ''
  }
];
