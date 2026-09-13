import type { HaircutStyle } from "@frankibarber/shared";

/** Small wardrobe/reel portrait that uses the same profile word as the actual 3D builder. */
export function HaircutArt({ style, className = "" }: { style: HaircutStyle; className?: string }) {
  const hair = style.tone === "bleach" ? "#ead78f" : style.tone === "stubble" ? "#67564c" : "#2b211b";
  const common = { fill: hair, stroke: "#05090b", strokeWidth: 1.4, strokeLinejoin: "round" as const };
  const shape = (() => {
    if (style.cap) return <><path {...common} fill="#e5bd2e" d="M13 23V15Q32 5 51 15v8z"/><path {...common} fill="#147342" d="M10 23h47v6H10z"/><path {...common} fill="#e5bd2e" d="M49 25h11v4H49z"/></>;
    switch (style.shape) {
      case "quiff": return <path {...common} d="M13 26q1-18 14-15l5 6q8-17 21-9l-2 20z"/>;
      case "sidepart": return <><path {...common} d="M13 28V17Q26 8 42 11l-4 17z"/><path {...common} opacity=".78" d="M40 15q8 0 12 7v7H39z"/></>;
      case "curtains": return <><path {...common} d="M12 28q1-19 18-17l-2 27-11 7z"/><path {...common} d="M52 28Q51 9 34 11l2 27 11 7z"/></>;
      case "bowl": return <path {...common} d="M10 29Q11 8 32 8t22 21v7H10z"/>;
      case "topknot": return <><path {...common} d="M15 28q2-15 17-15t17 15z"/><circle {...common} cx="40" cy="9" r="8"/></>;
      case "mohawk": return <path {...common} d="M27 29 25 18l5-4-2-7 6 3 4-7 3 11 5 4-7 11z"/>;
      case "sweep": return <path {...common} d="M12 29q4-17 19-18l22 8-10 3 9 6z"/>;
      case "spikes": return <path {...common} d="m12 30 4-17 7 8 3-17 7 15 7-17 4 18 9-10-3 20z"/>;
      case "hightop": return <path {...common} d="M14 29 16 7h33l2 22z"/>;
      case "mullet": return <path {...common} d="M12 29q2-17 20-17t20 17v25l-10-7-8 9-8-9-10 7V29z"/>;
      case "afro": return <path {...common} d="M8 29Q4 20 12 16 10 7 20 8q5-9 13-3 8-8 14 1 10-1 9 9 8 4 1 13l-7 7H14z"/>;
      case "braids": return <><path {...common} d="M13 29q2-17 19-17t19 17z"/>{[18,27,37,46].map((x)=><path key={x} {...common} fill="none" strokeWidth="4" d={`M${x} 24q-4 12 0 29`}/>)}</>;
      case "dreadlocks": return <><path {...common} d="M11 29q2-20 21-20t21 20z"/>{[14,22,31,40,49].map((x,i)=><path key={x} {...common} fill="none" strokeWidth="6" d={`M${x} 23q${i%2?5:-5} 15 0 33`}/>)}</>;
      case "waves": return <><path {...common} d="M12 29q2-18 20-18t20 18z"/><path fill="none" stroke="#a88f69" strokeWidth="2" d="M15 20q8-7 17 0t17 0M14 26q8-6 18 0t18 0"/></>;
      default: return <path {...common} d="M13 29q2-16 19-16t19 16z"/>;
    }
  })();

  return <svg className={`haircut-art ${className}`} viewBox="0 0 64 64" aria-hidden="true">
    <path fill="#b87c58" stroke="#05090b" strokeWidth="1.5" d="M15 29Q15 13 32 13t17 16v17Q45 59 32 60 19 59 15 46z" />
    {shape}
    <path fill="#081015" d="M16 31h32v10H16z"/><path fill="#e7b62e" d="M20 33h24v5H20z"/>
  </svg>;
}
