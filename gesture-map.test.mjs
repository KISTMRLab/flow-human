import test from 'node:test';
import assert from 'node:assert/strict';
import {motionData,retrieveGesture,validateMap} from './gesture-map.js';
test('summed vectors retrieve synonymous phrase, rather than lexical match',()=>{
 const map={rules:[{phrase:'hello',gesture:'wave'},{phrase:'object',gesture:'point'}],vectors:{hello:[1,0],greetings:[.9,.1],object:[0,1]}};
 const result=retrieveGesture('greetings',map);assert.equal(result.gesture,'wave');assert.ok(result.score>.99);
});
test('invalid vector dimensions fail before playback',()=>assert.throws(()=>validateMap({rules:[{phrase:'x',gesture:'y'}],vectors:{a:[1],b:[1,2]}}),/width/));
test('missing query vectors produce explicit idle fallback',()=>assert.equal(retrieveGesture('unseen',{rules:[{phrase:'hello',gesture:'wave'}],vectors:{hello:[1,0]}}).phrase,null));
test('scores below the similarity floor return idle instead of the nearest rule',()=>{
 // Audit regression: out-of-vocabulary text still played a clip.
 const map={rules:[{phrase:'welcome hello glad meet',gesture:'welcome'},{phrase:'look point here there',gesture:'point'}]};
 const miss=retrieveGesture('The quarterly invoice arrives tomorrow',map);
 assert.equal(miss.gesture,'idle');assert.equal(miss.matched,false);
 assert.equal(retrieveGesture('hello and welcome',map).gesture,'welcome');
 assert.equal(retrieveGesture('hello and welcome',{...map,floor:.95}).gesture,'idle');
});
test('imported rule frames drive motion playback data',()=>{
 const frames=[[[0,1,0],[0,1.5,0]],[[0,1,0],[.1,1.5,0]]];
 const map={jointNames:['Hips','Neck'],fps:25,rules:[{phrase:'welcome',gesture:'welcome',frames}]};
 const data=motionData(retrieveGesture('welcome everyone',map),'welcome everyone');
 assert.equal(data.fps,25);assert.deepEqual(data.joint_order,['Hips','Neck']);assert.equal(data.slots[0].frames,frames);
 assert.equal(motionData(retrieveGesture('unrelated words',map),'x'),null);
 assert.throws(()=>validateMap({rules:[{phrase:'a',gesture:'b',frames}]}),/jointNames/);
});
