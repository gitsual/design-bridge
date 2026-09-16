import { Component, Input } from '@angular/core';

/** Minimal inline-SVG icon. Real systems swap this for their icon set. */
export type IconName = 'check' | 'alert' | 'arrow';

const ICON_PATHS: Record<IconName, string> = {
  check: 'M20 6 9 17l-5-5',
  alert: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  arrow: 'M5 12h14m-7-7 7 7-7 7',
};

@Component({
  selector: 'acme-icon',
  standalone: true,
  template: `
    <svg
      [attr.width]="size ?? 16"
      [attr.height]="size ?? 16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path [attr.d]="paths[name]" />
    </svg>
  `,
})
export class IconComponent {
  @Input({ required: true }) name!: IconName;
  @Input() size?: number;

  protected readonly paths = ICON_PATHS;
}
