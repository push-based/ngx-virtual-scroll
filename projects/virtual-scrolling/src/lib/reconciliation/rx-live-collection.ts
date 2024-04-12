import { EmbeddedViewRef, TemplateRef, ViewContainerRef } from '@angular/core';
import { RxVirtualForViewContext } from '../list-view-context';
import { LiveCollection } from './list-reconciliation';

type View<T> = EmbeddedViewRef<RxVirtualForViewContext<T>>;

export class LiveCollectionLContainerImpl<T> extends LiveCollection<
  View<T>,
  T
> {
  /**
   Property indicating if indexes in the repeater context need to be updated following the live
   collection changes. Index updates are necessary if and only if views are inserted / removed in
   the middle of LContainer. Adds and removals at the end don't require index updates.
   */
  private needsIndexUpdate = false;

  updatedIndices = new Set<number>();
  viewsUpdated = new Map<View<T>, number>();

  private startRange = 0;
  private viewCache = new Array<View<T>>();
  private itemCount = 0;

  constructor(
    private viewContainer: ViewContainerRef,
    private templateRef: TemplateRef<RxVirtualForViewContext<T>>,
    private templateCacheSize = 0,
  ) {
    super();
  }

  override get length(): number {
    return this.viewContainer.length;
  }
  override at(index: number): T {
    return this.getView(index).context.$implicit;
  }
  override attach(index: number, view: View<T>): void {
    this.needsIndexUpdate ||= index !== this.length;
    this.viewContainer.insert(view, index);
    this.viewsUpdated.set(view, index);
    this.updatedIndices.add(index);
  }
  override detach(index: number): View<T> {
    this.needsIndexUpdate ||= index !== this.length - 1;
    return this.viewContainer.detach(index) as View<T>;
  }
  override create(index: number, value: T): View<T> {
    const cachedView = this.viewCache.pop();
    if (cachedView) {
      cachedView.context.$implicit = value;
      cachedView.context.index = this.startRange + index;
      cachedView.context.count = this.itemCount;
      return cachedView;
    }
    return this.templateRef.createEmbeddedView(
      new RxVirtualForViewContext(
        value,
        this.startRange + index,
        this.itemCount,
      ),
    );
  }

  override destroy(view: View<T>): void {
    this.detachAndCacheView(view);
    this.viewsUpdated.set(view, -1);
  }

  override updateValue(index: number, value: T): void {
    const view = this.getView(index);
    view.context.$implicit = value;
    view.context.index = this.startRange + index;
    view.context.count = this.itemCount;
    this.viewsUpdated.set(view, index);
    this.updatedIndices.add(index);
  }

  reset(itemCount: number, startRange: number) {
    this.itemCount = itemCount;
    this.startRange = startRange;
    this.needsIndexUpdate = false;
    this.viewsUpdated.clear();
    this.updatedIndices.clear();
  }

  teardown() {
    this.viewsUpdated.clear();
    this.updatedIndices.clear();
    this.viewCache.forEach((c) => c.destroy());
    this.viewCache = null;
  }

  updateIndexes() {
    if (this.needsIndexUpdate) {
      // console.log('live-coll: updateIndexes');
      for (let i = 0; i < this.length; i++) {
        const view = this.getView(i);
        const index = this.startRange + i;
        if (
          index !== view.context.index ||
          view.context.count !== this.itemCount
        ) {
          view.context.index = index;
          view.context.count = this.itemCount;
          this.viewsUpdated.set(view, i);
          this.updatedIndices.add(i);
        }
      }
    }
  }

  private getView(index: number): View<T> {
    return this.viewContainer.get(index) as View<T>;
  }

  /** Detaches the view at the given index and inserts into the view cache. */
  private detachAndCacheView(view: View<T>) {
    const index = this.viewContainer.indexOf(view);
    const detachedView =
      index !== -1 ? <View<T>>this.viewContainer.detach(index) : view;

    if (this.viewCache.length < this.templateCacheSize) {
      this.viewCache.push(detachedView);
      return true;
    } else {
      // The host component could remove views from the container outside of
      // the view repeater. It's unlikely this will occur, but just in case,
      // destroy the view on its own, otherwise destroy it through the
      // container to ensure that all the references are removed.
      if (index === -1) {
        detachedView.destroy();
      } else {
        this.viewContainer.remove(index);
      }
      return false;
    }
  }
}
