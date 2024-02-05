import { EmbeddedViewRef, TemplateRef, ViewContainerRef } from '@angular/core';
import { LiveCollection } from './list-reconciliation';

type View = EmbeddedViewRef<{ $implicit: unknown; index: number }>;

export class LiveCollectionLContainerImpl extends LiveCollection<
  View,
  unknown
> {
  /**
   Property indicating if indexes in the repeater context need to be updated following the live
   collection changes. Index updates are necessary if and only if views are inserted / removed in
   the middle of LContainer. Adds and removals at the end don't require index updates.
   */
  private needsIndexUpdate = false;

  updatedIndices = new Set<number>();
  viewsUpdated = new Map<View, number>();

  private startRange = 0;
  private viewCache = new Array<View>();

  constructor(
    private viewContainer: ViewContainerRef,
    private templateRef: TemplateRef<{ $implicit: unknown; index: number }>,
    private templateCacheSize = 0,
  ) {
    super();
  }

  override get length(): number {
    return this.viewContainer.length;
  }
  override at(index: number): unknown {
    return this.getView(index).context.$implicit;
  }
  override attach(index: number, view: View): void {
    this.needsIndexUpdate ||= index !== this.length;
    this.viewContainer.insert(view, index);
    this.viewsUpdated.set(view, index);
    this.updatedIndices.add(index);
  }
  override detach(index: number): View {
    this.needsIndexUpdate ||= index !== this.length - 1;
    return this.viewContainer.detach(index) as View;
  }
  override create(index: number, value: unknown): View {
    const cachedView = this.viewCache.pop();
    if (cachedView) {
      cachedView.context.$implicit = value;
      cachedView.context.index = this.startRange + index;
      return cachedView;
    }
    return this.templateRef.createEmbeddedView({
      $implicit: value,
      index: this.startRange + index,
    });
  }

  override destroy(view: View): void {
    this.detachAndCacheView(view);
    this.viewsUpdated.set(view, -1);
  }
  override updateValue(index: number, value: unknown): void {
    const view = this.getView(index);
    view.context.$implicit = value;
    view.context.index = this.startRange + index;
    this.viewsUpdated.set(view, index);
    this.updatedIndices.add(index);
  }

  setStartRange(startRange: number) {
    this.startRange = startRange;
  }

  reset() {
    this.needsIndexUpdate = false;
    this.viewsUpdated.clear();
    this.updatedIndices.clear();
  }

  teardown() {
    this.viewsUpdated.clear();
    this.updatedIndices.clear();
    this.viewCache = null;
  }

  updateIndexes() {
    if (this.needsIndexUpdate) {
      // console.log('live-coll: updateIndexes');
      for (let i = 0; i < this.length; i++) {
        const view = this.getView(i);
        const index = this.startRange + i;
        if (index !== view.context.index) {
          view.context.index = index;
          this.viewsUpdated.set(view, i);
          this.updatedIndices.add(i);
        }
      }
    }
  }

  private getView(index: number): View {
    return this.viewContainer.get(index) as View;
  }

  /** Detaches the view at the given index and inserts into the view cache. */
  private detachAndCacheView(view: View) {
    const index = this.viewContainer.indexOf(view);
    const detachedView =
      index !== -1 ? <View>this.viewContainer.detach(index) : view;

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
