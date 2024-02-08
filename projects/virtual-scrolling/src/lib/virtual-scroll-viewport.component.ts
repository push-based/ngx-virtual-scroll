import { CommonModule } from '@angular/common';
import {
  AfterContentInit,
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  ElementRef,
  Host,
  Input,
  NgModule,
  OnDestroy,
  OnInit,
  Optional,
  Output,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import {
  defer,
  isObservable,
  Observable,
  of,
  ReplaySubject,
  Subject,
} from 'rxjs';
import {
  distinctUntilChanged,
  map,
  shareReplay,
  switchAll,
  switchMap,
  take,
  takeUntil,
  tap,
} from 'rxjs/operators';

import {
  RxVirtualScrollElement,
  RxVirtualScrollStrategy,
  RxVirtualScrollViewport,
  RxVirtualViewRepeater,
} from './model';
import { observeElementSize } from './observe-element-size';
import { unpatchedScroll } from './util';

/**
 * @description Will be provided through Terser global definitions by Angular CLI
 * during the production build.
 */
declare const ngDevMode: boolean;

const NG_DEV_MODE = typeof ngDevMode === 'undefined' || !!ngDevMode;

/**
 * @Component RxVirtualScrollViewport
 *
 * @description
 * Container component comparable to CdkVirtualScrollViewport acting as viewport
 * for `*rxVirtualFor` to operate on.
 *
 * Its main purpose is to implement the `RxVirtualScrollViewport` interface
 * as well as maintaining the scroll runways' height in order to give
 * the provided `RxVirtualScrollStrategy` room to position items.
 *
 * Furthermore, it will gather and forward all events to the consumer of `rxVirtualFor`.
 *
 * @docsCategory RxVirtualFor
 * @docsPage RxVirtualFor
 * @publicApi
 */
@Component({
  selector: 'rx-virtual-scroll-viewport',
  template: `
    <div
      #runway
      class="rx-virtual-scroll__runway"
      [class.rx-virtual-scroll-element]="!scrollElement"
    >
      <div
        #sentinel
        class="rx-virtual-scroll__sentinel"
        *ngIf="!scrollElement"
      ></div>
      <div class="rx-virtual-scroll__content"><ng-content></ng-content></div>
    </div>
  `,
  providers: [
    {
      provide: RxVirtualScrollViewport,
      useExisting: RxVirtualScrollViewportComponent,
    },
  ],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./virtual-scroll-viewport.component.scss'],
  host: {
    class: 'rx-virtual-scroll-viewport',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RxVirtualScrollViewportComponent
  implements
    RxVirtualScrollViewport,
    OnInit,
    AfterViewInit,
    AfterContentInit,
    OnDestroy
{
  @Input() initialScrollIndex = 0;

  /** @internal */
  @ViewChild('sentinel')
  private scrollSentinel!: ElementRef<HTMLElement>;

  /** @internal */
  @ViewChild('runway', { static: true })
  private runway!: ElementRef<HTMLElement>;

  private _scrollStrategy$ = new ReplaySubject<
    | Observable<RxVirtualScrollStrategy<unknown>>
    | RxVirtualScrollStrategy<unknown>
  >(1);
  private scrollStrategy$ = this._scrollStrategy$.pipe(
    map((strategy) => (isObservable(strategy) ? strategy : of(strategy))),
    switchAll(),
    tap((strategy) => (this._scrollStrategy = strategy)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  private _scrollStrategy: RxVirtualScrollStrategy<unknown>;
  @Input()
  // TODO: make observable
  set scrollStrategy(
    scrollStrategy:
      | RxVirtualScrollStrategy<unknown>
      | Observable<RxVirtualScrollStrategy<unknown>>,
  ) {
    this._scrollStrategy$.next(scrollStrategy);
  }

  /** @internal */
  @ContentChild(RxVirtualViewRepeater)
  viewRepeater!: RxVirtualViewRepeater<unknown>;

  readonly elementScrolled$ =
    this.scrollElement?.elementScrolled$ ??
    defer(() => unpatchedScroll(this.runway.nativeElement));

  private hasScrolledYet = false;

  /** @internal */
  private _containerRect$ = new ReplaySubject<{
    width: number;
    height: number;
  }>(1);
  readonly containerRect$ = this._containerRect$.asObservable();

  /**
   * @description
   *
   * The range to be rendered by `*rxVirtualFor`. This value is determined by the
   * provided `RxVirtualScrollStrategy`. It gives the user information about the
   * range of items being actually rendered to the DOM.
   * Note this value updates before the `renderCallback` kicks in, thus it is only
   * in sync with the DOM when the next `renderCallback` emitted an event.
   */
  @Output()
  readonly viewRange = this.scrollStrategy$.pipe(
    switchMap((scrollStrategy) => scrollStrategy.renderedRange$),
  );

  /**
   * @description
   *
   * The index of the currently scrolled item. The scrolled item is the topmost
   * item actually being visible to the user.
   */
  @Output()
  readonly scrolledIndexChange = this.scrollStrategy$.pipe(
    switchMap((scrollStrategy) => scrollStrategy.scrolledIndex$),
  );

  /** @internal */
  private readonly destroy$ = new Subject<void>();

  /** @internal */
  constructor(
    private elementRef: ElementRef<HTMLElement>,
    @Optional() public scrollElement: RxVirtualScrollElement,
    @Optional() @Host() scrollStrategy?: RxVirtualScrollStrategy<unknown>,
  ) {
    if (scrollStrategy) {
      this.scrollStrategy = scrollStrategy;
    }
    observeElementSize(
      this.scrollElement?.getElementRef()?.nativeElement ??
        this.elementRef.nativeElement,
      {
        extract: (entries) => ({
          height: Math.round(entries[0].contentRect.height),
          width: Math.round(entries[0].contentRect.width),
        }),
      },
    )
      .pipe(
        distinctUntilChanged(
          ({ height: prevHeight, width: prevWidth }, { height, width }) =>
            prevHeight === height && prevWidth === width,
        ),
        takeUntil(this.destroy$),
      )
      .subscribe(this._containerRect$);
  }

  ngOnInit() {
    // make it hot
    this.scrollStrategy$.pipe(takeUntil(this.destroy$)).subscribe();
    if (NG_DEV_MODE && !this._scrollStrategy) {
      throw Error(
        'Error: rx-virtual-scroll-viewport requires an `RxVirtualScrollStrategy` to be set.',
      );
    }
  }

  ngAfterViewInit() {
    this.scrollStrategy$
      .pipe(
        switchMap((scrollStrategy) => scrollStrategy.contentSize$),
        distinctUntilChanged(),
        takeUntil(this.destroy$),
      )
      .subscribe((size) => {
        this.updateContentSize(size);
      });
    if (this.initialScrollIndex != null && this.initialScrollIndex > 0) {
      this.scrollStrategy$
        .pipe(
          switchMap((scrollStrategy) => scrollStrategy.contentSize$),
          take(1),
          takeUntil(this.destroy$),
        )
        .subscribe(() => {
          this.scrollToIndex(this.initialScrollIndex);
        });
    }
  }

  /** @internal */
  ngAfterContentInit(): void {
    if (ngDevMode && !this.viewRepeater) {
      throw Error(
        'Error: rx-virtual-scroll-viewport requires a `RxVirtualViewRepeater` to be provided.',
      );
    }
    this.elementScrolled$
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe(() => (this.hasScrolledYet = true));
    let activeStrategy: RxVirtualScrollStrategy<unknown>;
    this.scrollStrategy$
      .pipe(takeUntil(this.destroy$))
      .subscribe((strategy) => {
        activeStrategy?.detach();
        activeStrategy = strategy;
        activeStrategy.attach(this, this.viewRepeater);
        this.viewRepeater.setScrollStrategy(activeStrategy);
      });
  }

  /** @internal */
  ngOnDestroy(): void {
    this.destroy$.next();
    this._scrollStrategy.detach();
  }

  getScrollElement(): HTMLElement {
    return (
      this.scrollElement?.getElementRef()?.nativeElement ??
      this.runway.nativeElement
    );
  }

  getScrollTop(): number {
    return !this.hasScrolledYet ? 0 : this.getScrollElement().scrollTop;
  }

  scrollTo(position: number, behavior?: ScrollBehavior): void {
    // TODO: implement more complex scroll scenarios
    this.getScrollElement().scrollTo({ top: position, behavior: behavior });
  }

  scrollToIndex(index: number, behavior?: ScrollBehavior): void {
    this._scrollStrategy.scrollToIndex(index, behavior);
  }

  measureOffset(): number {
    if (this.scrollElement) {
      const scrollableOffset = this.scrollElement.measureOffset();
      const rect = this.elementRef.nativeElement.getBoundingClientRect();
      return this.getScrollTop() + (rect.top - scrollableOffset);
    } else {
      return 0;
    }
  }

  protected updateContentSize(size: number): void {
    if (this.scrollElement) {
      this.elementRef.nativeElement.style.height = `${size}px`;
    } else {
      this.scrollSentinel.nativeElement.style.transform = `translate(0, ${size - 1}px)`;
    }
  }
}

@NgModule({
  declarations: [RxVirtualScrollViewportComponent],
  imports: [CommonModule],
  exports: [RxVirtualScrollViewportComponent],
})
export class RxVirtualScrollViewportModule {}
