import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RxResizeObserver } from '../../../../virtual-scrolling/src/lib/scroll-strategies/resize-observer';
import { RxVirtualScrollStrategy } from '../../../../virtual-scrolling/src/lib/model';
import { AutoSizeVirtualScrollStrategy } from '../../../../virtual-scrolling/src/lib/scroll-strategies/autosize-virtual-scroll-strategy';
import { FixedSizeVirtualScrollStrategy } from '../../../../virtual-scrolling/src/lib/scroll-strategies/fixed-size-virtual-scroll-strategy';
import { DataService, Item } from '../shared/data.service';
import { DemoComponentState } from '../shared/demo-component.state';

@Component({
  selector: 'dynamic-content',
  template: `
    <div>
      <h3>Autosize Dynamic Content Test</h3>
    </div>
    <ng-container *ngIf="state.showViewport">
      <demo-panel
        #demoPanel
        [(scrollStrategy)]="strategy"
        [(appendOnly)]="appendOnly"
        [itemAmount]="(state.items$ | async).length"
        [renderedItemsAmount]="state.renderedItems$ | async"
        [showWithResizeObserver]="true"
        [(withResizeObserver)]="withResizeObserver"
        [(runwayItems)]="state.runwayItems"
        [(runwayItemsOpposite)]="state.runwayItemsOpposite"
        [(templateCacheSize)]="state.viewCache"
      ></demo-panel>
      <div class="demo-list">
        <list-header></list-header>
        <list-component
          [scrollStrategy]="scrollStrategy"
          [items]="state.items$ | async"
        >
          <ng-template [dynamicTemplate]="'auto'" let-item let-index="index">
            <item [item]="item" [index]="index" class="autosize">
              <div class="item__description">
                <div class="desc-title">
                  <mat-icon>description</mat-icon> Additional Info
                </div>
                <div>{{ item.description }}</div>
              </div>
            </item>
          </ng-template>
          <ng-template [dynamicTemplate]="'fixed'" let-item let-index="index">
            <item [item]="item" [index]="index" class="fixed-size"></item>
          </ng-template>
        </list-component>
      </div>
    </ng-container>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .item {
        position: relative !important;
      }
    `,
  ],
  providers: [
    DataService,
    DemoComponentState,
    AutoSizeVirtualScrollStrategy,
    FixedSizeVirtualScrollStrategy,
    RxResizeObserver,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DynamicContentComponent {
  _appendOnly = false;
  get appendOnly() {
    return this._appendOnly;
  }
  set appendOnly(appendOnly: boolean) {
    this._appendOnly = appendOnly;
    this.fixedSizeStrategy.appendOnly = this._appendOnly;
    this.autosizeStrategy.appendOnly = this._appendOnly;
  }
  withResizeObserver = true;

  scrollStrategy: RxVirtualScrollStrategy<Item>;

  _strategy: 'fixed' | 'dynamic' | 'auto' = 'fixed';
  get strategy() {
    return this._strategy;
  }
  set strategy(strategy) {
    this._strategy = strategy;
    if (strategy === 'fixed') {
      this.scrollStrategy = this.fixedSizeStrategy;
    } else {
      this.scrollStrategy = this.autosizeStrategy;
    }
  }

  constructor(
    public state: DemoComponentState,
    private fixedSizeStrategy: FixedSizeVirtualScrollStrategy<Item>,
    private autosizeStrategy: AutoSizeVirtualScrollStrategy<Item>,
  ) {
    fixedSizeStrategy.itemSize = 100;
    autosizeStrategy.tombstoneSize = 100;
    this.scrollStrategy = autosizeStrategy;
  }
}
