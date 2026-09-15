// Add duration to the open-ended WebM emitted by Chromium MediaRecorder.
// Existing indexed/finalized files are left untouched (their offsets must not move).
// Matroska: https://www.matroska.org/technical/elements.html
export async function withWebmDuration(blob,milliseconds) {
  const bytes=new Uint8Array(await blob.arrayBuffer());
  function vint(offset,id=false) {
    let length=1,mask=128;
    while(length<=8&&!(bytes[offset]&mask)){length++;mask>>=1;}
    if(length>8||offset+length>bytes.length)throw new Error('Invalid EBML');
    let value=BigInt(id?bytes[offset]:bytes[offset]&(mask-1));
    for(let i=1;i<length;i++)value=value*256n+BigInt(bytes[offset+i]);
    return {length,value,unknown:!id&&value===(1n<<BigInt(7*length))-1n};
  }
  function element(offset) {
    const id=vint(offset,true),size=vint(offset+id.length),data=offset+id.length+size.length;
    return {id:Number(id.value),sizeOffset:offset+id.length,size,data,end:size.unknown?bytes.length:data+Number(size.value)};
  }
  try {
    const header=element(0);if(header.id!==0x1a45dfa3)return blob;
    const segment=element(header.end);if(segment.id!==0x18538067||!segment.size.unknown)return blob;
    const info=element(segment.data);if(info.id!==0x1549a966||info.size.unknown||info.end>bytes.length)return blob;
    let timestampScale=1000000;
    for(let pos=info.data;pos<info.end;) {
      const child=element(pos);if(child.end<=pos||child.end>info.end)return blob;
      if(child.id===0x4489||child.id===0xbf)return blob; // Duration or CRC already present.
      if(child.id===0x2ad7b1){timestampScale=0;for(let i=child.data;i<child.end;i++)timestampScale=timestampScale*256+bytes[i];}
      pos=child.end;
    }
    const extra=new Uint8Array(11);extra.set([0x44,0x89,0x88]);new DataView(extra.buffer).setFloat64(3,milliseconds*1000000/timestampScale);
    const size=info.size.value+11n,limit=(1n<<BigInt(info.size.length*7))-1n;
    if(size>=limit||!timestampScale)return blob;
    const prefix=bytes.slice(0,info.end);let encoded=size|(1n<<BigInt(info.size.length*7));
    for(let i=info.size.length-1;i>=0;i--){prefix[info.sizeOffset+i]=Number(encoded&255n);encoded>>=8n;}
    return new Blob([prefix,extra,bytes.subarray(info.end)],{type:blob.type});
  }catch{return blob;}
}
