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
  merge,
  MonoTypeOperatorFunction,
  Observable,
  ReplaySubject,
  Subject,
} from 'rxjs';
import {
  debounce,
  distinctUntilChanged,
  exhaustMap,
  filter,
  finalize,
  groupBy,
  map,
  mergeMap,
  pairwise,
  startWith,
  switchMap,
  takeUntil,
  takeWhile,
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
import { RxResizeObserver } from './resize-observer';

/** @internal */
type VirtualViewItem = {
  size: number;
  cached?: boolean;
  position?: number;
};

/** @internal */
type AnchorItem = {
  index: number;
  offset: number;
};

const defaultSizeExtract = (entry: ResizeObserverEntry) =>
  entry.contentRect.height;

/**
 * @Directive AutosizeVirtualScrollStrategy
 *
 * @description
 *
 * The `AutosizeVirtualScrollStrategy` provides a twitter-like virtual-scrolling
 * experience. It is able to render and position items based on their individual
 * size. It is comparable to \@angular/cdk/experimental `AutosizeVirtualScrollStrategy`, but
 * with a high performant layouting technique and more features.
 *
 * On top of this the `AutosizeVirtualScrollStrategy` is leveraging the native
 * `ResizeObserver` in order to detect size changes for each individual view
 * rendered to the DOM and properly re-position accordingly.
 *
 * In order to provide top-notch runtime performance the `AutosizeVirtualScrollStrategy`
 * builds up caches that prevent DOM interactions whenever possible. Once a view
 * was visited, its properties will be stored instead of re-read from the DOM again as
 * this can potentially lead to unwanted forced reflows.
 *
 * @docsCategory RxVirtualFor
 * @docsPage RxVirtualFor
 * @publicApi
 */
@Directive({
  selector: 'rx-virtual-scroll-viewport[autosize]',
  providers: [
    {
      provide: RxVirtualScrollStrategy,
      useExisting: AutoSizeVirtualScrollStrategy,
    },
    RxResizeObserver,
  ],
})
export class AutoSizeVirtualScrollStrategy<T>
  extends RxVirtualScrollStrategy<T>
  implements OnDestroy
{
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
      this.recalculateRange$.next();
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
      this.recalculateRange$.next();
    }
  }
  get runwayItemsOpposite(): number {
    return this._runwayItemsOpposite;
  }

  /**
   * @description
   * The default size of the items being rendered. The autosized strategy will assume
   * this size for items it doesn't know yet. For the smoothest experience,
   * you provide the mean size of all items being rendered - if possible of course.
   *
   * As soon as rxVirtualFor is able to also render actual tombstone items, this
   * will be the size of a tombstone item being rendered before the actual item
   * is inserted into its position.
   */
  @Input() tombstoneSize = this.defaults?.itemSize ?? DEFAULT_ITEM_SIZE;

  /**
   * @description
   * The autosized strategy uses the native ResizeObserver in order to determine
   * if an item changed in size to afterwards properly position the views.
   * You can customize the config passed to the ResizeObserver as well as determine
   * which result property to use when determining the views size.
   */
  @Input() resizeObserverConfig?: {
    options?: ResizeObserverOptions;
    extractSize?: (entry: ResizeObserverEntry) => number;
  };

  private _appendOnly = false;
  @Input()
  set appendOnly(input: boolean) {
    this._appendOnly = input != null && `${input}` !== 'false';
  }
  get appendOnly(): boolean {
    return this._appendOnly;
  }

  /**
   * @description
   * When enabled, the autosized scroll strategy uses attaches a `ResizeObserver`
   * to every view within the given renderedRange. If your views receive
   * dimension changes that are not caused by list updates, this is a way to
   * still track height changes. This also applies to resize events of the whole
   * document.
   */
  @Input()
  set withResizeObserver(input: boolean) {
    this._withResizeObserver = input != null && `${input}` !== 'false';
  }
  get withResizeObserver(): boolean {
    return this._withResizeObserver;
  }
  private _withResizeObserver = true;

  /** @internal */
  private viewport: RxVirtualScrollViewport | null = null;
  /** @internal */
  private viewRepeater: RxVirtualViewRepeater<T> | null = null;

  /** @internal */
  private readonly _contentSize$ = new ReplaySubject<number>(1);
  /** @internal */
  override readonly contentSize$ = this._contentSize$.asObservable();

  /** @internal */
  private _contentSize = 0;
  /** @internal */
  private set contentSize(size: number) {
    this._contentSize = size;
    this._contentSize$.next(size);
  }
  private get contentSize(): number {
    return this._contentSize;
  }

  /** @internal */
  private readonly _renderedRange$ = new Subject<ListRange>();
  /** @internal */
  readonly renderedRange$ = this._renderedRange$.asObservable();
  /** @internal */
  private _renderedRange: ListRange = { start: 0, end: 0 };

  /** @internal */
  private set renderedRange(range: ListRange) {
    this._renderedRange = range;
    this._renderedRange$.next(range);
  }
  /** @internal */
  private get renderedRange(): ListRange {
    return this._renderedRange;
  }

  /** @internal */
  private readonly _scrolledIndex$ = new ReplaySubject<number>(1);
  /** @internal */
  readonly scrolledIndex$ = this._scrolledIndex$.pipe(distinctUntilChanged());
  /** @internal */
  private _scrolledIndex = 0;
  /** @internal */
  private get scrolledIndex(): number {
    return this._scrolledIndex;
  }
  /** @internal */
  private set scrolledIndex(index: number) {
    this._scrolledIndex = index;
    this._scrolledIndex$.next(index);
  }

  /**
   * is set, when scrollToIndex is called
   * @internal
   * */
  private _scrollToIndex: number | null = null;

  /** @internal */
  private containerSize = 0;
  /** @internal */
  private contentLength = 0;
  /** @internal */
  private _virtualItems: VirtualViewItem[] = [];
  /** @internal */
  private scrollTop = 0;
  /** @internal */
  private scrollTopWithOutOffset = 0;
  /** @internal */
  private scrollTopAfterOffset = 0;
  /** @internal */
  private viewportOffset = 0;
  /** @internal */
  private direction: 'up' | 'down' = 'down';
  /** @internal */
  private anchorScrollTop = 0;

  /** @internal */
  private anchorItem = {
    index: 0,
    offset: 0,
  };
  /** @internal */
  private lastScreenItem = {
    index: 0,
    offset: 0,
  };

  /** @internal */
  private readonly detached$ = new Subject<void>();

  /** @internal */
  private readonly recalculateRange$ = new Subject<void>();

  /** @internal */
  private until$<A>(): MonoTypeOperatorFunction<A> {
    return (o$) => o$.pipe(takeUntil(this.detached$));
  }

  /** @internal */
  private get extractSize() {
    return this.resizeObserverConfig?.extractSize ?? defaultSizeExtract;
  }

  constructor(
    private resizeObserver: RxResizeObserver,
    @Inject(RX_VIRTUAL_SCROLL_DEFAULT_OPTIONS)
    @Optional()
    private readonly defaults?: RxVirtualScrollDefaultOptions,
  ) {
    super();
  }

  /** @internal */
  ngOnDestroy() {
    this.detach();
  }

  /** @internal */
  attach(
    viewport: RxVirtualScrollViewport,
    viewRepeater: RxVirtualViewRepeater<T>,
  ): void {
    this.viewport = viewport;
    this.viewRepeater = viewRepeater;
    this.maintainVirtualItems();
    this.calcRenderedRange();
    this.positionElements();
  }

  /** @internal */
  detach(): void {
    this.detached$.next();
    this.viewport = null;
    this.viewRepeater = null;
    this._virtualItems = [];
    this._scrollToIndex = null;
    this._renderedRange = { start: 0, end: 0 };
    this.anchorItem = { index: 0, offset: 0 };
    this.lastScreenItem = { index: 0, offset: 0 };
    this.scrollTop = 0;
    this.scrollTopWithOutOffset = 0;
    this.scrollTopAfterOffset = 0;
    this.viewportOffset = 0;
    this.anchorScrollTop = 0;
  }

  scrollToIndex(index: number, behavior?: ScrollBehavior): void {
    const _index = Math.min(Math.max(index, 0), this.contentLength - 1);
    if (_index !== this._scrolledIndex) {
      const scrollTop = this.calcInitialPosition(_index);
      this._scrollToIndex = _index;
      this.scrollTo(scrollTop, behavior);
    }
  }

  private scrollTo(scrollTo: number, behavior?: ScrollBehavior): void {
    this.viewport!.scrollTo(this.viewportOffset + scrollTo, behavior);
  }

  /**
   * starts the subscriptions that maintain the virtualItems array on changes
   * to the underlying dataset
   * @internal
   */
  private maintainVirtualItems(): void {
    // reset virtual viewport when opposite orientation to the scroll direction
    // changes, as we have to expect dimension changes for all items when this
    // happens. This could also be configurable as it maybe costs performance
    this.viewport!.containerRect$.pipe(
      map(({ width }) => width),
      distinctUntilChanged(),
      filter(() => this.renderedRange.end > 0 && this._virtualItems.length > 0),
      this.until$(),
    ).subscribe(() => {
      // reset because we have no idea how items will behave
      let i = 0;
      while (i < this.renderedRange.start) {
        this._virtualItems[i].cached = false;
        i++;
      }
      i = this.renderedRange.end;
      while (i < this.contentLength - 1) {
        this._virtualItems[i].cached = false;
        i++;
      }
    });

    // synchronises the values with the virtual viewport we've built up
    // it might get costy when having > 100k elements, it's still faster than
    // the IterableDiffer approach, especially on move operations
    const itemCache = new Map<any, { item: T; index: number }>();
    const trackBy = this.viewRepeater!._trackBy ?? ((i, item) => item);
    this.renderedRange$
      .pipe(pairwise(), this.until$())
      .subscribe(([oldRange, newRange]) => {
        for (let i = oldRange.start; i < oldRange.end; i++) {
          if (i < newRange.start || i >= newRange.end) {
            this._virtualItems[i].position = undefined;
          }
        }
      });
    this.viewRepeater!.values$.pipe(
      this.until$(),
      tap((values) => {
        const existingIds = new Set<any>();
        let size = 0;
        const dataLength = values.length;
        const virtualItems = new Array<VirtualViewItem>(dataLength);
        for (let i = 0; i < dataLength; i++) {
          const item = values[i];
          const id = trackBy(i, item);
          const cachedItem = itemCache.get(id);
          if (cachedItem === undefined) {
            // add
            virtualItems[i] = { size: 0 };
            itemCache.set(id, { item: values[i], index: i });
          } else if (cachedItem.index !== i) {
            // move
            virtualItems[i] = this._virtualItems[cachedItem.index];
            virtualItems[i].position = undefined;
            itemCache.set(id, { item: values[i], index: i });
          } else {
            // update
            // todo: properly determine update (Object.is?)
            virtualItems[i] = this._virtualItems[i];
            // if index is not part of rendered range, remove cache
            if (
              !this.withResizeObserver ||
              i < this.renderedRange.start ||
              i >= this.renderedRange.end
            ) {
              virtualItems[i].cached = false;
            }
            itemCache.set(id, { item: values[i], index: i });
          }
          existingIds.add(id);
          size += virtualItems[i].size || this.tombstoneSize;
        }
        this._virtualItems = virtualItems;
        // sync delete operations
        if (itemCache.size > dataLength) {
          itemCache.forEach((v, k) => {
            if (!existingIds.has(k)) {
              itemCache.delete(k);
            }
          });
        }
        existingIds.clear();
        if (dataLength < this._renderedRange.end) {
          const rangeDiff = this._renderedRange.end - this._renderedRange.start;
          const anchorDiff = this.anchorItem.index - this._renderedRange.start;
          this._renderedRange.end = Math.min(
            dataLength,
            this._renderedRange.end,
          );
          this._renderedRange.start = Math.max(
            0,
            this._renderedRange.end - rangeDiff,
          );
          // this.anchorItem.offset = 0;
          this.anchorItem.index = Math.max(
            0,
            this._renderedRange.start + anchorDiff,
          );
        }
        this.contentLength = dataLength;
        this.contentSize = size;
      }),
      finalize(() => itemCache.clear()),
    ).subscribe();
  }

  /**
   * listen to triggers that should change the renderedRange
   * @internal
   */
  private calcRenderedRange(): void {
    let removeScrollAnchorOnNextScroll = false;
    const onlyTriggerWhenStable =
      <A>() =>
      (o$: Observable<A>) =>
        o$.pipe(
          filter(
            () =>
              this.renderedRange.end === 0 ||
              (this.scrollTop === this.anchorScrollTop &&
                this._scrollToIndex === null),
          ),
        );
    combineLatest([
      this.viewport!.containerRect$.pipe(
        map(({ height }) => {
          this.containerSize = height;
          return height;
        }),
        distinctUntilChanged(),
        onlyTriggerWhenStable(),
      ),
      this.viewport!.elementScrolled$.pipe(
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
            scrollTopWithOutOffset > this.scrollTopWithOutOffset
              ? 'down'
              : 'up';
          this.scrollTopWithOutOffset = scrollTopWithOutOffset;
          this.scrollTopAfterOffset = scrollTopAfterOffset;
          this.scrollTop = scrollTop;
          if (removeScrollAnchorOnNextScroll) {
            this._scrollToIndex = null;
            removeScrollAnchorOnNextScroll = false;
          } else {
            removeScrollAnchorOnNextScroll = this._scrollToIndex !== null;
          }
        }),
      ),
      this._contentSize$.pipe(distinctUntilChanged(), onlyTriggerWhenStable()),
      this.recalculateRange$.pipe(onlyTriggerWhenStable(), startWith(void 0)),
    ])
      .pipe(
        // make sure to not over calculate things by coalescing all triggers to the next microtask
        debounce(() => unpatchedMicroTask()),
        map(() => {
          const range = { start: 0, end: 0 };
          const delta = this.scrollTop - this.anchorScrollTop;
          if (this.scrollTop == 0) {
            this.anchorItem = { index: 0, offset: 0 };
          } else {
            this.anchorItem = this.calculateAnchoredItem(
              this.anchorItem,
              delta,
            );
          }
          this.anchorScrollTop = this.scrollTop;
          this.scrolledIndex = this.anchorItem.index;
          this.lastScreenItem = this.calculateAnchoredItem(
            this.anchorItem,
            calculateVisibleContainerSize(
              this.containerSize,
              this.scrollTopWithOutOffset,
              this.scrollTopAfterOffset,
            ),
          );
          const addIndexAtEnd = this.lastScreenItem.offset > 0 ? 1 : 0;
          if (this.direction === 'up') {
            range.start = Math.max(0, this.anchorItem.index - this.runwayItems);
            range.end = Math.min(
              this.contentLength,
              this.lastScreenItem.index +
                this.runwayItemsOpposite +
                addIndexAtEnd,
            );
          } else {
            range.start = Math.max(
              0,
              this.anchorItem.index - this.runwayItemsOpposite,
            );
            range.end = Math.min(
              this.contentLength,
              this.lastScreenItem.index + this.runwayItems + addIndexAtEnd,
            );
          }
          if (this.appendOnly) {
            range.start = Math.min(this.renderedRange.start, range.start);
            range.end = Math.max(this.renderedRange.end, range.end);
          }
          return range;
        }),
      )
      .pipe(
        distinctUntilChanged(
          ({ start: prevStart, end: prevEnd }, { start, end }) =>
            prevStart === start && prevEnd === end,
        ),
        this.until$(),
      )
      .subscribe((range: ListRange) => (this.renderedRange = range));
  }

  /**
   * position elements after they are created/updated/moved or their dimensions
   * change from other sources
   * @internal
   */
  private positionElements(): void {
    const viewsToObserve$ = new Subject<
      EmbeddedViewRef<RxVirtualForViewContext<T>>
    >();
    const positionByIterableChange$ = this.viewRepeater!.renderingStart$.pipe(
      switchMap((batchedUpdates) => {
        // initialIndex tells us what will be the first index to be change detected
        // if it's not the first one, we maybe have to adjust the position
        // of all items in the viewport before this index
        const initialIndex = batchedUpdates.size
          ? Array.from(batchedUpdates).sort()[0] + this.renderedRange.start
          : this.renderedRange.start;
        let scrollToAnchorPosition: number | null = null;
        return this.viewRepeater!.viewsRendered$.pipe(
          map((views) => {
            const toPosition = new Array<{
              view: EmbeddedViewRef<RxVirtualForViewContext<T>>;
              position: number;
            }>();
            let position = 0;
            let i = 0;
            for (i; i < views.length; i++) {
              const view = views[i];
              const itemIndex = view.context.index;
              const viewIndex = itemIndex - this.renderedRange.start;
              const [, sizeDiff] = this.updateElementSize(view, itemIndex);
              const virtualItem = this._virtualItems[itemIndex];

              // before positioning the first view of this batch, calculate the
              // anchorScrollTop & initial position of the view
              if (itemIndex === initialIndex) {
                this.calcAnchorScrollTop();
                position = this.calcInitialPosition(itemIndex);

                // if we receive a partial update and the current views position is
                // new, we can safely assume that all positions from views before the current
                // index are also off. We need to adjust them
                if (
                  initialIndex > this.renderedRange.start &&
                  virtualItem.position !== position
                ) {
                  let beforePosition = position;
                  let i = initialIndex - 1;
                  while (i >= this.renderedRange.start) {
                    const view = this.getViewRef(i - this.renderedRange.start);
                    const virtualItem = this._virtualItems[i];
                    beforePosition -= virtualItem.size;
                    virtualItem.position = beforePosition;
                    toPosition.push({ view, position: beforePosition });
                    i--;
                  }
                }
              } else if (itemIndex < this.anchorItem.index && sizeDiff) {
                this.anchorScrollTop += sizeDiff;
              }
              const size = virtualItem.size;
              // position current element if we need to
              if (virtualItem.position !== position) {
                toPosition.push({ view, position });
                virtualItem.position = position;
              }
              if (this._scrollToIndex === itemIndex) {
                scrollToAnchorPosition = position;
              }
              position += size;
              // after positioning the actual view, we also need to position all
              // views from the current index on until either the renderedRange.end
              // is hit or we hit an index that will anyway receive an update.
              // we can derive that information from the batchedUpdates index Set
              const { position: newPosition } = this.positionUnchangedViews({
                toPosition,
                viewIndex,
                itemIndex,
                batchedUpdates,
                position,
              });
              position = newPosition;
            }
            return { toPosition };
          }),
          filter(({ toPosition }) => toPosition.length > 0),
          debounce(() => unpatchedMicroTask()),
          tap(({ toPosition }) => {
            let position = 0;
            let lastIndex = 0;
            for (let i = 0; i < toPosition.length; i++) {
              const { view, position: elementPosition } = toPosition[i];
              this.positionElement(this.getElement(view), elementPosition);
              lastIndex = view.context.index;
              position = elementPosition + this.getItemSize(lastIndex);
              // immediately activate the ResizeObserver after initial positioning
              viewsToObserve$.next(view);
            }
            this.adjustContentSize(position, lastIndex + 1);
            if (this._scrollToIndex === null) {
              this.maybeAdjustScrollPosition();
            } else if (scrollToAnchorPosition != null) {
              if (scrollToAnchorPosition !== this.anchorScrollTop) {
                if (
                  scrollToAnchorPosition >
                  this.contentSize - this.containerSize
                ) {
                  // if the anchorItemPosition is larger than the maximum scrollPos,
                  // we want to scroll until the bottom.
                  this._scrollToIndex = null;
                  this.scrollTo(this.contentSize);
                } else {
                  this._scrollToIndex = null;
                  this.scrollTo(scrollToAnchorPosition);
                }
              } else {
                this._scrollToIndex = null;
                this.maybeAdjustScrollPosition();
              }
            }
          }),
        );
      }),
    );
    const positionByResizeObserver$ = viewsToObserve$.pipe(
      filter(() => this.withResizeObserver),
      groupBy((viewRef) => viewRef),
      mergeMap((o$) =>
        o$.pipe(
          exhaustMap((viewRef) => this.observeViewSize$(viewRef)),
          filter((value) => value != null),
          tap(([index, viewIndex]) => {
            this.calcAnchorScrollTop();
            let position = this.calcInitialPosition(index);
            let viewIdx = viewIndex;
            if (this._virtualItems[index].position !== position) {
              // we want to reposition the whole viewport, when the current position has changed
              while (viewIdx > 0) {
                viewIdx--;
                position -=
                  this._virtualItems[this.getViewRef(viewIdx).context.index]
                    .size;
              }
            } else {
              // we only need to reposition everything from the next viewIndex on
              viewIdx++;
              position += this._virtualItems[index].size;
            }
            // position all views from the specified viewIndex
            while (viewIdx < this.viewRepeater!.viewContainer.length) {
              const view = this.getViewRef(viewIdx);
              const virtualItem = this._virtualItems[view.context.index];
              const element = this.getElement(view);
              virtualItem.position = position;
              this.positionElement(element, position);
              position += virtualItem.size;
              viewIdx++;
            }
            this.maybeAdjustScrollPosition();
          }),
        ),
      ),
    );
    merge(positionByIterableChange$, positionByResizeObserver$)
      .pipe(this.until$())
      .subscribe();
  }

  /** @internal */
  private adjustContentSize(position: number, start: number) {
    let newContentSize = position;
    for (let i = start; i < this._virtualItems.length; i++) {
      newContentSize += this.getItemSize(i);
    }
    this.contentSize = newContentSize;
  }

  /** @internal */
  private observeViewSize$(
    viewRef: EmbeddedViewRef<RxVirtualForViewContext<T>>,
  ) {
    const element = this.getElement(viewRef);
    return this.resizeObserver
      .observeElement(element, this.resizeObserverConfig?.options)
      .pipe(
        takeWhile((event) => event.target.isConnected),
        map((event) => {
          const index = viewRef.context.index;
          const size = Math.round(this.extractSize(event));
          const diff = size - this._virtualItems[index].size;
          if (diff !== 0) {
            this._virtualItems[index].size = size;
            this._virtualItems[index].cached = true;
            this.contentSize += diff;
            return [index, this.viewRepeater!.viewContainer.indexOf(viewRef)];
          }
          return null as unknown as [number, number];
        }),
        filter(
          (diff) =>
            diff !== null &&
            diff[0] >= this.renderedRange.start &&
            diff[0] < this.renderedRange.end,
        ),
        takeUntil(
          merge(
            this.viewRepeater!.viewsRendered$,
            this.viewRepeater!.renderingStart$,
          ).pipe(
            filter(
              () => this.viewRepeater!.viewContainer.indexOf(viewRef) === -1,
            ),
          ),
        ),
      );
  }

  /**
   * @internal
   * heavily inspired by
   *   https://github.com/GoogleChromeLabs/ui-element-samples/blob/gh-pages/infinite-scroller/scripts/infinite-scroll.js
   */
  private calculateAnchoredItem(
    initialAnchor: AnchorItem,
    delta: number,
  ): AnchorItem {
    if (delta === 0) return initialAnchor;
    delta += initialAnchor.offset;
    let i = initialAnchor.index;
    const items = this._virtualItems;
    if (delta < 0) {
      while (delta < 0 && i > 0) {
        delta += this.getItemSize(i - 1);
        i--;
      }
    } else {
      while (delta > 0 && i < items.length && this.getItemSize(i) <= delta) {
        delta -= this.getItemSize(i);
        i++;
      }
    }
    return {
      index: Math.min(i, items.length),
      offset: delta,
    };
  }

  /** @internal */
  private positionUnchangedViews({
    toPosition,
    viewIndex,
    itemIndex,
    batchedUpdates,
    position,
  }: {
    toPosition: Array<{ view: EmbeddedViewRef<any>; position: number }>;
    viewIndex: number;
    itemIndex: number;
    batchedUpdates: Set<number>;
    position: number;
  }): {
    position: number;
    lastPositionedIndex: number;
  } {
    let _viewIndex = viewIndex + 1;
    let index = itemIndex + 1;
    let lastPositionedIndex = itemIndex;
    while (!batchedUpdates.has(_viewIndex) && index < this.renderedRange.end) {
      const virtualItem = this._virtualItems[index];
      if (position !== virtualItem.position) {
        const view = this.getViewRef(_viewIndex);
        toPosition.push({ view, position });
        virtualItem.position = position;
      }
      position += virtualItem.size;
      lastPositionedIndex = index;
      index++;
      _viewIndex++;
    }
    return { position, lastPositionedIndex };
  }

  /**
   * Adjust the scroll position when the anchorScrollTop differs from
   * the actual scrollTop.
   * Trigger a range recalculation if there is empty space
   *
   * @internal
   */
  private maybeAdjustScrollPosition(): void {
    if (this.anchorScrollTop !== this.scrollTop) {
      this.scrollTo(this.anchorScrollTop);
    }
  }

  /** @internal */
  private calcAnchorScrollTop(): void {
    this.anchorScrollTop = 0;
    for (let i = 0; i < this.anchorItem.index; i++) {
      this.anchorScrollTop += this.getItemSize(i);
    }
    this.anchorScrollTop += this.anchorItem.offset;
  }

  /** @internal */
  private calcInitialPosition(start: number): number {
    // Calculate position of starting node
    let pos = this.anchorScrollTop - this.anchorItem.offset;
    let i = this.anchorItem.index;
    while (i > start) {
      const itemSize = this.getItemSize(i - 1);
      pos -= itemSize;
      i--;
    }
    while (i < start) {
      const itemSize = this.getItemSize(i);
      pos += itemSize;
      i++;
    }
    return pos;
  }

  /** @internal */
  private getViewRef(
    index: number,
  ): EmbeddedViewRef<RxVirtualForViewContext<T>> {
    return <EmbeddedViewRef<RxVirtualForViewContext<T>>>(
      this.viewRepeater!.viewContainer.get(index)!
    );
  }

  /** @internal */
  private updateElementSize(
    view: EmbeddedViewRef<any>,
    index: number,
  ): [number, number] {
    const oldSize = this.getItemSize(index);
    const isCached = this._virtualItems[index].cached;
    const size = isCached
      ? oldSize
      : this.getElementSize(this.getElement(view));
    this._virtualItems[index].size = size;
    this._virtualItems[index].cached = true;
    return [size, size - oldSize];
  }

  /** @internal */
  private getItemSize(index: number): number {
    return this._virtualItems[index].size || this.tombstoneSize;
  }
  /** @internal */
  private getElementSize(element: HTMLElement): number {
    return element.offsetHeight;
  }
  /** @internal */
  private positionElement(element: HTMLElement, scrollTop: number): void {
    element.style.position = 'absolute';
    element.style.transform = `translateY(${scrollTop}px)`;
  }
}

@NgModule({
  declarations: [AutoSizeVirtualScrollStrategy],
  exports: [AutoSizeVirtualScrollStrategy],
})
export class AutoSizeVirtualScrollStrategyModule {}
