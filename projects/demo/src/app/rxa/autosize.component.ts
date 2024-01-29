import { ChangeDetectionStrategy, Component } from '@angular/core';
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
        [itemAmount]="(state.items$ | async).length"
        [renderedItemsAmount]="state.renderedItems$ | async"
        [scrolledIndex]="viewport.scrolledIndexChange | async"
        [withStableScrollbar]="true"
        [(stableScrollbar)]="stableScrollbar"
        [(runwayItems)]="state.runwayItems"
        [(runwayItemsOpposite)]="state.runwayItemsOpposite"
        [(templateCacheSize)]="state.viewCache"
      ></demo-panel>
      <div class="demo-list">
        <list-header></list-header>
        <rx-virtual-scroll-viewport
          [runwayItems]="state.runwayItems"
          [runwayItemsOpposite]="state.runwayItemsOpposite"
          [withSyncScrollbar]="stableScrollbar"
          [tombstoneSize]="100"
          autosize
          #viewport
        >
          <item
            class="autosize"
            *rxVirtualFor="
              let item of state.dataService.items$;
              renderCallback: state.renderCallback$;
              templateCacheSize: state.viewCache;
              trackBy: state.dataService.trackItem;
              let i = index
            "
            (update)="state.dataService.updateItem(item)"
            (remove)="state.dataService.removeItem(item)"
            (moveDown)="state.dataService.moveItem(item, i, i + 1)"
            [item]="item"
          >
            <div class="item__description" *ngIf="item.description">
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
  providers: [DataService, DemoComponentState],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutosizeComponent {
  stableScrollbar = true;
  trackItem = (i: number, item: Item) => item.id;
  constructor(public state: DemoComponentState) {}
}
