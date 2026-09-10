/** Flat 5 cm bevels catch moonlight without changing the authoritative collision box.
 * Faces, edges and corners share a closed convex envelope; no smooth normals or extra materials.
 *
 * A bevel only belongs on a face somebody can SEE. The district builds its walls as rows of butted
 * boxes and then cuts anything over 12 m into tiles, so a third of the chamfered faces are pressed
 * flat against a neighbour: bevelling those puts a 10 cm V-groove across what should read as one
 * continuous wall — five of them along each 62 m facade, 312 in all when every face was bevelled.
 * `faces` is a six-bit mask of the faces to bevel; the shape stays a closed convex envelope because
 * an unbevelled face simply extends to the full half-extent and takes its edges and corners with it.
 */

/** Bit per face: axis (0=x, 1=y, 2=z) × 2, +1 for the positive side. */
export const face = (axis: number, sign: number): number => 1 << (axis * 2 + (sign > 0 ? 1 : 0));
export const ALL_FACES = 0b111111;

export function chamferData(w: number, h: number, d: number, bevel = .05, faces: number = ALL_FACES) {
  const half = [w/2,h/2,d/2], b = Math.min(bevel,...half.map(v=>v/2));
  const on = (axis: number, sign: number) => (faces & face(axis, sign)) !== 0;
  /** The bevel between two faces exists only when both of them are bevelled. */
  const cut = (a: number, sa: number, o: number, so: number) => on(a, sa) && on(o, so) ? b : 0;
  const positions: number[] = [], normals: number[] = [], indices: number[] = [], uvs: number[] = [];
  const quad = (points: number[][]) => {
    const a=points[0], q=points[1], r=points[2];
    const u=q.map((v,i)=>v-a[i]), v=r.map((v,i)=>v-a[i]);
    let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    if(n.reduce((s,v,i)=>s+v*a[i],0)<0){points.reverse();n=n.map(v=>-v);}
    const len=Math.hypot(...n), start=positions.length/3;
    for(const p of points){positions.push(...p);normals.push(...n.map(v=>v/len));uvs.push(0,0);}
    for(let i=1;i<points.length-1;i++) indices.push(start,start+i+1,start+i);
  };
  // Six faces. Each is inset at an edge only where that edge carries a bevel.
  for(let axis=0;axis<3;axis++) for(const sign of [-1,1]) {
    const u=(axis+1)%3,v=(axis+2)%3;
    quad([[-1,-1],[1,-1],[1,1],[-1,1]].map(([su,sv])=>{
      const p=[0,0,0];
      p[axis]=sign*half[axis];
      p[u]=su*(half[u]-cut(axis,sign,u,su));
      p[v]=sv*(half[v]-cut(axis,sign,v,sv));
      return p;
    }));
  }
  // Twelve edge bands, one per pair of adjacent bevelled faces; each end is cut back by the corner
  // only when the face closing that end is bevelled too.
  for(let axis=0;axis<3;axis++) for(const su of [-1,1]) for(const sv of [-1,1]) {
    const u=(axis+1)%3,v=(axis+2)%3;
    if(!on(u,su)||!on(v,sv)) continue;
    quad([[-1,0],[1,0],[1,1],[-1,1]].map(([end,side])=>{
      const p=[0,0,0];
      p[axis]=end*(half[axis]-(on(axis,end)?b:0));
      p[u]=su*(half[u]-(side?b:0));
      p[v]=sv*(half[v]-(side?0:b));
      return p;
    }));
  }
  // Eight corner triangles, only where all three faces meeting there are bevelled.
  for(const x of [-1,1]) for(const y of [-1,1]) for(const z of [-1,1]) {
    const signs=[x,y,z];
    if(!on(0,x)||!on(1,y)||!on(2,z)) continue;
    quad([0,1,2].map(axis=>half.map((v,i)=>signs[i]*(v-(i===axis?0:b)))));
  }
  return {positions,normals,indices,uvs};
}
