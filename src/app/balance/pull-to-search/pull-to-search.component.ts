import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  OnDestroy,
  inject,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import {
  GestureController,
  IonIcon,
  IonSearchbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowDownOutline, searchOutline } from 'ionicons/icons';

/**
 * Maximum vertical distance used to normalise the pull progress.
 */
const PULL_DISTANCE_THRESHOLD = 80;

/**
 * Minimum vertical distance required to trigger the reveal action.
 */
const PULL_REVEAL_THRESHOLD = 60;

/**
 * Encapsulates a pull-to-reveal search bar interaction.
 *
 * The component renders a subtle affordance hint and a collapsible
 * search bar that is revealed when the user pulls down from the top
 * of the nearest `ion-content` ancestor.
 */
@Component({
  selector: 'app-pull-to-search',
  standalone: true,
  templateUrl: './pull-to-search.component.html',
  styleUrls: ['./pull-to-search.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonSearchbar, IonIcon],
})
export class PullToSearchComponent implements AfterViewInit, OnDestroy {
  /** Emits the current search term each time the user types. */
  readonly searchTermChange = output<string>();

  /** Emits when the search is cleared or cancelled. */
  readonly searchCleared = output<void>();

  /** Controls whether the search bar is visible. */
  readonly searchVisible = signal(false);

  /** Tracks the current input value. */
  readonly searchTerm = signal('');

  /** Controls the pull progress used for the reveal animation. */
  readonly pullProgress = signal(0);

  /** Controls visibility of the affordance hint. */
  readonly hintVisible = signal(true);

  @ViewChild(IonSearchbar, { read: ElementRef })
  private searchbarRef?: ElementRef<HTMLElement>;

  private readonly elementRef = inject(ElementRef);
  private readonly gestureCtrl = inject(GestureController);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  private gesture: ReturnType<GestureController['create']> | null = null;
  private scrollTop = 0;
  private scrollListener: (() => void) | null = null;
  private contentEl: HTMLIonContentElement | null = null;
  private scrollEl: HTMLElement | null = null;

  constructor() {
    addIcons({
      'arrow-down-outline': arrowDownOutline,
      'search-outline': searchOutline,
    });
  }

  ngAfterViewInit(): void {
    this.setupGesture();
  }

  ngOnDestroy(): void {
    this.teardownGesture();
  }

  /**
   * Handles each keystroke in the searchbar and emits the current term.
   *
   * @param event Ionic input event carrying the search value.
   */
  handleSearchInput(event: CustomEvent): void {
    const value = (event.detail.value as string) ?? '';
    this.searchTerm.set(value);
    this.searchTermChange.emit(value);
  }

  /**
   * Clears the search input without closing the bar, allowing the user
   * to start a new query immediately.
   */
  handleClear(): void {
    this.searchTerm.set('');
    this.searchTermChange.emit('');
  }

  /**
   * Cancels the search session: clears the input, emits the cleared event,
   * and hides the search bar.
   */
  handleCancel(): void {
    this.searchTerm.set('');
    this.searchCleared.emit();
    this.hideSearchBar();
  }

  /**
   * Programmatically reveals the search bar and disables the pull gesture.
   */
  revealSearchBar(): void {
    this.searchVisible.set(true);
    this.hintVisible.set(false);
    this.pullProgress.set(0);
    this.gesture?.enable(false);
    this.focusSearchbar();
  }

  /**
   * Programmatically hides the search bar and re-enables the pull gesture.
   */
  hideSearchBar(): void {
    this.searchVisible.set(false);
    this.hintVisible.set(true);
    this.pullProgress.set(0);
    this.gesture?.enable(true);
  }

  /**
   * Initialises the pull gesture on the nearest `ion-content` ancestor.
   */
  private async setupGesture(): Promise<void> {
    const el: HTMLElement = this.elementRef.nativeElement;
    this.contentEl = el.closest('ion-content') as HTMLIonContentElement | null;

    if (!this.contentEl) {
      return;
    }

    try {
      this.scrollEl = await this.contentEl.getScrollElement();
    } catch {
      return;
    }

    this.scrollListener = () => {
      const newScrollTop = this.scrollEl?.scrollTop ?? 0;
      if (
        this.searchVisible() &&
        this.searchTerm().trim() === '' &&
        newScrollTop > this.scrollTop &&
        newScrollTop > 10
      ) {
        this.ngZone.run(() => {
          this.hideSearchBar();
        });
      }
      this.scrollTop = newScrollTop;
    };
    this.scrollEl.addEventListener('scroll', this.scrollListener, {
      passive: true,
    });

    this.gesture = this.gestureCtrl.create({
      el: this.contentEl,
      gestureName: 'pull-to-search',
      direction: 'y',
      threshold: 15,
      maxAngle: 40,
      canStart: () => this.scrollTop <= 0 && !this.searchVisible(),
      onMove: (detail) => {
        if (detail.deltaY < 0) {
          return;
        }
        const progress = Math.min(detail.deltaY / PULL_DISTANCE_THRESHOLD, 1);
        this.ngZone.run(() => this.pullProgress.set(progress));
      },
      onEnd: (detail) => {
        this.ngZone.run(() => {
          if (detail.deltaY >= PULL_REVEAL_THRESHOLD) {
            this.revealSearchBar();
          } else {
            this.pullProgress.set(0);
          }
        });
      },
    });

    this.gesture.enable(true);

    this.destroyRef.onDestroy(() => this.teardownGesture());
  }

  /**
   * Cleans up the gesture and scroll listener.
   */
  private teardownGesture(): void {
    this.gesture?.destroy();
    this.gesture = null;

    if (this.scrollEl && this.scrollListener) {
      this.scrollEl.removeEventListener('scroll', this.scrollListener);
      this.scrollListener = null;
    }
  }

  /**
   * Focuses the native search input inside the Ionic searchbar.
   */
  private focusSearchbar(): void {
    setTimeout(() => {
      const ionSearchbar =
        this.searchbarRef?.nativeElement?.querySelector('ion-searchbar') ??
        this.elementRef.nativeElement.querySelector('ion-searchbar');
      if (ionSearchbar && typeof (ionSearchbar as any).setFocus === 'function') {
        void (ionSearchbar as any).setFocus();
      }
    }, 350);
  }
}
