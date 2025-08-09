import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AccountPickerComponent } from './account-picker-component';

describe('AccountPickerComponent', () => {
  let component: AccountPickerComponent;
  let fixture: ComponentFixture<AccountPickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccountPickerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AccountPickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
