import * as THREE from './vendor/three.module.js';

// Original procedural painted-shell textures. The reference informs material
// qualities only; these maps are generated without sampling reference pixels.
export function createShellMaps(renderer) {
  const w = 2048, h = 1024, count = w*h;
  let seed = 572981;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed/4294967296; };
  function noiseGrid(cols, rows) {
    const values = Float32Array.from({length: cols*rows}, random);
    return (u,v) => {
      const x = u*cols, y = v*rows, ix = Math.floor(x), iy = Math.floor(y);
      let a = x-ix, b = y-iy;
      a = a*a*(3-2*a); b = b*b*(3-2*b);
      const at = (dx,dy) => values[((iy+dy)%rows)*cols + ((ix+dx)%cols)];
      return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(0,0),at(1,0),a), THREE.MathUtils.lerp(at(0,1),at(1,1),a), b);
    };
  }
  const broad = noiseGrid(36,18), medium = noiseGrid(160,80), fine = noiseGrid(512,256);
  const heights = new Float32Array(count);
  const ambient = new Float32Array(count);
  const roughness = new Float32Array(count);
  const wear = new Float32Array(count);
  const pigment = new Float32Array(count);
  for(let y=0; y<h; y++) {
    const v = y/(h-1), polar = Math.sin(v*Math.PI);
    for(let x=0; x<w; x++) {
      const i = y*w+x, u = x/w;
      const b = broad(u,v*.9999), m = medium(u,v*.9999), f = fine(u,v*.9999);
      heights[i] = .52 + polar*((b-.5)*.11 + (m-.5)*.08 + (f-.5)*.037 + (random()-.5)*.009);
      ambient[i] = 1;
      roughness[i] = .57 + b*.13 + m*.09;
      pigment[i] = .92 + f*.07;
    }
  }

  // Distribute marks by surface area, with longitude compensation. Texture
  // wrapping and neutral poles avoid a line or pinched texture at the UV seam.
  function surfacePoint() {
    const latitude = Math.acos(THREE.MathUtils.lerp(-.985,.985,random()));
    return {x:random()*w, y:latitude/Math.PI*(h-1), stretch:1/Math.max(.17,Math.sin(latitude))};
  }
  function stamp(point, radius, aspect, apply) {
    const rx = radius*point.stretch, ry = radius*aspect;
    for(let py=Math.max(0,Math.floor(point.y-ry)); py<=Math.min(h-1,Math.ceil(point.y+ry)); py++) {
      for(let px=Math.floor(point.x-rx); px<=Math.ceil(point.x+rx); px++) {
        const dx=(px-point.x)/rx, dy=(py-point.y)/ry;
        const r = Math.hypot(dx,dy);
        if(r<1) apply(py*w+((px%w+w)%w),r,dx,dy);
      }
    }
  }
  for(let n=0;n<14500;n++) {
    const point=surfacePoint();
    const radius = n<220 ? 3.3+random()*2 : .85+Math.pow(random(),1.8)*2.4;
    const depth = .08+random()*.15;
    stamp(point,radius,.7+random()*.5,(i,r) => {
      const bowl = Math.pow(Math.max(0,1-r*r),2.4);
      const rim = Math.exp(-Math.pow((r-.79)/.14,2));
      heights[i] += -.9*depth*bowl + .018*rim;
      ambient[i] = Math.min(ambient[i],1-bowl*(.22+depth));
      roughness[i] = Math.min(.94,roughness[i]+bowl*.16);
      pigment[i] *= 1-bowl*.08;
    });
  }
  // A sparse set of pale paint chips, plus smaller dark pigment grains.
  for(let n=0;n<620;n++) {
    const point=surfacePoint(), radius=.6+Math.pow(random(),2)*2.8;
    const amount=.45+random()*.5;
    stamp(point,radius,.5+random()*.7,(i,r,dx,dy) => {
      const edge = 1-THREE.MathUtils.smoothstep(r+.1*Math.sin(dx*8+dy*11),.45,1);
      wear[i]=Math.max(wear[i],edge*amount);
      heights[i]-=edge*.025;
      roughness[i]=Math.max(roughness[i],.85*edge);
    });
  }
  for(let n=0;n<3800;n++) {
    const amount=.12+random()*.36;
    stamp(surfacePoint(),.4+random()*.8,.7+random()*.6,(i,r) => {
      pigment[i]*=1-amount*(1-r);
    });
  }
  function texture(writePixel, srgb=false) {
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const context=canvas.getContext('2d'), data=context.createImageData(w,h);
    for(let i=0;i<count;i++) writePixel(data.data,i*4,i);
    context.putImageData(data,0,0);
    const result = new THREE.CanvasTexture(canvas);
    result.wrapS=THREE.RepeatWrapping;
    result.anisotropy=renderer.capabilities.getMaxAnisotropy();
    if(srgb) result.colorSpace=THREE.SRGBColorSpace;
    return result;
  }
  const bump=texture((d,j,i)=>{d[j]=d[j+1]=d[j+2]=heights[i]*255;d[j+3]=255;});
  const surface=texture((d,j,i)=>{d[j]=ambient[i]*255;d[j+1]=roughness[i]*255;d[j+2]=wear[i]*255;d[j+3]=255;});
  const albedo=texture((d,j,i)=>{d[j]=d[j+1]=d[j+2]=pigment[i]*255;d[j+3]=255;},true);
  return { bump, surface, albedo };
}

export function addPaintWear(material) {
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float paintWear = texture2D(roughnessMap, vRoughnessMapUv).b;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.89, .87, .79), paintWear);
    `);
  };
  material.customProgramCacheKey=()=> 'painted-shell-v1';
}
