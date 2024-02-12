import {
  ChangeDetectionStrategy,
  Component,
  ContentChildren,
  Input,
  QueryList,
  TemplateRef,
} from '@angular/core';
import { combineLatest, Observable, ReplaySubject } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { RxVirtualScrollStrategy } from '../../../../virtual-scrolling/src/lib/model';
import { Item } from '../shared/data.service';
import { DynamicTemplateDirective } from './dynamic-template.directive';

@Component({
  selector: 'list-component',
  template: `
    <rx-virtual-scroll-viewport [scrollStrategy]="scrollStrategy" #viewport>
      <div
        style="width: 100%;"
        *rxVirtualFor="
          let item of itemsWithTemplate$;
          trackBy: trackItem;
          let i = index
        "
      >
        <ng-template
          [ngTemplateOutlet]="item.template"
          [ngTemplateOutletContext]="{
            $implicit: item,
            index: i
          }"
        ></ng-template>
      </div>
    </rx-virtual-scroll-viewport>
  `,
  styles: [
    `
      :host {
        width: 100%;
        height: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListComponent {
  items$ = new ReplaySubject<Item[]>(1);

  @Input() scrollStrategy: RxVirtualScrollStrategy<Item>;

  @Input() set items(items: Item[]) {
    this.items$.next(items);
  }

  private directives$ = new ReplaySubject<DynamicTemplateDirective[]>(1);

  @ContentChildren(
    DynamicTemplateDirective /*{ emitDistinctChangesOnly: true }*/,
  )
  set templateDirectives(directives: QueryList<DynamicTemplateDirective>) {
    this.directives$.next(directives.toArray());
  }

  itemsWithTemplate$: Observable<(Item & { template: TemplateRef<any> })[]> =
    combineLatest([this.items$, this.directives$]).pipe(
      map(([items, directives]) =>
        items.map((item) => ({
          ...item,
          template: directives.find((d) =>
            item.description ? d.id === 'auto' : d.id === 'fixed',
          ).templateRef,
        })),
      ),
      tap(console.log),
    );

  trackItem = (i: number, item: Item & { template: TemplateRef<any> }) =>
    item.id;
}
