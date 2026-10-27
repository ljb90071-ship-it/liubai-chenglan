import test from 'node:test';
import assert from 'node:assert/strict';
import {downloadCard} from '../site/artwork.js';

test('pending souvenir export cannot download after a visitor reset',async()=>{
  let callback, generation=1;
  const canvas={toBlob(fn){callback=fn;}};
  const pending=downloadCard(canvas,()=>generation===1);
  generation=2;callback(new Blob(['old visitor']));
  assert.equal(await pending,false); // No document or URL object exists: any download attempt throws.
});
test('active visitor receives a recoverable export failure',async()=>{
  const canvas={toBlob(fn){fn(null);}};
  await assert.rejects(downloadCard(canvas),/暂时无法生成/);
});
