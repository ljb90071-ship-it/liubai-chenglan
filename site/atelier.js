import { initSceneRouter } from './scene-router.js?v=61';

const router = initSceneRouter();
const opening = document.querySelector('.prologue');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const quiet = () => reduced.matches || document.documentElement.classList.contains('quiet');
let openingAnimations = [];
function openingEntrance() {
  openingAnimations.forEach(a => a.cancel()); openingAnimations = [];
  if (quiet()) return;
  const run = (element, keyframes, options) => {
    if (element) openingAnimations.push(element.animate(keyframes, { fill: 'backwards', ...options }));
  };
  opening.querySelectorAll('.title-pair i').forEach((letter, i) => run(letter,
    [{ opacity: 0, clipPath: 'inset(100% 0 0 0)', translate: '0 36px' }, { opacity: 1, clipPath: 'inset(0 0 0 0)', translate: '0 0' }],
    { duration: 1200, delay: 170 + i * 100, easing: 'cubic-bezier(.19,1,.22,1)' }));
  run(opening.querySelector('.tide-depth'), [{ opacity: 0, scale: 1.13 }, { opacity: 1, scale: 1 }],
    { duration: 1700, easing: 'cubic-bezier(.16,1,.3,1)' });
}
opening.addEventListener('pointermove', event => {
  if (quiet() || event.pointerType === 'touch') return;
  const rect = opening.getBoundingClientRect();
  opening.style.setProperty('--tide-x', `${((event.clientX - rect.left) / rect.width - .5) * -22}px`);
  opening.style.setProperty('--tide-y', `${((event.clientY - rect.top) / rect.height - .5) * -15}px`);
});
opening.addEventListener('pointerleave', () => {
  opening.style.setProperty('--tide-x', '0px'); opening.style.setProperty('--tide-y', '0px');
});
function settleOpening() { if (quiet()) { openingAnimations.forEach(a => a.cancel()); openingAnimations = []; } }
window.addEventListener('indigo:quiet', settleOpening); reduced.addEventListener('change', settleOpening);
window.addEventListener('indigo:scene', event => {
  // The live textile owns its own ResizeObserver and visibility observer.
  // The scene signal is a shared integration point, not another RAF driver.
  if (event.detail.id === 'home') openingEntrance();
});
if (document.documentElement.dataset.scene === 'home') openingEntrance();
window.addEventListener('pagehide', () => openingAnimations.forEach(a => a.cancel()));

// Preserve an accessible, ordinary anchor fallback when the router is absent.
export { router };
