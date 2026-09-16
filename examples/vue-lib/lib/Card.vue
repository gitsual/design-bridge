<script setup lang="ts">
import Button from './Button.vue';

defineProps<{ title: string; body?: string; action?: string }>();
</script>

<template>
  <article class="db-card">
    <h3 class="db-card__title">{{ title }}</h3>
    <p v-if="body" class="db-card__body">{{ body }}</p>
    <Button v-if="action" variant="primary" size="sm" icon="arrow">{{ action }}</Button>
  </article>
</template>

<style scoped>
.db-card {
  display: flex;
  flex-direction: column;
  gap: var(--ds-spacing-sm);
  padding: var(--ds-spacing-lg);
  background: var(--ds-semantic-surface);
  border: 1px solid var(--ds-semantic-border);
  border-radius: var(--ds-radius-sm);
  max-width: 340px;
}
.db-card__title {
  margin: 0;
  font-size: var(--ds-font-size-md);
  font-weight: var(--ds-font-weight-bold);
  color: var(--ds-semantic-text);
}
.db-card__body {
  margin: 0;
  font-size: var(--ds-font-size-sm);
  color: var(--ds-semantic-muted);
  line-height: 1.5;
}
</style>
