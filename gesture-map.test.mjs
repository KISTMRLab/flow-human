import test from 'node:test';
import assert from 'node:assert/strict';
import {retrieveGesture,validateMap} from './gesture-map.js';
test('summed vectors retrieve synonymous phrase, rather than lexical match',()=>{
 const map={rules:[{phrase:'hello',gesture:'wave'},{phrase:'object',gesture:'point'}],vectors:{hello:[1,0],greetings:[.9,.1],object:[0,1]}};
 const result=retrieveGesture('greetings',map);assert.equal(result.gesture,'wave');assert.ok(result.score>.99);
});
test('invalid vector dimensions fail before playback',()=>assert.throws(()=>validateMap({rules:[{phrase:'x',gesture:'y'}],vectors:{a:[1],b:[1,2]}}),/width/));
test('missing query vectors produce explicit idle fallback',()=>assert.equal(retrieveGesture('unseen',{rules:[{phrase:'hello',gesture:'wave'}],vectors:{hello:[1,0]}}).phrase,null));
