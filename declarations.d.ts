// Allow importing CSS / CSS-module files (handled by Metro/web tooling, not tsc).
declare module '*.css';

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
