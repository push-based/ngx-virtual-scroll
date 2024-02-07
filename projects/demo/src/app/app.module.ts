import { NgModule } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BrowserModule } from '@angular/platform-browser';
import { RouterModule } from '@angular/router';
import { AutoSizeVirtualScrollStrategyModule } from '../../../virtual-scrolling/src/lib/scroll-strategies/autosize-virtual-scroll-strategy';
import { FixedSizeVirtualScrollStrategyModule } from '../../../virtual-scrolling/src/lib/scroll-strategies/fixed-size-virtual-scroll-strategy';
import { RxVirtualForModule } from '../../../virtual-scrolling/src/lib/virtual-for.directive';
import { RxVirtualScrollViewportModule } from '../../../virtual-scrolling/src/lib/virtual-scroll-viewport.component';
import { AppComponent } from './app.component';
import { routes } from './app.routes';
import { BlankComponent } from './blank/blank.component';
import { AutosizeComponent } from './rxa/autosize.component';
import { FixedSizeComponent } from './rxa/fixed-size.component';
import { MixedStrategyComponent } from './rxa/mixed-strategy.component';
import { DemoPanelModule } from './shared/demo-panel/demo-panel.component';
import { ItemComponent } from './shared/item/item.component';
import { ListHeaderComponent } from './shared/item/list-header.component';

@NgModule({
  declarations: [
    AppComponent,
    BlankComponent,
    ItemComponent,
    ListHeaderComponent,
    AutosizeComponent,
    FixedSizeComponent,
    MixedStrategyComponent,
  ],
  bootstrap: [AppComponent],
  imports: [
    BrowserModule,
    DemoPanelModule,
    RouterModule.forRoot(routes),
    RxVirtualForModule,
    RxVirtualScrollViewportModule,
    AutoSizeVirtualScrollStrategyModule,
    FixedSizeVirtualScrollStrategyModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatCheckboxModule,
  ],
})
export class AppModule {}
