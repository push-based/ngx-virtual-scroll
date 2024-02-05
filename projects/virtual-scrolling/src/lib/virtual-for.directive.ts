import {
  Directive,
  DoCheck,
  EmbeddedViewRef,
  ErrorHandler,
  Inject,
  Input,
  IterableDiffer,
  NgModule,
  NgZone,
  OnDestroy,
  OnInit,
  Optional,
  TemplateRef,
  TrackByFunction,
  ViewContainerRef,
} from '@angular/core';
import {
  isObservable,
  Observable,
  ReplaySubject,
  Subject,
  of,
  combineLatest,
} from 'rxjs';
import {
  shareReplay,
  switchMap,
  takeUntil,
  catchError,
  switchAll,
} from 'rxjs/operators';
import { RxVirtualForViewContext } from './list-view-context';

import { RxVirtualScrollStrategy, RxVirtualViewRepeater } from './model';
import { reconcile } from './reconciliation/list-reconciliation';
import { LiveCollectionLContainerImpl } from './reconciliation/rx-live-collection';
import { coerceObservable } from './util';
import {
  DEFAULT_TEMPLATE_CACHE_SIZE,
  RX_VIRTUAL_SCROLL_DEFAULT_OPTIONS,
  RxVirtualScrollDefaultOptions,
} from './virtual-scroll.config';

/**
 * @description Will be provided through Terser global definitions by Angular CLI
 * during the production build.
 */
declare const ngDevMode: boolean;

const NG_DEV_MODE = typeof ngDevMode === 'undefined' || !!ngDevMode;

/**
 * @Directive RxVirtualFor
 *
 * @description
 *
 * The `*rxVirtualFor` structural directive provides a convenient and performant
 * way for rendering huge lists of items. It brings all the benefits `rxFor` does,
 * and implements virtual rendering.
 *
 * Instead of rendering every item provided, rxVirtualFor only renders what is
 * currently visible to the user, thus providing excellent runtime performance
 * for huge sets of data.
 *
 * The technique to render items is comparable to the on used by twitter and
 * explained in very much detail by @DasSurma in his blog post about the [complexities
 * of infinite scrollers](https://developer.chrome.com/blog/infinite-scroller/).
 *
 * "Each recycling of a DOM element would normally relayout the entire runway which
 * would bring us well below our target of 60 frames per second.
 * To avoid this, we are taking the burden of layout onto ourselves and use
 * absolutely positioned elements with transforms." (@DasSurma)
 *
 * ## API
 * The API is a combination of \@rx-angular/template/for &
 *  \@angular/cdk `*cdkVirtualFor`.
 * * trackBy: `(index: number, item: T) => any` | `keyof T`
 * * strategy: `string` | `Observable<string>`
 * * parent: `boolean`;
 * * renderCallback: `Subject<T[]>`
 * * viewCache: `number`
 * * (Injected) scrollStrategy: `RxVirtualScrollStrategy<T, U>`
 * * provides itself as RxVirtualViewRepeater for RxVirtualViewPortComponent to operate
 *
 * ## Features
 * * Push based architecture
 * * Comprehensive set of context variables
 * * Opt-out of `NgZone` with `patchZone`
 * * Notify when rendering of child templates is finished (`renderCallback`)
 * * Super efficient layouting with css transformations
 * * Define a viewCache in order to re-use views instead of re-creating them
 * * Configurable RxVirtualScrollStrategy<T, U> providing the core logic to calculate the viewRange and position DOM
 * Nodes
 *
 * ### Context Variables
 *
 * The following context variables are available for each template:
 *
 * - $implicit: `T` // the default variable accessed by `let val`
 * - item$: `Observable<T>` // the same value as $implicit, but as `Observable`
 * - index: `number` // current index of the item
 * - count: `number` // count of all items in the list
 * - first: `boolean` // true if the item is the first in the list
 * - last: `boolean` // true if the item is the last in the list
 * - even: `boolean` // true if the item has on even index (index % 2 === 0)
 * - odd: `boolean` // the opposite of even
 * - index$: `Observable<number>` // index as `Observable`
 * - count$: `Observable<number>` // count as `Observable`
 * - first$: `Observable<boolean>` // first as `Observable`
 * - last$: `Observable<boolean>` // last as `Observable`
 * - even$: `Observable<boolean>` // even as `Observable`
 * - odd$: `Observable<boolean>` // odd as `Observable`
 * - select: `(keys: (keyof T)[], distinctByMap) => Observable<Partial<T>>`
 * // returns a selection function which
 * // accepts an array of properties to pluck out of every list item. The function returns the selected properties of
 * // the current list item as distinct `Observable` key-value-pair. See the example below:
 *
 * This example showcases the `select` view-context function used for deeply nested lists.
 *
 *  ```html
 * <rx-virtual-scroll-viewport>
 *   <div
 *    autosized
 *    *rxVirtualFor="let hero of heroes$; trackBy: trackItem; let select = select;">
 *     <div>
 *       <strong>{{ hero.name }}</strong></br>
 *       Defeated enemies:
 *     </div>
 *      <span *rxFor="let enemy of select(['defeatedEnemies']); trackBy: trackEnemy;">
 *        {{ enemy.name }}
 *      </span>
 *   </div>
 * </rx-virtual-scroll-viewport>
 *  ```
 *
 * ### Using the context variables
 *
 * ```html
 * <rx-virtual-scroll-viewport>
 *  <div
 *     *rxVirtualFor="
 *       let item of observableItems$;
 *       let count = count;
 *       let index = index;
 *       let first = first;
 *       let last = last;
 *       let even = even;
 *       let odd = odd;
 *       trackBy: trackItem;
 *     "
 *   >
 *     <div>{{ count }}</div>
 *     <div>{{ index }}</div>
 *     <div>{{ item }}</div>
 *     <div>{{ first }}</div>
 *     <div>{{ last }}</div>
 *     <div>{{ even }}</div>
 *     <div>{{ odd }}</div>
 *   </div>
 * </rx-virtual-scroll-viewport>
 * ```
 *
 * @docsCategory RxVirtualFor
 * @docsPage RxVirtualFor
 * @publicApi
 */
