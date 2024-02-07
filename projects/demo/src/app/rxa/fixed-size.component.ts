import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component } from '@angular/core';

import { DataService, Item } from '../shared/data.service';
import { DemoComponentState } from '../shared/demo-component.state';

@Component({
  selector: 'fixed-size',
  template: `
    <h3>Fixed Size Strategy</h3>
    <ng-container *ngIf="state.showViewport">
      <demo-panel
        #demoPanel
        (scrollToIndex)="viewport.scrollToIndex($event)"
        [itemAmount]="(state.items$ | async).length"
        [renderedItemsAmount]="state.renderedItems$ | async"
        [scrolledIndex]="viewport.scrolledIndexChange | async"
        [(runwayItems)]="state.runwayItems"
        [(runwayItemsOpposite)]="state.runwayItemsOpposite"
        [(templateCacheSize)]="state.viewCache"
      ></demo-panel>
      <div class="demo-list">
        <list-header></list-header>
        <rx-virtual-scroll-viewport
          #viewport
          [runwayItemsOpposite]="state.runwayItemsOpposite"
          [runwayItems]="state.runwayItems"
          [itemSize]="100"
          [initialScrollIndex]="demoPanel.initialScrollTo"
        >
          <item
            class="fixed-size"
            [index]="i"
            *rxVirtualFor="
              let item of state.dataService.items$;
              trackBy: state.dataService.trackItem;
              renderCallback: state.renderCallback$;
              templateCacheSize: state.viewCache;
              let i = index
            "
            (update)="state.dataService.updateItem(item)"
            (remove)="state.dataService.removeItem(item)"
            (moveDown)="state.dataService.moveItem(item, i, i + 1)"
            [item]="item"
          >
            <div *cdkDragPreview>{{ item.content }}</div>
          </item>
        </rx-virtual-scroll-viewport>
      </div>
    </ng-container>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
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
})
export class FixedSizeComponent {
  constructor(
    public state: DemoComponentState,
    private dataService: DataService,
  ) {}

  drop(event: CdkDragDrop<Item[]>) {
    moveItemInArray(
      this.dataService.items,
      event.previousIndex,
      event.currentIndex,
    );
    this.dataService.setItems([...this.dataService.items]);
  }
}
