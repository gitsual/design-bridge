import type { Preview } from '@storybook/angular';
// The token stylesheet is a GLOBAL style, and under the Angular builder those are
// declared in angular.json's `styles`, not imported from TypeScript: webpack has no
// loader for a bare .css import here, unlike Vite in the Vue example.

// Registers a toolbar toggle so the dark-mode tokens (tokens.css's
// `:root[data-theme="dark"]` block) are demonstrable without leaving Storybook.
const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
  globalTypes: {
    theme: {
      description: 'Design token theme',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'light',
  },
  decorators: [
    (story, context) => {
      document.documentElement.dataset.theme = context.globals.theme ?? 'light';
      return story();
    },
  ],
};

export default preview;
