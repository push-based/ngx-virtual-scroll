import { Routes } from '@angular/router';
import { BlankComponent } from './blank/blank.component';
import { AutosizeComponent } from './rxa/autosize.component';
import { FixedSizeComponent } from './rxa/fixed-size.component';
import { MixedStrategyComponent } from './rxa/mixed-strategy.component';

export const routes: Routes = [
  {
    path: '',
    component: BlankComponent,
  },
  {
    path: 'rxa/fixed-size',
    component: FixedSizeComponent,
  },
  {
    path: 'rxa/autosize',
    component: AutosizeComponent,
  },
  {
    path: 'rxa/mixed-strategy',
    component: MixedStrategyComponent,
  },
  {
    path: '',
    redirectTo: 'rxa/fixed-size',
    pathMatch: 'full',
  },
];
