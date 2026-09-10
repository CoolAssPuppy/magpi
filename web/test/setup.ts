import '@testing-library/jest-dom/vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:55321';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= 'test-publishable-key';
process.env.SB_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.OPENAI_API_KEY ??= 'test-openai-key';

/**
 * Radix builds its menus on pointer capture and scrolls the active item into view. jsdom has
 * neither, so any component using Select or DropdownMenu throws before it opens.
 */
if (typeof Element !== 'undefined') {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
}
