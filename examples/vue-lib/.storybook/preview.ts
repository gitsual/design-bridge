import type { Preview } from '@storybook/vue3-vite';
import '../../shared/dist/tokens.css';

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
    (story, context) => ({
      components: { story },
      setup() {
        document.documentElement.dataset.theme = context.globals.theme ?? 'light';
        return {};
      },
      template: '<story />',
    }),
  ],
};

export default preview;
