/** Small, dependency-free unique id. Replace with expo-crypto UUID if needed. */
export function uid(prefix = ''): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return `${prefix}${prefix ? '-' : ''}${t}${r}`;
}
