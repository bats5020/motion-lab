import * as THREE from './vendor/three.module.js';

// Object-space projections blend across the curved shell. No longitude seam,
// mirrored UV fold or collapsed pole is introduced by this mapping.
export function applyFlowMapping(material) {
  const uniforms={flowMode:{value:0},flowScale:{value:1},flowAngle:{value:0},flowWarp:{value:1.2},flowSeed:{value:1},flowShift:{value:new THREE.Vector2()},flowRecolor:{value:1},flowFlameHeight:{value:1},flowSoftness:{value:.35},flowGrain:{value:0},flowColorCount:{value:4},flowStops:{value:[0,.43,.74,1,1,1,1,1]},flowColors:{value:['#229dcf','#fcf8d8','#eb995b','#ff4f03','#ffffff','#ffffff','#ffffff','#ffffff'].map(c=>new THREE.Color(c))}};
  material.userData.flowUniforms=uniforms;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 flowPosition;
        varying vec3 flowNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        flowPosition = position;
        flowNormal = normal;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 flowPosition;
        varying vec3 flowNormal;
        uniform float flowMode,flowScale,flowAngle,flowWarp,flowSeed,flowRecolor,flowFlameHeight,flowSoftness,flowGrain;
        uniform vec2 flowShift;
        uniform vec3 flowColors[8];
        uniform float flowStops[8];
        uniform int flowColorCount;
        vec2 flowUv(vec2 uv){float c=cos(flowAngle),s=sin(flowAngle);return mat2(c,-s,s,c)*(uv-.5)/flowScale+.5+flowShift;}
        float flowNoise(vec3 p){
          return (sin(p.x*1.71+sin(p.z*1.36+flowSeed))*sin(p.y*1.29+sin(p.x*.87-flowSeed))+sin(p.z*1.57+p.y*.63+flowSeed)*.5)/1.5;
        }
        float generatedFlow(vec3 p){
          float c=cos(flowAngle),s=sin(flowAngle);p.xy=mat2(c,-s,s,c)*p.xy/flowScale+flowShift*2.;p.z/=flowScale;
          if(flowMode>3.5){
            // A height field displaced in 3D creates upward tongues on every side.
            // No longitude UVs or repeated image edges are involved.
            vec3 q=p;
            float turn=flowWarp*.65*sin(q.y*2.1+flowSeed*.71);
            q.xz=mat2(cos(turn),-sin(turn),sin(turn),cos(turn))*q.xz;
            q.x+=flowWarp*.20*sin(q.y*3.6+q.z*2.4+flowSeed);
            q.z+=flowWarp*.16*sin(q.y*4.1+q.x*2.1-flowSeed);
            float ridges=sin(q.x*4.7+q.z*2.3+flowSeed)*.58
                        +sin(q.z*5.3-q.x*1.8+flowSeed*1.9)*.30
                        +sin(q.x*8.1+q.z*4.2+flowSeed*.3)*.12;
            float tip=-.20+flowFlameHeight*(ridges*.62+.18);
            float d=q.y-tip+flowWarp*.075*sin(q.y*6.+q.x*5.+q.z*4.);
            float width=mix(.22,1.05,flowSoftness);
            return smoothstep(-width,width,d);
          }
          if(flowMode>2.5)return clamp(p.y*.5+.5,0.,1.);
          vec3 q=p*2.;
          float a=flowWarp*flowNoise(q);
          q.xy=mat2(cos(a),-sin(a),sin(a),cos(a))*q.xy;
          q+=flowWarp*vec3(flowNoise(q+3.7),flowNoise(q+8.1),flowNoise(q+13.2));
          return .5+.5*sin(q.y*2.2+flowNoise(q*1.8)*1.7);
        }
        // Reconstruct a scalar pigment field, then blend fields instead of
        // overlapping RGB images. This keeps cream between blue and orange.
        const vec3 flowBlue = vec3(.016, .337, .624);
        const vec3 flowCream = vec3(.973, .939, .687);
        const vec3 flowPeach = vec3(.831, .319, .105);
        const vec3 flowOrange = vec3(1., .078, .001);
        void flowSegment(vec3 c, vec3 a, vec3 b, float start, float span, inout float best, inout float field) {
          vec3 delta = b-a;
          float t = clamp(dot(c-a,delta)/dot(delta,delta),0.,1.);
          vec3 error = c-mix(a,b,t);
          float distance = dot(error,error);
          if(distance<best){best=distance;field=start+t*span;}
        }
        float flowField(vec3 c) {
          float best=100., field=0.;
          flowSegment(c,flowBlue,flowCream,0.,.43,best,field);
          flowSegment(c,flowCream,flowPeach,.43,.31,best,field);
          flowSegment(c,flowPeach,flowOrange,.74,.26,best,field);
          return field;
        }
        vec3 flowPigment(float f) {
          for(int i=1;i<8;i++){
            if(i>=flowColorCount)break;
            if(f<=flowStops[i])return mix(flowColors[i-1],flowColors[i],clamp((f-flowStops[i-1])/max(flowStops[i]-flowStops[i-1],.00001),0.,1.));
          }
          return flowColors[flowColorCount-1];
        }`)
      .replace('#include <map_fragment>', `
        float flowY = flowPosition.y / 1.53;
        float flowRadius = 1.19 * (1.0 - .135 * flowY);
        vec3 flowP = vec3(flowPosition.x / flowRadius, flowY, flowPosition.z / flowRadius);
        vec3 blendWeights = pow(abs(normalize(flowNormal)), vec3(2.0));
        blendWeights /= max(dot(blendWeights, vec3(1.0)), .0001);
        vec2 frontUv = flowP.xy * .5 + .5;
        vec2 sideUv = vec2(flowP.y, flowP.z) * .46 + vec2(.5,.51);
        vec2 capUv = mat2(.745,-.667,.667,.745) * flowP.xz * .44 + .5;
        vec3 frontColor = texture2D(map, flowUv(frontUv)).rgb;
        vec3 sideColor = texture2D(map, flowUv(sideUv)).rgb;
        vec3 capColor = texture2D(map, flowUv(capUv)).rgb;
        float pigmentField = flowField(frontColor)*blendWeights.z
                           + flowField(sideColor)*blendWeights.x
                           + flowField(capColor)*blendWeights.y;
        vec3 rawColor=frontColor*blendWeights.z+sideColor*blendWeights.x+capColor*blendWeights.y;
        if(flowMode>.5&&flowMode<1.5)pigmentField=dot(rawColor,vec3(.2126,.7152,.0722));
        if(flowMode>1.5)pigmentField=generatedFlow(flowP);
        diffuseColor.rgb *= flowMode>.5&&flowMode<1.5&&flowRecolor<.5?rawColor:flowPigment(pigmentField);
        if(flowMode>3.5&&flowGrain>0.){
          vec3 cell=floor(flowP*580.);
          float grain=fract(sin(dot(cell,vec3(12.9898,78.233,37.719)))*43758.5453)-.5;
          float visible=1.-smoothstep(1.,4.,length(fwidth(flowP))*580.);
          diffuseColor.rgb*=1.+grain*flowGrain*1.4*visible;
        }
      `);
  };
  material.customProgramCacheKey = () => 'editable-object-space-flow-v5';
}
