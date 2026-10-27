import { initExploration } from './exploration.js?v=61';
import { initCreativeTools } from './creative-tools.js?v=61';
import { initLivingGallery } from './living-gallery.js?v=61';
initCreativeTools();
initExploration();
initLivingGallery();

// These controls are created here, after the router reads the initial URL.
// Reconcile only an explicit editor deep link once the real target exists.
if (['#creative-lab', '#custom-editor'].includes(location.hash)) {
  const editor = document.getElementById('creative-lab');
  if (editor) editor.open = true;
  window.indigoSceneRouter?.navigate(location.hash, {
    history: 'replace', instant: true, focus: 'custom-editor'
  });
}
