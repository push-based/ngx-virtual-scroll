import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';

@Injectable()
export class RxResizeObserver implements OnDestroy {
  private resizeObserver = new ResizeObserver((events) => {
    this.viewsResized$.next(events);
  });

  /** @internal */
  private readonly viewsResized$ = new Subject<ResizeObserverEntry[]>();

  observeElement(
    element: Element,
    options?: ResizeObserverOptions,
  ): Observable<ResizeObserverEntry> {
    this.resizeObserver.observe(element, options);
    return new Observable<ResizeObserverEntry>((observer) => {
      const inner = this.viewsResized$.subscribe((events) => {
        const event = events.find((event) => event.target === element);
        if (event) {
          observer.next(event);
        }
      });
      return () => {
        this.resizeObserver.unobserve(element);
        inner.unsubscribe();
      };
    });
  }

  ngOnDestroy() {
    this.resizeObserver.disconnect();
  }
}
