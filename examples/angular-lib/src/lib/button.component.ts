import { Component, Input } from '@angular/core';
import { IconComponent, IconName } from './icon.component';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md';

@Component({
  selector: 'acme-button',
  standalone: true,
  imports: [IconComponent],
  template: `
    <button
      [class]="'db-button db-button--' + variant + ' db-button--' + size"
      [disabled]="disabled"
      type="button"
    >
      @if (icon) {
        <acme-icon [name]="icon" [size]="size === 'sm' ? 14 : 16" />
      }
      <span><ng-content></ng-content></span>
    </button>
  `,
  styles: [`
    /* Every value comes from a token. No literal colours or spacings live here —
       that is what makes a Figma variable change reach the component. */
    :host { display: inline-block; }
    .db-button {
      display: inline-flex;
      align-items: center;
      gap: var(--ds-spacing-sm);
      border: 1px solid transparent;
      border-radius: var(--ds-radius-sm);
      font-weight: var(--ds-font-weight-bold);
      font-family: inherit;
      cursor: pointer;
      transition: background-color 120ms ease, border-color 120ms ease;
    }
    .db-button--md { padding: var(--ds-spacing-sm) var(--ds-spacing-md); font-size: var(--ds-font-size-md); }
    .db-button--sm { padding: var(--ds-spacing-xs) var(--ds-spacing-sm); font-size: var(--ds-font-size-sm); }

    .db-button--primary { background: var(--ds-semantic-action); color: var(--ds-semantic-on-action); }
    .db-button--primary:hover:not(:disabled) { background: var(--ds-semantic-action-hover); }

    .db-button--secondary {
      background: transparent;
      color: var(--ds-semantic-action);
      border-color: var(--ds-semantic-border);
    }
    .db-button--secondary:hover:not(:disabled) { border-color: var(--ds-semantic-action); }

    .db-button--ghost { background: transparent; color: var(--ds-semantic-muted); }
    .db-button--ghost:hover:not(:disabled) { color: var(--ds-semantic-text); }

    .db-button:disabled { opacity: .5; cursor: not-allowed; }
    .db-button:focus-visible { outline: 2px solid var(--ds-semantic-action); outline-offset: 2px; }
  `],
})
export class ButtonComponent {
  @Input() variant: ButtonVariant = 'primary';
  @Input() size: ButtonSize = 'md';
  @Input() disabled = false;
  @Input() icon?: IconName;
}
