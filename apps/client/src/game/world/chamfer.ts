/** Flat 5 cm bevels catch moonlight without changing the authoritative collision box.
 * Faces, edges and corners share a closed convex envelope; no smooth normals or extra materials.
 */
export function chamferData(w: number, h: number, d: number, bevel = .05) {
  const half = [w/2,h/2,d/2], b = Math.min(bevel,...half.map(v=>v/2));
  const positions: number[] = [], normals: number[] = [], indices: number[] = [], uvs: number[] = [];
  const face = (points: number[][]) => {
    const a=points[0], q=points[1], r=points[2];
    const u=q.map((v,i)=>v-a[i]), v=r.map((v,i)=>v-a[i]);
    let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    if(n.reduce((s,v,i)=>s+v*a[i],0)<0){points.reverse();n=n.map(v=>-v);}
    const len=Math.hypot(...n), start=positions.length/3;
    for(const p of points){positions.push(...p);normals.push(...n.map(v=>v/len));uvs.push(0,0);}
    for(let i=1;i<points.length-1;i++) indices.push(start,start+i+1,start+i);
  };
  for(let axis=0;axis<3;axis++) for(const sign of [-1,1]) {
    const u=(axis+1)%3,v=(axis+2)%3;
    face([[-1,-1],[1,-1],[1,1],[-1,1]].map(([su,sv])=>{
      const p=[0,0,0];p[axis]=sign*half[axis];p[u]=su*(half[u]-b);p[v]=sv*(half[v]-b);return p;
    }));
  }
  for(let axis=0;axis<3;axis++) for(const su of [-1,1]) for(const sv of [-1,1]) {
    const u=(axis+1)%3,v=(axis+2)%3;
    face([[-1,0],[1,0],[1,1],[-1,1]].map(([end,side])=>{
      const p=[0,0,0];p[axis]=end*(half[axis]-b);p[u]=su*(half[u]-(side?b:0));p[v]=sv*(half[v]-(side?0:b));return p;
    }));
  }
  for(const x of [-1,1]) for(const y of [-1,1]) for(const z of [-1,1]) {
    const signs=[x,y,z];face([0,1,2].map(axis=>half.map((v,i)=>signs[i]*(v-(i===axis?0:b)))));
  }
  return {positions,normals,indices,uvs};
}
