import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';

import { BalancePage } from './balance.page';
import { NewEntryModalComponent } from '../shared/components/new-entry-modal/new-entry-modal.component';

@Component({ selector: 'app-new-entry-modal', template: '' })
class MockNewEntryModalComponent {}

describe('BalancePage', () => {
  let component: BalancePage;
  let fixture: ComponentFixture<BalancePage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BalancePage],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(new Map()) },
        },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    })
      .overrideComponent(BalancePage, {
        remove: { imports: [NewEntryModalComponent] },
        add: { imports: [MockNewEntryModalComponent] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(BalancePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
