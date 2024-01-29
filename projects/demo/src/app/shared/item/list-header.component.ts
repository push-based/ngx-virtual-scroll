import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'list-header',
  template: `
    <div></div>
    <div></div>
    <div>User</div>
    <div>Description</div>
    <div>Status</div>
    <div>Date</div>
  `,
  host: {
    class: 'list-header',
  },
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListHeaderComponent {}
