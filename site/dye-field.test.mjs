import test from 'node:test';
import assert from 'node:assert/strict';
import {createDyeField} from './dye-field.js';

test('explicit canvas renderer preserves the dye CSS fallback without context or event setup',() => {
  let contexts = 0,listeners = 0;
  const container = {addEventListener(){listeners++;}};
  const canvas = {ownerDocument:{defaultView:{location:{search:'?renderer=canvas'}}},style:{visibility:'visible',pointerEvents:'auto'},dataset:{dyeState:'original'},getContext(){contexts++;throw new Error('GPU context must not be requested');}};
  assert.equal(createDyeField(canvas,container),null);
  assert.equal(contexts,0);assert.equal(listeners,0);
  assert.deepEqual(canvas.style,{visibility:'visible',pointerEvents:'auto'});
  assert.deepEqual(canvas.dataset,{dyeState:'original'});
});
