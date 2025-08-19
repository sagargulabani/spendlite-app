import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { ImportReviewComponent } from './import-review.component';

describe('ImportReviewComponent', () => {
  let component: ImportReviewComponent;
  let fixture: ComponentFixture<ImportReviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImportReviewComponent],
      providers: [provideZonelessChangeDetection()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ImportReviewComponent);
    component = fixture.componentInstance;
    
    // Set required input data
    component.reviewData = {
      transactions: [],
      accountId: 1,
      accountName: 'Test Account',
      fileName: 'test.csv',
      fileSize: 1000,
      errorCount: 0,
      bankName: 'HDFC'
    };
    
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
