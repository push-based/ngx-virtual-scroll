import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostBinding,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { Item } from '../data.service';

@Component({
  selector: 'item',
  template: `
    <mat-checkbox (change)="checked = $event.checked"></mat-checkbox>
    <div class="item__image">
      <img [src]="item.image" loading="lazy" />
    </div>
    <div class="item__user">{{ item.user }}</div>
    <div class="item__content">{{ item.content }}</div>
    <div>
      <mat-icon
        [color]="item.status === 'block' ? 'warn' : 'accent'"
        [matTooltip]="item.status"
        >{{ item.status }}</mat-icon
      >
    </div>
    <div class="item__date">{{ item.date | date }}</div>
    <ng-content></ng-content>
    <div class="item__actions">
      <button mat-button color="primary" (click)="update.emit()">
        <mat-icon>update</mat-icon>
        Update
      </button>
      <button mat-button color="primary" (click)="moveDown.emit()">
        <mat-icon>move_down</mat-icon>
        Move Down
      </button>
      <button mat-button color="warn" (click)="remove.emit()">
        <mat-icon>delete</mat-icon>
        Remove
      </button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'item',
  },
  styleUrls: ['./item.component.scss'],
})
export class ItemComponent implements OnChanges {
  @HostBinding('class.checked') checked = false;

  @Input() item: Item;
  @Input() work = 0;

  @Output() update = new EventEmitter<void>();
  @Output() remove = new EventEmitter<void>();
  @Output() moveDown = new EventEmitter<void>();

  workArr: any[];

  ngOnChanges(changes: SimpleChanges) {
    if (changes['work'] || !this.workArr) {
      this.workArr = new Array(this.work).fill({
        id: Math.random(),
        subwork: new Array(this.work).fill('a-test'),
        subwork2: new Array(this.work).fill('a-test'),
        subwork3: new Array(this.work).fill('a-test'),
        subwork4: new Array(this.work).fill('a-test'),
      });
    }
    this.workArr.forEach((w) => {
      w.id++;
    });
  }
}
