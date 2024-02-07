import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { DataService } from '../data.service';

@Component({
  selector: 'demo-panel',
  template: `
    <details #details>
      <summary>Input & Stats</summary>

      <div class="demo-panel__body">
        <div>
          <div><strong>Stats</strong></div>
          <table>
            <tr>
              <td>Items in list</td>
              <td>{{ itemAmount }}</td>
            </tr>
            <tr>
              <td>Rendered items</td>
              <td>{{ renderedItemsAmount }}</td>
            </tr>
            <tr>
              <td>ScrolledIndex</td>
              <td>{{ scrolledIndex }}</td>
            </tr>
          </table>
        </div>
        <div>
          <div><strong>Inputs</strong></div>
          <table>
            <tr>
              <td>Runway items</td>
              <td>
                <input
                  [ngModel]="runwayItems"
                  (ngModelChange)="runwayItemsChange.emit($event)"
                  type="number"
                  step="1"
                  min="0"
                />
              </td>
            </tr>
            <tr>
              <td>Runway opposite items</td>
              <td>
                <input
                  [ngModel]="runwayItemsOpposite"
                  (ngModelChange)="runwayItemsOppositeChange.emit($event)"
                  type="number"
                  min="0"
                  step="1"
                />
              </td>
            </tr>
            <tr>
              <td>templateCacheSize</td>
              <td>
                <input
                  [ngModel]="templateCacheSize"
                  [ngModelOptions]="{ updateOn: 'blur' }"
                  (ngModelChange)="templateCacheSizeChange.emit($event)"
                  type="number"
                  min="0"
                  step="1"
                />
              </td>
            </tr>
            <tr>
              <td>Scroll To</td>
              <td>
                <input type="number" min="0" step="1" #scrollToInput />
                <button
                  (click)="scrollToIndex.emit(scrollToInput.valueAsNumber)"
                >
                  Scroll
                </button>
              </td>
            </tr>
            <tr>
              <td>Initial ScrollTo</td>
              <td>
                <input
                  type="number"
                  [value]="initialScrollTo"
                  (change)="
                    setInitialScrollTo(initialScrollToInput.valueAsNumber)
                  "
                  min="0"
                  step="1"
                  #initialScrollToInput
                />
              </td>
            </tr>
            <tr>
              <td>appendOnly</td>
              <td>
                <input
                  type="checkbox"
                  (change)="appendOnlyChange.next(appendOnlyInput.checked)"
                  [checked]="appendOnly"
                  #appendOnlyInput
                />
              </td>
            </tr>
            <tr *ngIf="showWithResizeObserver">
              <td>Enable Resize Observer</td>
              <td>
                <input
                  type="checkbox"
                  (change)="
                    withResizeObserverChange.next(stableScrollbarInput.checked)
                  "
                  [checked]="withResizeObserver"
                  #stableScrollbarInput
                />
              </td>
            </tr>
            <tr *ngIf="withScrollStrategyChange">
              <td>Select Strategy</td>
              <td>
                <select
                  #strategySelect
                  [value]="scrollStrategy"
                  (change)="
                    scrollStrategyChange.emit($any(strategySelect.value))
                  "
                >
                  <option value="fixed">Fixed Size</option>
                  <option value="auto">Auto Size</option>
                  <!--                  <option value="fixed">Dynamic Size</option>-->
                </select>
              </td>
            </tr>
          </table>
        </div>
        <div>
          <div><strong>Data</strong></div>
          <table>
            <tr>
              <td>Amount</td>
              <td>
                <input
                  #amountInput
                  value="10000"
                  type="number"
                  step="50"
                  max="100000"
                />
                <button (click)="dataService.init(amountInput.valueAsNumber)">
                  Set
                </button>
              </td>
            </tr>
            <tr>
              <td>Add Items</td>
              <td>
                <input
                  #addAmountInput
                  value="100"
                  type="number"
                  step="50"
                  max="1000"
                />
                <button
                  (click)="dataService.addItems(addAmountInput.valueAsNumber)"
                >
                  Add
                </button>
              </td>
            </tr>
            <tr>
              <td>Shuffle Items</td>
              <td>
                <button (click)="dataService.shuffle()">Shuffle</button>
              </td>
            </tr>
          </table>
        </div>
      </div>
    </details>
  `,
  host: {
    class: 'demo-panel',
  },
  styles: [
    `
      summary {
        margin-bottom: 0.5rem;
      }
      details {
        padding: 0.25rem;
        border: 1px solid lightgray;
      }
      .demo-panel__body {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        margin-bottom: 1rem;
      }

      td button {
        margin-left: 0.5rem;
      }

      input {
        width: 75px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoPanelComponent {
  @Input() scrollStrategy: 'fixed' | 'auto' | 'dynamic' = 'fixed';
  @Output() scrollStrategyChange = new EventEmitter<
    'fixed' | 'auto' | 'dynamic'
  >();
  @Input() withScrollStrategyChange = false;
  @Input() scrollToExperimental = false;
  @Input() itemAmount = 0;
  @Input() renderedItemsAmount = 0;
  @Input() showWithResizeObserver = false;
  @Input() withResizeObserver = false;
  @Output() withResizeObserverChange = new EventEmitter<boolean>();
  @Input() appendOnly = false;
  @Output() appendOnlyChange = new EventEmitter<boolean>();
  @Input() scrolledIndex = 0;
  @Output() scrollToIndex = new EventEmitter<number>();
  @Input() runwayItemsOpposite = 5;
  @Output() runwayItemsOppositeChange = new EventEmitter<number>();
  @Input() templateCacheSize = 50;
  @Output() templateCacheSizeChange = new EventEmitter<number>();
  @Input() runwayItems = 20;
  @Output() runwayItemsChange = new EventEmitter<number>();

  initialScrollTo = parseInt(localStorage.getItem('rx-initial-scroll-idx'));

  constructor(public dataService: DataService) {}

  setInitialScrollTo(scrollTo: number) {
    localStorage.setItem('rx-initial-scroll-idx', scrollTo.toString());
    this.initialScrollTo = scrollTo;
  }
}

@NgModule({
  imports: [FormsModule, CommonModule],
  exports: [DemoPanelComponent],
  declarations: [DemoPanelComponent],
  providers: [],
})
export class DemoPanelModule {}
