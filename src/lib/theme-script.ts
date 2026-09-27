/**
 * Runs before first paint to prevent a theme flash (F-10). An explicit stored
 * choice always wins; with no stored value we follow the OS, because light is
 * a first-class theme and a light-OS visitor was once shown the wrong one.
 *
 * Kept in its own module because the Content-Security-Policy allows it by
 * HASH (src/lib/csp.ts hashes this exact string): edit it here and the hash
 * follows, with no second copy to forget.
 */
export const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('cognit-theme');var d=t==='dark'||(t!=='light'&&!window.matchMedia('(prefers-color-scheme: light)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){document.documentElement.classList.add('dark')}})()`;
