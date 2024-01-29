import { from, isObservable, Observable, of, OperatorFunction } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * @description
 *
 * This function returns the zone un-patched API for the a specific Browser API.
 * If no target is passed the window is used instead
 *
 * @param name - The name of the API to check.
 * @param target - The target to get un-patched API from.
 * @return {Function} - The zone un-patched API in question.
 *
 */
export function getZoneUnPatchedApi<
  N extends keyof (Window & typeof globalThis)
>(name: N): (Window & typeof globalThis)[N];

export function getZoneUnPatchedApi<T extends object, N extends keyof T>(
  target: T,
  name: N
): T[N];

export function getZoneUnPatchedApi<T extends object, N extends keyof T>(
  targetOrName: T | string,
  name?: N
) {
  // If the user has provided the API name as the first argument, for instance:
  // `const addEventListener = getZoneUnPatchedApi('addEventListener');`
  // Then we just swap arguments and make `global` or `window` as the default target.
  if (typeof targetOrName === 'string') {
    name = targetOrName as N;
    targetOrName = globalThis as T;
  }
  return (targetOrName as T)['__zone_symbol__' + String(name)] || (targetOrName as T)[name];
}

export function unpatchedMicroTask(): Observable<void> {
  return from(getZoneUnPatchedApi('Promise').resolve()) as Observable<void>;
}

export function unpatchedScroll(el: EventTarget): Observable<void> {
  return new Observable<void>((observer) => {
    const listener = () => observer.next();
    getZoneUnPatchedApi(el, 'addEventListener').call(el, 'scroll', listener, {
      passive: true,
    });
    return () => {
      getZoneUnPatchedApi(el, 'removeEventListener').call(
        el,
        'scroll',
        listener,
        { passive: true }
      );
    };
  });
}

/**
 * @description
 *
 * calculates the correct scrollTop value in which the rx-virtual-scroll-viewport
 * is actually visible
 */
export function parseScrollTopBoundaries(
  scrollTop: number,
  offset: number,
  contentSize: number,
  containerSize: number
): {
  scrollTopWithOutOffset: number;
  scrollTopAfterOffset: number;
  scrollTop: number;
} {
  const scrollTopWithOutOffset = scrollTop - offset;
  const maxSize = Math.max(contentSize - containerSize, containerSize);
  const maxScrollTop = Math.max(contentSize, containerSize);
  const adjustedScrollTop = Math.max(0, scrollTopWithOutOffset);
  const scrollTopAfterOffset = adjustedScrollTop - maxSize;
  return {
    scrollTopWithOutOffset,
    scrollTopAfterOffset,
    scrollTop: Math.min(adjustedScrollTop, maxScrollTop),
  };
}

/**
 * @description
 *
 * Calculates the visible size of the rx-virtual-scroll-viewport container. It
 * accounts for the fact that the viewport can partially or fully be out of viewport because
 * static contents that are living between the boundaries of rx-virtual-scroll-viewport
 * and its scrollable element.
 */
export function calculateVisibleContainerSize(
  containerSize: number,
  scrollTopWithOutOffset: number,
  scrollTopAfterOffset: number
) {
  let clamped = containerSize;
  if (scrollTopWithOutOffset < 0) {
    clamped = Math.max(0, containerSize + scrollTopWithOutOffset);
  } else if (scrollTopAfterOffset > 0) {
    clamped = Math.max(0, containerSize - scrollTopAfterOffset);
  }
  return clamped;
}

/**
 * This operator maps an Observable out of a static value or an Observable.
 *
 */
export function coerceObservable<T>(): OperatorFunction<
  Observable<T | null | undefined> | T | null | undefined,
  Observable<T | null | undefined>
> {
  return (o$: Observable<Observable<T> | T>) => o$.pipe(
    map(o => isObservable(o) ? o : of(o))
  );
}
