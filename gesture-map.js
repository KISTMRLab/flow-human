// Portable adapter for the automatic text-to-gesture rule map used by Flow Human.
// The server's /api/gesture-match adds Sentence-BERT (local model) or TF-IDF
// matching; this module is the in-browser fallback and the playback bridge.
export const exampleMap={rules:[{phrase:'welcome hello glad meet',gesture:'welcome'},{phrase:'look point here there',gesture:'point'},{phrase:'think consider question explain',gesture:'thinking'},{phrase:'help information tell',gesture:'open_hand'}]};
export const DEFAULT_FLOOR={lexical:.15,vectors:.5};
function terms(text){return text.toLowerCase().match(/[\p{L}\p{N}']+/gu)||[];}
function vector(text,vectors){let out=null;for(const term of terms(text)){const v=vectors[term];if(!v)continue;if(!out)out=Array(v.length).fill(0);if(v.length!==out.length)throw new Error('Inconsistent embedding widths.');v.forEach((x,i)=>out[i]+=x);}return out;}
function cosine(a,b){if(!a||!b||a.length!==b.length)return 0;const n=Math.hypot(...a)*Math.hypot(...b);return n?a.reduce((s,x,i)=>s+x*b[i],0)/n:0;}
function frameShape(frames){return Array.isArray(frames)&&frames.length&&frames.every(f=>Array.isArray(f)&&f.length&&f.every(p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite)));}
export function validateMap(map){
  if(!Array.isArray(map?.rules)||!map.rules.length)throw new Error('Gesture map needs a nonempty rules array.');
  for(const r of map.rules){
    if(typeof r.phrase!=='string'||typeof r.gesture!=='string')throw new Error('Each rule needs phrase and gesture strings.');
    if(r.frames!==undefined&&r.frames!==null){
      if(!frameShape(r.frames))throw new Error(`Rule '${r.gesture}': frames must be [frame][joint][x,y,z] numbers.`);
      const names=r.jointNames||map.jointNames||map.joint_order;
      if(!Array.isArray(names)||names.length!==r.frames[0].length)throw new Error(`Rule '${r.gesture}': jointNames must name each joint in a frame.`);
      const fps=r.fps??map.fps??30;if(!(Number(fps)>0&&Number(fps)<=240))throw new Error(`Rule '${r.gesture}': fps must be between 0 and 240.`);
    }
  }
  if(map.floor!==undefined&&!(Number(map.floor)>=0&&Number(map.floor)<=1))throw new Error('floor must be between 0 and 1.');
  if(map.vectors){const widths=new Set();for(const v of Object.values(map.vectors)){if(!Array.isArray(v)||!v.length||v.some(x=>!Number.isFinite(x)))throw new Error('Embeddings must be finite numeric arrays.');widths.add(v.length);}if(widths.size>1)throw new Error('Embedding widths must agree.');}
  return map;
}
export function ruleResult(map,rule,score,backend){
  const matched=Boolean(rule);
  return {gesture:matched?rule.gesture:'idle',matched,score,phrase:rule?.phrase||null,frames:rule?.frames||null,
    jointNames:rule?.jointNames||map.jointNames||map.joint_order||[],axisSigns:rule?.axisSigns||map.axisSigns||[1,1,1],
    fps:Number(rule?.fps??map.fps??30),edges:rule?.edges||[],backend};
}
// Below the similarity floor the result is the idle fallback, never the nearest rule.
export function retrieveGesture(text,map){validateMap(map);const words=terms(text),q=map.vectors?vector(text,map.vectors):null;let best=null,score=0;
 for(const r of map.rules){let s;if(map.vectors)s=cosine(q,vector(r.phrase,map.vectors));else{const candidate=new Set(terms(r.phrase)),query=new Set(words);s=[...query].filter(t=>candidate.has(t)).length/Math.sqrt(Math.max(1,candidate.size*query.size));}if(s>score){score=s;best=r;}}
 const floor=Number(map.floor??(map.vectors?DEFAULT_FLOOR.vectors:DEFAULT_FLOOR.lexical));
 return ruleResult(map,score>=floor&&score>0?best:null,score,map.vectors?'summed-word-vector-cosine':'lexical-example-baseline');
}
// Imported frames become a MotionSequence payload so the matched rule drives playback.
export function motionData(match,text){
  if(!match?.matched||!Array.isArray(match.frames)||!match.frames.length)return null;
  return {ready:true,fps:match.fps||30,joint_order:match.jointNames,axisSigns:match.axisSigns,
    slots:[{gesture_id:match.gesture,text,frames:match.frames,route:'imported_rule_map'}],trace:{routes:['imported_rule_map']}};
}
