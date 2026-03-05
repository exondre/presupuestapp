import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';

import { HomePage } from './home.page';
import { NewEntryModalComponent } from '../shared/components/new-entry-modal/new-entry-modal.component';

@Component({ selector: 'app-new-entry-modal', template: '' })
class MockNewEntryModalComponent {}

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomePage],
    })
      .overrideComponent(HomePage, {
        remove: { imports: [NewEntryModalComponent] },
        add: { imports: [MockNewEntryModalComponent] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
