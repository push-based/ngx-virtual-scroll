import { Component, ViewEncapsulation } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'virtual-scroll-root',
  },
})
export class AppComponent {
  navOpen = false;
  constructor(router: Router) {
    matchMedia('(max-width: 600px)').addEventListener(
      'change',
      (e: MediaQueryListEvent) => {
        if (e.matches) {
          this.navOpen = false;
        }
      },
    );
    router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) {
        this.navOpen = false;
      }
    });
  }

  closeNavIfOpen(event: MouseEvent) {
    if (this.navOpen) {
      event.stopPropagation();
      event.preventDefault();
      this.navOpen = false;
    }
  }
}
