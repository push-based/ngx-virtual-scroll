import { NgIterable } from '@angular/core';

export interface RxListViewComputedContext {
  index: number;
  count: number;
}

export interface RxListViewContext<T, U = RxListViewComputedContext>
  extends RxListViewComputedContext {
  $implicit: T;
  updateContext(newProps: Partial<U>): void;
}

export class RxDefaultListViewContext<
  T,
  U extends NgIterable<T> = NgIterable<T>,
  K = keyof T,
> implements RxListViewContext<T>
{
  private _$implicit: T;

  private context: RxListViewComputedContext = {
    count: -1,
    index: -1,
  };

  set $implicit($implicit: T) {
    this._$implicit = $implicit;
  }

  get $implicit(): T {
    return this._$implicit;
  }

  get index(): number {
    return this.context.index;
  }

  get count(): number {
    return this.context.count;
  }

  get first(): boolean {
    return this.context.index === 0;
  }

  get last(): boolean {
    return this.context.index === this.context.count - 1;
  }

  get even(): boolean {
    return this.context.index % 2 === 0;
  }

  get odd(): boolean {
    return !this.even;
  }

  constructor(item: T, customProps?: { count: number; index: number }) {
    this.$implicit = item;
    if (customProps) {
      this.updateContext(customProps);
    }
  }

  updateContext(newProps: RxListViewComputedContext): void {
    this.context = newProps;
  }
}
