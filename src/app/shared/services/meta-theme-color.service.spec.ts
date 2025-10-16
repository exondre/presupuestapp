import { TestBed } from '@angular/core/testing';

import { MetaThemeColorService } from './meta-theme-color.service';

describe('MetaThemeColor', () => {
  let service: MetaThemeColorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MetaThemeColorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
