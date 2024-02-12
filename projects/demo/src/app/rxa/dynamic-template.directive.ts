import { Directive, Input, TemplateRef } from '@angular/core';

@Directive({ selector: 'ng-template[dynamicTemplate]' })
export class DynamicTemplateDirective {
  @Input('dynamicTemplate') id: string;

  constructor(public templateRef: TemplateRef<any>) {}
}
