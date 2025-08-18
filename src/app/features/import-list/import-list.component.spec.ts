import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ImportsListComponent } from './import-list.component';

describe('ImportsListComponent', () => {
  let component: ImportsListComponent;
  let fixture: ComponentFixture<ImportsListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImportsListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ImportsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
