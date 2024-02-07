import {
  Directive,
  ElementRef,
  EmbeddedViewRef,
  TrackByFunction,
  ViewContainerRef,
} from '@angular/core';
import { Observable } from 'rxjs';
import { RxVirtualForViewContext } from './list-view-context';

export interface ListRange {
  start: number;
  end: number;
}

/**
 * @Directive RxVirtualScrollStrategy
 *
 * @description
 * Abstract implementation for the actual implementations of the ScrollStrategies
 * being consumed by `*rxVirtualFor` and `rx-virtual-scroll-viewport`.
 *
 * This is one of the core parts for the virtual scrolling implementation. It has
 * to determine the `ListRange` being rendered to the DOM as well as managing
 * the layouting task for the `*rxVirtualFor` directive.
 *
 * @docsCategory RxVirtualFor
 * @docsPage RxVirtualFor
 * @publicApi
 */
@Directive()
export abstract class RxVirtualScrollStrategy<T> {
  /** Emits when the index of the first element visible in the viewport changes. */
  /** @internal */
  abstract scrolledIndex$: Observable<number>;
  /** @internal */
  abstract renderedRange$: Observable<ListRange>;
  /** @internal */
  abstract contentSize$: Observable<number>;

  /** @internal */
  private nodeIndex?: number;

  /** @internal */
  protected getElement(
    view: EmbeddedViewRef<RxVirtualForViewContext<T>>,
  ): HTMLElement {
    if (this.nodeIndex !== undefined) {
      return view.rootNodes[this.nodeIndex];
    }
    const rootNode = view.rootNodes[0];
    this.nodeIndex = rootNode instanceof HTMLElement ? 0 : 1;
    return view.rootNodes[this.nodeIndex] as HTMLElement;
  }

  /**
   * Attaches this scroll strategy to a viewport.
   * @param viewport The viewport to attach this strategy to.
   * @param viewRepeater The viewRepeater attached to the viewport.
   */
  abstract attach(
    viewport: RxVirtualScrollViewport,
    viewRepeater: RxVirtualViewRepeater<any>,
  ): void;

  /** Detaches this scroll strategy from the currently attached viewport. */
  abstract detach(): void;

  /**
   * Scroll to the offset for the given index.
   * @param index The index of the element to scroll to.
   * @param behavior The ScrollBehavior to use when scrolling.
   */
  abstract scrollToIndex(index: number, behavior?: ScrollBehavior): void;
}

/** @internal */
@Directive()
export abstract class RxVirtualScrollViewport {
  abstract elementScrolled$: Observable<void>;
  abstract containerRect$: Observable<{ height: number; width: number }>;
  abstract getScrollTop(): number;
  abstract scrollTo(scrollTo: number, behavior?: ScrollBehavior): void;
  abstract getScrollElement(): HTMLElement;
  abstract measureOffset(): number;
}

/** @internal */
@Directive()
export abstract class RxVirtualViewRepeater<T> {
  abstract values$: Observable<Array<T> | null | undefined>;
  abstract viewsRendered$: Observable<
    EmbeddedViewRef<RxVirtualForViewContext<T>>[]
  >;
  abstract viewContainer: ViewContainerRef;
  abstract renderingStart$: Observable<Set<number>>;
  abstract setScrollStrategy(scrollStrategy: RxVirtualScrollStrategy<T>);
  _trackBy: TrackByFunction<T> | null;
}

@Directive()
export abstract class RxVirtualScrollElement {
  abstract elementScrolled$: Observable<void>;
  abstract getElementRef(): ElementRef<HTMLElement>;
  abstract measureOffset(): number;
}
