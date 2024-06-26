import {
  Directive,
  EmbeddedViewRef,
  Inject,
  Input,
  NgModule,
  OnDestroy,
  Optional,
} from '@angular/core';
import {
  combineLatest,
  MonoTypeOperatorFunction,
  ReplaySubject,
  Subject,
} from 'rxjs';
import {
  debounce,
  distinctUntilChanged,
  map,
  startWith,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs/operators';
import { RxVirtualForViewContext } from '../list-view-context';

import {
  ListRange,
  RxVirtualScrollStrategy,
  RxVirtualScrollViewport,
  RxVirtualViewRepeater,
} from '../model';
import {
  calculateVisibleContainerSize,
  parseScrollTopBoundaries,
  unpatchedMicroTask,
} from '../util';
import {
  DEFAULT_ITEM_SIZE,
  DEFAULT_RUNWAY_ITEMS,
  DEFAULT_RUNWAY_ITEMS_OPPOSITE,
  RX_VIRTUAL_SCROLL_DEFAULT_OPTIONS,
  RxVirtualScrollDefaultOptions,
} from '../virtual-scroll.config';

/**
 * @Directive FixedSizeVirtualScrollStrategy
 *
 * @description
 *
 * The `FixedSizeVirtualScrollStrategy` provides a very performant way of rendering
 * items of a given size. It is comparable to \@angular/cdk `FixedSizeVirtualScrollStrategy`, but
 * with a high performant layouting technique.
 *
 * @docsCategory RxVirtualFor
 * @docsPage RxVirtualFor
 * @publicApi
 */
@Directive({
  selector: 'rx-virtual-scroll-viewport[itemSize]',
  providers: [
    {
      provide: RxVirtualScrollStrategy,
      useExisting: FixedSizeVirtualScrollStrategy,
    },
  ],
})
export class FixedSizeVirtualScrollStrategy<T>
  extends RxVirtualScrollStrategy<T>
  implements OnDestroy
{
  /**
   * @description
   * The size of the items in the virtually scrolled list
   */
  @Input()
  set itemSize(itemSize: number) {
    if (typeof itemSize === 'number') {
      this._itemSize = itemSize;
    }
  }
  get itemSize() {
    return this._itemSize;
  }

  private _appendOnly = false;
  @Input()
  set appendOnly(input: boolean) {
    this._appendOnly = input != null && `${input}` !== 'false';
  }
  get appendOnly(): boolean {
    return this._appendOnly;
  }

  private _itemSize = DEFAULT_ITEM_SIZE;

  /**
   * @description
   * The amount of items to render upfront in scroll direction
   */
  private _runwayItems = DEFAULT_RUNWAY_ITEMS;
  @Input()
  set runwayItems(runwayItems: number) {
    const newValue = runwayItems ?? DEFAULT_RUNWAY_ITEMS;
    if (newValue !== this._runwayItems) {
      this._runwayItems = newValue;
      this.runwayStateChanged$.next();
    }
  }
  get runwayItems(): number {
    return this._runwayItems;
  }

  /**
   * @description
   * The amount of items to render upfront in reverse scroll direction
   */
  private _runwayItemsOpposite = DEFAULT_RUNWAY_ITEMS_OPPOSITE;
  @Input()
  set runwayItemsOpposite(runwayItemsOpposite: number) {
    const newValue = runwayItemsOpposite ?? DEFAULT_RUNWAY_ITEMS_OPPOSITE;
    if (newValue !== this._runwayItemsOpposite) {
      this._runwayItemsOpposite = newValue;
      this.runwayStateChanged$.next();
    }
  }
  get runwayItemsOpposite(): number {
    return this._runwayItemsOpposite;
  }

  /** @internal */
  private readonly runwayStateChanged$ = new Subject<void>();

  private viewport: RxVirtualScrollViewport | null = null;
  private viewRepeater: RxVirtualViewRepeater<T> | null = null;

  private readonly _scrolledIndex$ = new ReplaySubject<number>(1);
  readonly scrolledIndex$ = this._scrolledIndex$.pipe(distinctUntilChanged());
  private set scrolledIndex(index: number) {
    this._scrolledIndex$.next(index);
  }

  private readonly _contentSize$ = new ReplaySubject<number>(1);
  readonly contentSize$ = this._contentSize$.asObservable();
  private _contentSize = 0;
  private set contentSize(size: number) {
    this._contentSize = size;
    this._contentSize$.next(size);
  }

  private readonly _renderedRange$ = new Subject<ListRange>();
  renderedRange$ = this._renderedRange$.asObservable();
  private _renderedRange: ListRange = { start: 0, end: 0 };
  private set renderedRange(range: ListRange) {
    this._renderedRange = range;
    this._renderedRange$.next(range);
    // this.viewRepeater.setRenderedRange(range);
  }
  private get renderedRange(): ListRange {
    return this._renderedRange;
  }

  private scrollTop = 0;
  /** @internal */
  private scrollTopWithOutOffset = 0;
  /** @internal */
  private scrollTopAfterOffset = 0;
  /** @internal */
  private viewportOffset = 0;
  /** @internal */
  private containerSize = 0;
  private direction: 'up' | 'down' = 'down';

  private readonly detached$ = new Subject<void>();

  constructor(
    @Inject(RX_VIRTUAL_SCROLL_DEFAULT_OPTIONS)
    @Optional()
    private readonly defaults?: RxVirtualScrollDefaultOptions,
  ) {
    super();
  }

  ngOnDestroy() {
    this.detach();
  }

  attach(
    viewport: RxVirtualScrollViewport,
    viewRepeater: RxVirtualViewRepeater<T>,
  ): void {
    this.viewport = viewport;
    this.viewRepeater = viewRepeater;
    this.calcRenderedRange();
    this.positionElements();
  }

  detach(): void {
    this.viewport = null;
    this.viewRepeater = null;
    this.detached$.next();
    this._renderedRange = { start: 0, end: 0 };
  }

  private positionElements(): void {
    this.viewRepeater!.renderingStart$.pipe(
      switchMap(() => {
        return this.viewRepeater!.viewsRendered$.pipe(
          tap((views) => {
            for (let i = 0; i < views.length; i++) {
              const view = views[i];
              this._setViewPosition(view, view.context.index * this.itemSize);
            }
          }),
        );
      }),
      this.untilDetached$(),
    ).subscribe();
  }

  private calcRenderedRange(): void {
    const dataLengthChanged$ = this.viewRepeater!.values$.pipe(
      map((values) => values.length),
      distinctUntilChanged(),
      tap((dataLength) => (this.contentSize = dataLength * this.itemSize)),
    );
    const onScroll$ = this.viewport!.elementScrolled$.pipe(
      startWith(void 0),
      tap(() => {
        this.viewportOffset = this.viewport!.measureOffset();
        const { scrollTop, scrollTopWithOutOffset, scrollTopAfterOffset } =
          parseScrollTopBoundaries(
            this.viewport!.getScrollTop(),
            this.viewportOffset,
            this._contentSize,
            this.containerSize,
          );
        this.direction =
          scrollTopWithOutOffset > this.scrollTopWithOutOffset ? 'down' : 'up';
        this.scrollTopWithOutOffset = scrollTopWithOutOffset;
        this.scrollTopAfterOffset = scrollTopAfterOffset;
        this.scrollTop = scrollTop;
      }),
    );
    combineLatest([
      dataLengthChanged$,
      this.viewport!.containerRect$.pipe(
        map(({ height }) => {
          this.containerSize = height;
          return height;
        }),
        distinctUntilChanged(),
      ),
      onScroll$,
      this.runwayStateChanged$.pipe(startWith(void 0)),
    ])
      .pipe(
        debounce(() => unpatchedMicroTask()),
        map(([length]) => {
          const containerSize = calculateVisibleContainerSize(
            this.containerSize,
            this.scrollTopWithOutOffset,
            this.scrollTopAfterOffset,
          );
          const range: ListRange = { start: 0, end: 0 };
          if (this.direction === 'up') {
            range.start = Math.floor(
              Math.max(0, this.scrollTop - this.runwayItems * this.itemSize) /
                this.itemSize,
            );
            range.end = Math.min(
              length,
              Math.ceil(
                (this.scrollTop +
                  containerSize +
                  this.runwayItemsOpposite * this.itemSize) /
                  this.itemSize,
              ),
            );
          } else {
            range.start = Math.floor(
              Math.max(
                0,
                this.scrollTop - this.runwayItemsOpposite * this.itemSize,
              ) / this.itemSize,
            );
            range.end = Math.min(
              length,
              Math.ceil(
                (this.scrollTop +
                  containerSize +
                  this.runwayItems * this.itemSize) /
                  this.itemSize,
              ),
            );
          }
          if (this.appendOnly) {
            range.start = Math.min(this.renderedRange.start, range.start);
            range.end = Math.max(this.renderedRange.end, range.end);
          }
          this.scrolledIndex = Math.floor(this.scrollTop / this.itemSize);
          return range;
        }),
        distinctUntilChanged(
          ({ start: prevStart, end: prevEnd }, { start, end }) =>
            prevStart === start && prevEnd === end,
        ),
        this.untilDetached$(),
      )
      .subscribe((range) => (this.renderedRange = range));
  }

  scrollToIndex(index: number, behavior?: ScrollBehavior): void {
    const scrollTop = this.itemSize * index;
    this.viewport!.scrollTo(this.viewportOffset + scrollTop, behavior);
  }

  private untilDetached$<A>(): MonoTypeOperatorFunction<A> {
    return (o$) => o$.pipe(takeUntil(this.detached$));
  }

  private _setViewPosition(
    view: EmbeddedViewRef<RxVirtualForViewContext<T>>,
    scrollTop: number,
  ): void {
    const element = this.getElement(view);
    element.style.position = 'absolute';
    element.style.transform = `translateY(${scrollTop}px)`;
  }
}

@NgModule({
  declarations: [FixedSizeVirtualScrollStrategy],
  exports: [FixedSizeVirtualScrollStrategy],
})
export class FixedSizeVirtualScrollStrategyModule {}
