<script setup lang="ts">
import Icon from './Icon.vue';

withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost';
    size?: 'sm' | 'md';
    disabled?: boolean;
    icon?: 'check' | 'alert' | 'arrow';
  }>(),
  { variant: 'primary', size: 'md', disabled: false },
);
</script>

<template>
  <button
    class="db-button"
    :class="[`db-button--${variant}`, `db-button--${size}`]"
    :disabled="disabled"
    type="button"
  >
    <Icon v-if="icon" :name="icon" :size="size === 'sm' ? 14 : 16" />
    <span><slot /></span>
  </button>
</template>

<style scoped>
/* Every value comes from a token. No literal colours or spacings live here —
   that is what makes a Figma variable change reach the component. */
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
</style>
