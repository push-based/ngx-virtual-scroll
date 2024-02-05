export class RxVirtualForViewContext<T> {
  $implicit: T;

  get first(): boolean {
    return this.index === 0;
  }

  get last(): boolean {
    return this.index === this.count - 1;
  }

  get even(): boolean {
    return this.index % 2 === 0;
  }

  get odd(): boolean {
    return !this.even;
  }

  constructor(
    item: T,
    public index: number,
    public count: number,
  ) {
    this.$implicit = item;
  }
}
