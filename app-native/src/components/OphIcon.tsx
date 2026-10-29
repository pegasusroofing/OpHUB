// The current app's line icons (185 OPH_ICONS / ophIcon): 24×24, stroked in the given colour.
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type El = ['p', string] | ['c', number, number, number] | ['r', number, number, number, number, number];
const I: Record<string, El[]> = {
  home: [['p','M3 11l9-7 9 7'],['p','M5 10v10h14V10']],
  brush: [['p','M18 3l3 3-9 9-3-3z'],['p','M9 12c-3 0-5 2-5 5 0 1-1 2-2 2 2 2 7 2 9-1 1-1.5 1-3 1-3']],
  mail: [['r',3,5,18,14,2],['p','M3 7l9 6 9-6']],
  cloud: [['p','M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z']],
  pen: [['p','M4 20h4L19 9l-4-4L4 16z']],
  layers: [['p','M12 3l9 5-9 5-9-5z'],['p','M3 13l9 5 9-5']],
  pound: [['p','M17 20H7c2-2 2-4 2-7V8a3 3 0 0 1 6-1'],['p','M6 13h8']],
  store: [['p','M4 9l2-5h12l2 5'],['p','M4 9v11h16V9'],['p','M4 9h16M10 20v-6h4v6']],
  book: [['p','M4 4h9a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z'],['p','M20 4h-4v16']],
  flask: [['p','M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3']],
  users: [['c',9,8,3.5],['p','M2 20c1-3.5 4-5.5 7-5.5s6 2 7 5.5'],['p','M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .8 3.4 2.6 4 5.5']],
  phone: [['r',7,2,10,20,2],['p','M11 18h2']],
  wrench: [['p','M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z']],
  link: [['p','M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1'],['p','M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1']],
  projects: [['r',3,7,18,13,2],['p','M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2']],
  reports: [['p','M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z'],['p','M14 3v5h5'],['p','M9 13h6M9 17h4']],
  admin: [['c',12,8,4],['p','M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6']],
  plus: [['p','M12 5v14M5 12h14']],
  calendar: [['r',3,5,18,16,2],['p','M16 3v4M8 3v4M3 10h18']],
  truck: [['p','M3 6h11v10H3z'],['p','M14 9h4l3 3v4h-7'],['c',7,18,2],['c',17,18,2]],
  bell: [['p','M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9'],['p','M10.3 21a1.9 1.9 0 0 0 3.4 0']],
  chart: [['p','M4 20V10M10 20V4M16 20v-7M22 20H2']],
  gear: [['c',12,12,3],['p','M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z']],
  clipboard: [['r',5,4,14,17,2],['p','M9 4h6v3H9z'],['p','M9 12h6M9 16h4']],
  pin: [['p','M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z'],['c',12,9.5,2.5]],
  chat: [['p','M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z']],
  tools: [['p','M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z']],
  list: [['p','M9 6h11M9 12h11M9 18h11'],['p','M4 6h.01M4 12h.01M4 18h.01']],
  chevron: [['p','M9 6l6 6-6 6']],
  search: [['c',11,11,7],['p','M20 20l-3.5-3.5']],
  shield: [['p','M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'],['p','M9 12l2 2 4-4']],
  pencil: [['p','M4 20h4L19 9l-4-4L4 16z'],['p','M14 6l4 4']],
  box: [['p','M3 7l9-4 9 4v10l-9 4-9-4z'],['p','M3 7l9 4 9-4M12 11v10']],
  building: [['r',4,3,16,18,1],['p','M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3']],
  check: [['r',3,3,18,18,4],['p','M8 12l3 3 5-6']],
  clock: [['c',12,13,8],['p','M12 9v4l3 2M10 2h4']],
};
export type IconName = keyof typeof I;

export function OphIcon({ name, size = 22, color = '#1E2124', stroke = 2 }: { name: string; size?: number; color?: string; stroke?: number }) {
  const els = I[name] || I.list;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {els.map((e, i) => (e[0] === 'p' ? <Path key={i} d={e[1]} /> : e[0] === 'c' ? <Circle key={i} cx={e[1]} cy={e[2]} r={e[3]} /> : <Rect key={i} x={e[1]} y={e[2]} width={e[3]} height={e[4]} rx={e[5]} />))}
    </Svg>
  );
}