@Directive({
  selector: '[rxVirtualFor][rxVirtualForOf]',
  providers: [{ provide: RxVirtualViewRepeater, useExisting: RxVirtualFor }],
})
export class RxVirtualFor<T, U extends Array<T> = Array<T>>
  implements RxVirtualViewRepeater<T>, OnInit, DoCheck, OnDestroy
{
  /** @internal */
  private _differ?: IterableDiffer<T>;

  /** @internal */
  private staticValue?: U;
  /** @internal */
  private renderStatic = false;

  /**
   * @description
   * The iterable input
   *
   * @example
   * <rx-virtual-scroll-viewport>
   *   <app-hero *rxVirtualFor="heroes$; let hero"
   *     [hero]="hero"></app-hero>
   * </rx-virtual-scroll-viewport>
   *
   * @param potentialObservable
   */
  @Input()
  set rxVirtualForOf(
    potentialObservable:
      | Observable<U | undefined | null>
      | U
      | null
      | undefined,
  ) {
    if (!isObservable(potentialObservable)) {
      this.staticValue = potentialObservable;
      this.renderStatic = true;
    } else {
      this.staticValue = undefined;
      this.renderStatic = false;
      this.observables$.next(potentialObservable);
    }
  }

  /**
   * @internal
   * A reference to the template that is created for each item in the iterable.
   * @see [template reference variable](guide/template-reference-variables)
   * (inspired by @angular/common `ng_for_of.ts`)
   */
  private _template?: TemplateRef<RxVirtualForViewContext<T>>;
  @Input()
  set rxVirtualForTemplate(value: TemplateRef<RxVirtualForViewContext<T>>) {
    this._template = value;
  }

  /**
   * @description
   * Controls the amount if views held in cache for later re-use when a user is
   * scrolling the list. If this is set to 0, `rxVirtualFor` won't cache any view,
   * thus destroying & re-creating very often on scroll events.
   */
  @Input('rxVirtualForTemplateCacheSize') templateCacheSize =
    this.defaults?.templateCacheSize || DEFAULT_TEMPLATE_CACHE_SIZE;

  /*@Input('rxVirtualForTombstone') tombstone: TemplateRef<
   RxVirtualForViewContext<T>
   > | null = null;*/

  /**
   * @description
   * A function or key that defines how to track changes for items in the provided
   * iterable data.
   *
   * When items are added, moved, or removed in the iterable,
   * the directive must re-render the appropriate DOM nodes.
   * To minimize operations on the DOM, only nodes that have changed
   * are re-rendered.
   *
   * By default, `rxVirtualFor` assumes that the object instance identifies
   * the node in the iterable (equality check `===`).
   * When a function or key is supplied, `rxVirtualFor` uses the result to identify the item node.
   *
   * @example
   * \@Component({
   *   selector: 'app-root',
   *   template: `
   *    <rx-virtual-scroll-viewport>
   *      <app-list-item
   *        *rxVirtualFor="
   *          let item of items$;
   *          trackBy: 'id';
   *        "
   *        autosized
   *        [item]="item"
   *      >
   *      </app-list-item>
   *    </rx-virtual-scroll-viewport>
   *   `
   * })
   * export class AppComponent {
   *   items$ = itemService.getItems();
   * }
   *
   * // OR
   *
   * \@Component({
   *   selector: 'app-root',
   *   template: `
   *   <rx-virtual-scroll-viewport>
   *      <app-list-item
   *        *rxVirtualFor="
   *          let item of items$;
   *          trackBy: trackItem;
   *        "
   *        autosized
   *        [item]="item"
   *      >
   *      </app-list-item>
   *    </rx-virtual-scroll-viewport>
   *   `
   * })
   * export class AppComponent {
   *   items$ = itemService.getItems();
   *   trackItem = (idx, item) => item.id;
   * }
   *
   * @param trackByFnOrKey
   */
  @Input('rxVirtualForTrackBy')
  set trackBy(trackByFnOrKey: keyof T | TrackByFunction<T>) {
    if (
      NG_DEV_MODE &&
      trackByFnOrKey != null &&
      typeof trackByFnOrKey !== 'string' &&
      typeof trackByFnOrKey !== 'symbol' &&
      typeof trackByFnOrKey !== 'function'
    ) {
      throw new Error(
        `trackBy must be typeof function or keyof T, but received ${JSON.stringify(
          trackByFnOrKey,
        )}.`,
      );
    }
    if (trackByFnOrKey == null) {
      this._trackBy = null;
    } else {
      this._trackBy =
        typeof trackByFnOrKey !== 'function'
          ? (i, a) => a[trackByFnOrKey]
          : trackByFnOrKey;
    }
  }

  /**
   * @description
   * A `Subject` which emits whenever `*rxVirtualFor` finished rendering a
   * set of changes to the view.
   * This enables developers to perform actions exactly at the timing when the
   * updates passed are rendered to the DOM.
   * The `renderCallback` is useful in situations where you rely on specific DOM
   * properties like the `height` of a table after all items got rendered.
   * It is also possible to use the renderCallback in order to determine if a
   * view should be visible or not. This way developers can hide a list as
   * long as it has not finished rendering.
   *
   * The result of the `renderCallback` will contain the currently rendered set
   * of items in the iterable.
   *
   * @example
   * \@Component({
   *   selector: 'app-root',
   *   template: `
   *    <rx-virtual-scroll-viewport>
   *      <app-list-item
   *        *rxVirtualFor="
   *          let item of items$;
   *          trackBy: trackItem;
   *          renderCallback: itemsRendered;
   *        "
   *        autosized
   *        [item]="item"
   *      >
   *      </app-list-item>
   *    </rx-virtual-scroll-viewport>
   *   `
   * })
   * export class AppComponent {
   *   items$: Observable<Item[]> = itemService.getItems();
   *   trackItem = (idx, item) => item.id;
   *   // this emits whenever rxVirtualFor finished rendering changes
   *   itemsRendered = new Subject<Item[]>();
   * }
   *
   * @param renderCallback
   */
  @Input('rxVirtualForRenderCallback') set renderCallback(
    renderCallback: Subject<U>,
  ) {
    this._renderCallback = renderCallback;
  }

  /** @internal */
  readonly viewsRendered$ = new Subject<
    EmbeddedViewRef<RxVirtualForViewContext<T>>[]
  >();
  /** @internal */
  readonly viewRendered$ = new Subject<{
    view: EmbeddedViewRef<RxVirtualForViewContext<T>>;
    index: number;
    item: T;
  }>();
  /** @internal */
  readonly renderingStart$ = new Subject<Set<number>>();

  /** @internal */
  private get template(): TemplateRef<RxVirtualForViewContext<T>> {
    return this._template || this.templateRef;
  }

  /** @internal */
  private observables$ = new ReplaySubject<
    Observable<U | null | undefined> | U | null | undefined
  >(1);

  /** @internal */
  private _renderCallback?: Subject<U>;

  /** @internal */
  readonly values$ = this.observables$.pipe(
    coerceObservable(),
    switchAll(),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  /** @internal */
  private _destroy$ = new Subject<void>();

  private liveCollection?: LiveCollectionLContainerImpl<T>;

  /** @internal */
  _trackBy: TrackByFunction<T> | null = null;

  /** @internal */
  static ngTemplateContextGuard<T, U extends Array<T> = Array<T>>(
    dir: RxVirtualFor<T, U>,
    ctx: any,
  ): ctx is RxVirtualForViewContext<T> {
    return true;
  }

  constructor(
    private readonly scrollStrategy: RxVirtualScrollStrategy<T>,
    private readonly templateRef: TemplateRef<RxVirtualForViewContext<T>>,
    private readonly ngZone: NgZone,
    readonly viewContainer: ViewContainerRef,
    private readonly errorHandler: ErrorHandler,
    @Inject(RX_VIRTUAL_SCROLL_DEFAULT_OPTIONS)
    @Optional()
    private readonly defaults?: RxVirtualScrollDefaultOptions,
  ) {}

  /** @internal */
  ngOnInit() {
    this.liveCollection = new LiveCollectionLContainerImpl(
      this.viewContainer,
      this.template,
      this.templateCacheSize,
    );
    Promise.resolve().then(() => {
      this.render()
        .pipe(takeUntil(this._destroy$))
        .subscribe((v) => {
          this._renderCallback?.next(v as U);
        });
    });
  }

  /** @internal */
  ngDoCheck() {
    if (this.renderStatic) {
      this.observables$.next(this.staticValue);
    }
  }

  /** @internal */
  ngOnDestroy() {
    this._destroy$.next();
    this.liveCollection?.teardown();
  }

  private render() {
    return combineLatest([
      this.values$,
      this.scrollStrategy.renderedRange$,
    ]).pipe(
      // map iterable to latest diff
      switchMap(([items, range]) => {
        return this.ngZone.run(() => {
          const iterable = items.slice(range.start, range.end);
          this.liveCollection.reset(items.length, range.start);
          reconcile(
            this.liveCollection,
            iterable,
            this._trackBy as TrackByFunction<unknown>,
          );
          this.liveCollection.updateIndexes();
          const updates = Array.from(this.liveCollection.viewsUpdated).sort(
            (a, b) => a[1] - b[1],
          );
          const indicesToPosition = new Set(
            Array.from(this.liveCollection.updatedIndices).sort(),
          );
          this.renderingStart$.next(indicesToPosition);
          const viewsRendered = new Array<
            EmbeddedViewRef<RxVirtualForViewContext<T>>
          >(indicesToPosition.size);
          for (let i = 0; i < updates.length; i++) {
            const [view, index] = updates[i];
            view.detectChanges();
            if (index !== -1) {
              this.viewRendered$.next({
                view,
                index,
                item: view.context.$implicit,
              } as any);
              viewsRendered.push(view as any);
            }
          }

          // this.templateManager.setItemCount(items.length);
          this.viewsRendered$.next(viewsRendered);
          return of(iterable);
        });
      }),
      catchError((err: Error) => {
        this.errorHandler.handleError(err);
        return of(null);
      }),
    );
  }
}

@NgModule({
  declarations: [RxVirtualFor],
  exports: [RxVirtualFor],
})
export class RxVirtualForModule {}
