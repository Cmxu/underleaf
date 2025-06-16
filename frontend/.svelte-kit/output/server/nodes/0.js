

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export const imports = ["_app/immutable/nodes/0.CY_9IqL9.js","_app/immutable/chunks/CSIG_EyB.js","_app/immutable/chunks/CZx5sg4T.js","_app/immutable/chunks/B9-pCVF9.js"];
export const stylesheets = ["_app/immutable/assets/0.ej5dywAL.css"];
export const fonts = [];
