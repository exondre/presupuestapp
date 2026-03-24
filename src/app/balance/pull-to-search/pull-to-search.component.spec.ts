import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { GestureController } from '@ionic/angular/standalone';

import { PullToSearchComponent } from './pull-to-search.component';

/**
 * Creates a mock gesture object matching the shape returned by GestureController.create().
 *
 * @returns A mock gesture with spied methods.
 */
function buildMockGesture(): { enable: jasmine.Spy; destroy: jasmine.Spy } {
  return {
    enable: jasmine.createSpy('enable'),
    destroy: jasmine.createSpy('destroy'),
  };
}

class GestureControllerMock {
  create = jasmine.createSpy('create').and.returnValue(buildMockGesture());
}

describe('PullToSearchComponent', () => {
  let component: PullToSearchComponent;
  let fixture: ComponentFixture<PullToSearchComponent>;
  let gestureCtrlMock: GestureControllerMock;

  beforeEach(async () => {
    gestureCtrlMock = new GestureControllerMock();

    await TestBed.configureTestingModule({
      imports: [PullToSearchComponent],
      providers: [
        { provide: GestureController, useValue: gestureCtrlMock },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(PullToSearchComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have search bar hidden initially', () => {
    expect(component.searchVisible()).toBeFalse();
  });

  it('should have hint visible initially', () => {
    expect(component.hintVisible()).toBeTrue();
  });

  it('should have empty search term initially', () => {
    expect(component.searchTerm()).toBe('');
  });

  it('should have zero pull progress initially', () => {
    expect(component.pullProgress()).toBe(0);
  });

  describe('handleSearchInput', () => {
    it('should update search term and emit searchTermChange', () => {
      const emitSpy = spyOn(component.searchTermChange, 'emit');
      const event = { detail: { value: 'alimento' } } as CustomEvent;

      component.handleSearchInput(event);

      expect(component.searchTerm()).toBe('alimento');
      expect(emitSpy).toHaveBeenCalledWith('alimento');
    });

    it('should default to empty string when event value is null', () => {
      const emitSpy = spyOn(component.searchTermChange, 'emit');
      const event = { detail: { value: null } } as CustomEvent;

      component.handleSearchInput(event);

      expect(component.searchTerm()).toBe('');
      expect(emitSpy).toHaveBeenCalledWith('');
    });
  });

  describe('handleClear', () => {
    it('should reset search term and emit empty searchTermChange', () => {
      const termChangeSpy = spyOn(component.searchTermChange, 'emit');
      component.searchTerm.set('test');
      component.searchVisible.set(true);

      component.handleClear();

      expect(component.searchTerm()).toBe('');
      expect(termChangeSpy).toHaveBeenCalledWith('');
    });

    it('should keep the search bar visible after clear', () => {
      component.searchVisible.set(true);

      component.handleClear();

      expect(component.searchVisible()).toBeTrue();
    });

    it('should not emit searchCleared on clear', () => {
      const clearedSpy = spyOn(component.searchCleared, 'emit');

      component.handleClear();

      expect(clearedSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleCancel', () => {
    it('should reset search term and emit searchCleared', () => {
      const clearedSpy = spyOn(component.searchCleared, 'emit');
      component.searchTerm.set('test');
      component.searchVisible.set(true);

      component.handleCancel();

      expect(component.searchTerm()).toBe('');
      expect(clearedSpy).toHaveBeenCalled();
    });

    it('should hide the search bar', () => {
      component.searchVisible.set(true);

      component.handleCancel();

      expect(component.searchVisible()).toBeFalse();
    });

    it('should restore hint visibility', () => {
      component.hintVisible.set(false);

      component.handleCancel();

      expect(component.hintVisible()).toBeTrue();
    });
  });

  describe('revealSearchBar', () => {
    it('should set searchVisible to true', () => {
      component.revealSearchBar();

      expect(component.searchVisible()).toBeTrue();
    });

    it('should hide the affordance hint', () => {
      component.revealSearchBar();

      expect(component.hintVisible()).toBeFalse();
    });

    it('should reset pull progress to zero', () => {
      component.pullProgress.set(0.5);

      component.revealSearchBar();

      expect(component.pullProgress()).toBe(0);
    });

    it('should disable the gesture when available', () => {
      const mockGesture = buildMockGesture();
      gestureCtrlMock.create.and.returnValue(mockGesture);
      (component as any).gesture = mockGesture;

      component.revealSearchBar();

      expect(mockGesture.enable).toHaveBeenCalledWith(false);
    });
  });

  describe('hideSearchBar', () => {
    it('should set searchVisible to false', () => {
      component.searchVisible.set(true);

      component.hideSearchBar();

      expect(component.searchVisible()).toBeFalse();
    });

    it('should restore the affordance hint', () => {
      component.hintVisible.set(false);

      component.hideSearchBar();

      expect(component.hintVisible()).toBeTrue();
    });

    it('should reset pull progress to zero', () => {
      component.pullProgress.set(0.8);

      component.hideSearchBar();

      expect(component.pullProgress()).toBe(0);
    });

    it('should re-enable the gesture when available', () => {
      const mockGesture = buildMockGesture();
      (component as any).gesture = mockGesture;

      component.hideSearchBar();

      expect(mockGesture.enable).toHaveBeenCalledWith(true);
    });
  });

  describe('ngOnDestroy', () => {
    it('should destroy the gesture on component destruction', () => {
      const mockGesture = buildMockGesture();
      (component as any).gesture = mockGesture;

      component.ngOnDestroy();

      expect(mockGesture.destroy).toHaveBeenCalled();
    });

    it('should remove the scroll listener on destruction', () => {
      const mockScrollEl = {
        scrollTop: 0,
        addEventListener: jasmine.createSpy('addEventListener'),
        removeEventListener: jasmine.createSpy('removeEventListener'),
      };
      const listener = () => {};
      (component as any).scrollEl = mockScrollEl;
      (component as any).scrollListener = listener;

      component.ngOnDestroy();

      expect(mockScrollEl.removeEventListener).toHaveBeenCalledWith(
        'scroll',
        listener,
      );
    });

    it('should handle destruction gracefully when no gesture exists', () => {
      (component as any).gesture = null;
      (component as any).scrollEl = null;
      (component as any).scrollListener = null;

      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });

  describe('template rendering', () => {
    it('should render the affordance zone when search is not visible', () => {
      component.searchVisible.set(false);
      fixture.detectChanges();

      const zone = fixture.nativeElement.querySelector(
        '.pull-to-search__affordance-zone',
      );
      expect(zone).toBeTruthy();
    });

    it('should hide the affordance zone when search is visible', () => {
      component.searchVisible.set(true);
      fixture.detectChanges();

      const zone = fixture.nativeElement.querySelector(
        '.pull-to-search__affordance-zone',
      );
      expect(zone).toBeNull();
    });

    it('should render the affordance hint inside the zone when hintVisible is true', () => {
      component.hintVisible.set(true);
      component.searchVisible.set(false);
      fixture.detectChanges();

      const hint = fixture.nativeElement.querySelector(
        '.pull-to-search__hint',
      );
      expect(hint).toBeTruthy();
    });

    it('should not render the affordance hint when hintVisible is false', () => {
      component.hintVisible.set(false);
      component.searchVisible.set(false);
      fixture.detectChanges();

      const hint = fixture.nativeElement.querySelector(
        '.pull-to-search__hint',
      );
      expect(hint).toBeNull();
    });

    it('should apply the visible modifier class when search is revealed', () => {
      component.searchVisible.set(true);
      fixture.detectChanges();

      const bar = fixture.nativeElement.querySelector(
        '.pull-to-search__bar',
      );
      expect(bar.classList.contains('pull-to-search__bar--visible')).toBeTrue();
    });

    it('should not apply the visible modifier class when search is hidden', () => {
      component.searchVisible.set(false);
      fixture.detectChanges();

      const bar = fixture.nativeElement.querySelector(
        '.pull-to-search__bar',
      );
      expect(
        bar.classList.contains('pull-to-search__bar--visible'),
      ).toBeFalse();
    });

    it('should render the pull indicator when pull progress is positive and search hidden', () => {
      component.pullProgress.set(0.5);
      component.searchVisible.set(false);
      fixture.detectChanges();

      const indicator = fixture.nativeElement.querySelector(
        '.pull-to-search__pull-indicator',
      );
      expect(indicator).toBeTruthy();
    });

    it('should not render the pull indicator when search is visible', () => {
      component.pullProgress.set(0.5);
      component.searchVisible.set(true);
      fixture.detectChanges();

      const indicator = fixture.nativeElement.querySelector(
        '.pull-to-search__pull-indicator',
      );
      expect(indicator).toBeNull();
    });

    it('should not render the pull indicator when progress is zero', () => {
      component.pullProgress.set(0);
      component.searchVisible.set(false);
      fixture.detectChanges();

      const indicator = fixture.nativeElement.querySelector(
        '.pull-to-search__pull-indicator',
      );
      expect(indicator).toBeNull();
    });
  });

  describe('setupGesture', () => {
    it('should exit early when no ion-content ancestor exists', async () => {
      (component as any).contentEl = null;

      await (component as any).setupGesture();

      expect(gestureCtrlMock.create).not.toHaveBeenCalled();
    });

    it('should exit early when getScrollElement rejects', async () => {
      const fakeContent = {
        closest: () => fakeContent,
        getScrollElement: () => Promise.reject(new Error('no scroll element')),
      };
      (component as any).elementRef = { nativeElement: fakeContent };
      gestureCtrlMock.create.calls.reset();

      await (component as any).setupGesture();

      expect(gestureCtrlMock.create).not.toHaveBeenCalled();
    });

    it('should create gesture and attach scroll listener when content is available', async () => {
      const mockScrollEl = {
        scrollTop: 0,
        addEventListener: jasmine.createSpy('addEventListener'),
        removeEventListener: jasmine.createSpy('removeEventListener'),
      };
      const fakeContent = {
        getScrollElement: () => Promise.resolve(mockScrollEl),
      };
      const fakeNativeElement = {
        closest: (_selector: string) => fakeContent,
        querySelector: () => null,
      };
      (component as any).elementRef = { nativeElement: fakeNativeElement };
      const mockGesture = buildMockGesture();
      gestureCtrlMock.create.and.returnValue(mockGesture);
      gestureCtrlMock.create.calls.reset();

      await (component as any).setupGesture();

      expect(mockScrollEl.addEventListener).toHaveBeenCalledWith(
        'scroll',
        jasmine.any(Function),
        { passive: true },
      );
      expect(gestureCtrlMock.create).toHaveBeenCalled();
      expect(mockGesture.enable).toHaveBeenCalledWith(true);
    });

    it('should update scrollTop via the scroll listener', async () => {
      const mockScrollEl = {
        scrollTop: 100,
        addEventListener: jasmine.createSpy('addEventListener'),
        removeEventListener: jasmine.createSpy('removeEventListener'),
      };
      const fakeContent = {
        getScrollElement: () => Promise.resolve(mockScrollEl),
      };
      const fakeNativeElement = {
        closest: (_selector: string) => fakeContent,
        querySelector: () => null,
      };
      (component as any).elementRef = { nativeElement: fakeNativeElement };
      gestureCtrlMock.create.and.returnValue(buildMockGesture());

      await (component as any).setupGesture();

      const scrollCallback = mockScrollEl.addEventListener.calls.mostRecent().args[1] as () => void;
      scrollCallback();

      expect((component as any).scrollTop).toBe(100);
    });

    it('should auto-hide search bar when visible, empty, and user scrolls down', async () => {
      const mockScrollEl = {
        scrollTop: 20,
        addEventListener: jasmine.createSpy('addEventListener'),
        removeEventListener: jasmine.createSpy('removeEventListener'),
      };
      const fakeContent = {
        getScrollElement: () => Promise.resolve(mockScrollEl),
      };
      const fakeNativeElement = {
        closest: (_selector: string) => fakeContent,
        querySelector: () => null,
      };
      (component as any).elementRef = { nativeElement: fakeNativeElement };
      gestureCtrlMock.create.and.returnValue(buildMockGesture());

      await (component as any).setupGesture();

      component.searchVisible.set(true);
      component.searchTerm.set('');
      (component as any).scrollTop = 5;

      const scrollCallback = mockScrollEl.addEventListener.calls.mostRecent().args[1] as () => void;
      scrollCallback();

      expect(component.searchVisible()).toBeFalse();
    });

    it('should not auto-hide when search bar has text and user scrolls down', async () => {
      const mockScrollEl = {
        scrollTop: 50,
        addEventListener: jasmine.createSpy('addEventListener'),
        removeEventListener: jasmine.createSpy('removeEventListener'),
      };
      const fakeContent = {
        getScrollElement: () => Promise.resolve(mockScrollEl),
      };
      const fakeNativeElement = {
        closest: (_selector: string) => fakeContent,
        querySelector: () => null,
      };
      (component as any).elementRef = { nativeElement: fakeNativeElement };
      gestureCtrlMock.create.and.returnValue(buildMockGesture());

      await (component as any).setupGesture();

      component.searchVisible.set(true);
      component.searchTerm.set('almuerzo');
      (component as any).scrollTop = 5;

      const scrollCallback = mockScrollEl.addEventListener.calls.mostRecent().args[1] as () => void;
      scrollCallback();

      expect(component.searchVisible()).toBeTrue();
    });

    it('should not auto-hide when search bar is not visible', async () => {
      const mockScrollEl = {
        scrollTop: 50,
        addEventListener: jasmine.createSpy('addEventListener'),
        removeEventListener: jasmine.createSpy('removeEventListener'),
      };
      const fakeContent = {
        getScrollElement: () => Promise.resolve(mockScrollEl),
      };
      const fakeNativeElement = {
        closest: (_selector: string) => fakeContent,
        querySelector: () => null,
      };
      (component as any).elementRef = { nativeElement: fakeNativeElement };
      gestureCtrlMock.create.and.returnValue(buildMockGesture());

      await (component as any).setupGesture();

      component.searchVisible.set(false);
      component.searchTerm.set('');
      (component as any).scrollTop = 5;

      const scrollCallback = mockScrollEl.addEventListener.calls.mostRecent().args[1] as () => void;
      scrollCallback();

      expect(component.searchVisible()).toBeFalse();
    });
  });

  describe('gesture callbacks', () => {
    let gestureConfig: any;

    beforeEach(async () => {
      const mockScrollEl = {
        scrollTop: 0,
        addEventListener: jasmine.createSpy('addEventListener'),
        removeEventListener: jasmine.createSpy('removeEventListener'),
      };
      const fakeContent = {
        getScrollElement: () => Promise.resolve(mockScrollEl),
      };
      const fakeNativeElement = {
        closest: (_selector: string) => fakeContent,
        querySelector: () => null,
      };
      (component as any).elementRef = { nativeElement: fakeNativeElement };
      gestureCtrlMock.create.and.callFake((config: any) => {
        gestureConfig = config;
        return buildMockGesture();
      });

      await (component as any).setupGesture();
    });

    it('canStart should return true when scrolled to top and search not visible', () => {
      (component as any).scrollTop = 0;
      component.searchVisible.set(false);

      expect(gestureConfig.canStart()).toBeTrue();
    });

    it('canStart should return false when not at scroll top', () => {
      (component as any).scrollTop = 50;
      component.searchVisible.set(false);

      expect(gestureConfig.canStart()).toBeFalse();
    });

    it('canStart should return false when search is already visible', () => {
      (component as any).scrollTop = 0;
      component.searchVisible.set(true);

      expect(gestureConfig.canStart()).toBeFalse();
    });

    it('onMove should update pull progress for positive deltaY', () => {
      gestureConfig.onMove({ deltaY: 40 });

      expect(component.pullProgress()).toBe(0.5);
    });

    it('onMove should cap pull progress at 1', () => {
      gestureConfig.onMove({ deltaY: 200 });

      expect(component.pullProgress()).toBe(1);
    });

    it('onMove should ignore negative deltaY', () => {
      component.pullProgress.set(0.3);

      gestureConfig.onMove({ deltaY: -10 });

      expect(component.pullProgress()).toBe(0.3);
    });

    it('onEnd should reveal search bar when deltaY exceeds threshold', () => {
      const revealSpy = spyOn(component, 'revealSearchBar');

      gestureConfig.onEnd({ deltaY: 65 });

      expect(revealSpy).toHaveBeenCalled();
    });

    it('onEnd should reset pull progress when deltaY below threshold', () => {
      component.pullProgress.set(0.5);

      gestureConfig.onEnd({ deltaY: 30 });

      expect(component.pullProgress()).toBe(0);
    });
  });

  describe('focusSearchbar', () => {
    beforeEach(() => {
      jasmine.clock().install();
    });

    afterEach(() => {
      jasmine.clock().uninstall();
    });

    it('should call setFocus on the searchbar element after timeout', () => {
      const mockSetFocus = jasmine.createSpy('setFocus').and.returnValue(Promise.resolve());
      const mockSearchbar = { setFocus: mockSetFocus };
      (component as any).elementRef = {
        nativeElement: {
          querySelector: (selector: string) =>
            selector === 'ion-searchbar' ? mockSearchbar : null,
        },
      };
      (component as any).searchbarRef = undefined;

      (component as any).focusSearchbar();
      jasmine.clock().tick(400);

      expect(mockSetFocus).toHaveBeenCalled();
    });

    it('should not throw when searchbar element has no setFocus method', () => {
      const mockSearchbar = {};
      (component as any).elementRef = {
        nativeElement: {
          querySelector: () => mockSearchbar,
        },
      };
      (component as any).searchbarRef = undefined;

      (component as any).focusSearchbar();

      expect(() => jasmine.clock().tick(400)).not.toThrow();
    });

    it('should not throw when no searchbar element is found', () => {
      (component as any).elementRef = {
        nativeElement: {
          querySelector: () => null,
        },
      };
      (component as any).searchbarRef = undefined;

      (component as any).focusSearchbar();

      expect(() => jasmine.clock().tick(400)).not.toThrow();
    });

    it('should prefer searchbarRef when available', () => {
      const refSetFocus = jasmine.createSpy('refSetFocus').and.returnValue(Promise.resolve());
      const refSearchbar = { setFocus: refSetFocus };
      (component as any).searchbarRef = {
        nativeElement: {
          querySelector: () => refSearchbar,
        },
      };

      (component as any).focusSearchbar();
      jasmine.clock().tick(400);

      expect(refSetFocus).toHaveBeenCalled();
    });
  });
});
