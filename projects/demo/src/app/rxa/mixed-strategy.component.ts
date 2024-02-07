import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RxVirtualScrollStrategy } from '../../../../virtual-scrolling/src/lib/model';
import { AutoSizeVirtualScrollStrategy } from '../../../../virtual-scrolling/src/lib/scroll-strategies/autosize-virtual-scroll-strategy';
import { FixedSizeVirtualScrollStrategy } from '../../../../virtual-scrolling/src/lib/scroll-strategies/fixed-size-virtual-scroll-strategy';
import { RxaResizeObserver } from '../../../../virtual-scrolling/src/lib/scroll-strategies/resize-observer';
import { DataService, Item } from '../shared/data.service';
import { DemoComponentState } from '../shared/demo-component.state';

@Component({
  selector: 'auto-size',
  template: `
    <div>
      <h3>Autosize Strategy</h3>
    </div>
    <ng-container *ngIf="state.showViewport">
      <demo-panel
        #demoPanel
        (scrollToIndex)="viewport.scrollToIndex($event)"
        [(scrollStrategy)]="strategy"
        [itemAmount]="(state.items$ | async).length"
        [renderedItemsAmount]="state.renderedItems$ | async"
        [scrolledIndex]="viewport.scrolledIndexChange | async"
        [showWithResizeObserver]="true"
        [(withResizeObserver)]="withResizeObserver"
        [(runwayItems)]="state.runwayItems"
        [(runwayItemsOpposite)]="state.runwayItemsOpposite"
        [(templateCacheSize)]="state.viewCache"
      ></demo-panel>
      <div class="demo-list">
        <list-header></list-header>
        <rx-virtual-scroll-viewport
          [scrollStrategy]="scrollStrategy"
          [initialScrollIndex]="demoPanel.initialScrollTo"
          #viewport
        >
          <item
            [class.autosize]="strategy === 'auto'"
            [class.fixed-size]="strategy === 'fixed'"
            *rxVirtualFor="
              let item of state.dataService.items$;
              renderCallback: state.renderCallback$;
              templateCacheSize: state.viewCache;
              trackBy: state.dataService.trackItem;
              let i = index
            "
            [index]="i"
            (update)="state.dataService.updateItem(item)"
            (remove)="state.dataService.removeItem(item)"
            (moveDown)="state.dataService.moveItem(item, i, i + 1)"
            [item]="item"
          >
            <div
              class="item__description"
              *ngIf="strategy === 'auto' && item.description"
            >
              <div class="desc-title">
                <mat-icon>description</mat-icon> Additional Info
              </div>
              <div>{{ item.description }}</div>
            </div>
          </item>
        </rx-virtual-scroll-viewport>
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
    `,
  ],
  providers: [
    DataService,
    DemoComponentState,
    FixedSizeVirtualScrollStrategy,
    AutoSizeVirtualScrollStrategy,
    RxaResizeObserver,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MixedStrategyComponent {
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
    private resizeObserver: RxaResizeObserver,
    private fixedSizeStrategy: FixedSizeVirtualScrollStrategy<Item>,
    private autosizeStrategy: AutoSizeVirtualScrollStrategy<Item>,
  ) {
    fixedSizeStrategy.itemSize = 100;
    autosizeStrategy.tombstoneSize = 100;
    this.scrollStrategy = fixedSizeStrategy;
  }
}
