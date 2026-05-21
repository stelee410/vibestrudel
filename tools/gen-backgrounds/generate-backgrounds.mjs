import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const outDir = join(root, "assets", "backgrounds");
mkdirSync(outDir, { recursive: true });

const size = 1280;

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&apos;",
  }[c]));
}

function svg(content, defs = "", width = size) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}" viewBox="0 0 ${size} ${size}">
  <defs>
    <filter id="grain" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="3" seed="17"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="table" tableValues="0 .18"/></feComponentTransfer>
    </filter>
    <filter id="rough" x="-15%" y="-15%" width="130%" height="130%">
      <feTurbulence type="fractalNoise" baseFrequency=".018" numOctaves="4" seed="8" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="28" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <radialGradient id="vignette" cx="50%" cy="48%" r="72%">
      <stop offset="58%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity=".72"/>
    </radialGradient>
    ${defs}
  </defs>
  <rect width="${size}" height="${size}" fill="#07080b"/>
  ${content}
  <rect width="${size}" height="${size}" fill="url(#vignette)"/>
  <rect width="${size}" height="${size}" filter="url(#grain)" opacity=".75"/>
</svg>
`;
}

function lines({ count, color, opacity = 0.45, rotate = 0, width = 2 }) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const x = Math.round((i / (count - 1)) * size);
    items.push(`<line x1="${x}" y1="-80" x2="${x}" y2="${size + 80}" stroke="${color}" stroke-width="${width}" opacity="${opacity}"/>`);
  }
  return `<g transform="rotate(${rotate} ${size / 2} ${size / 2})">${items.join("")}</g>`;
}

function circles({ count, cx = 640, cy = 640, color, opacity = 0.5, width = 6, gap = 44 }) {
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push(`<circle cx="${cx}" cy="${cy}" r="${40 + i * gap}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity * (1 - i / count * .45)}"/>`);
  }
  return items.join("");
}

function stars(count, color = "#ffd59a") {
  const items = [];
  for (let i = 0; i < count; i++) {
    const x = (Math.sin(i * 91.73) * 0.5 + 0.5) * size;
    const y = (Math.sin(i * 47.19 + 2.3) * 0.5 + 0.5) * size;
    const r = 0.8 + (Math.sin(i * 13.1) * 0.5 + 0.5) * 2.8;
    const o = 0.18 + (Math.sin(i * 17.7) * 0.5 + 0.5) * 0.62;
    items.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" opacity="${o.toFixed(2)}"/>`);
  }
  return `<g>${items.join("")}</g>`;
}

const backgrounds = [
  {
    id: "cosmic-ember",
    title: "Cosmic Ember",
    subtitle: "Nebula heat and blue dust",
    tags: ["cosmic", "cinematic", "warm"],
    dominantColor: "#e75b2c",
    recommendedScene: "image-warp",
    art: () => svg(`
      <radialGradient id="g1" cx="46%" cy="48%" r="72%"><stop offset="0" stop-color="#ffd47a"/><stop offset=".25" stop-color="#e75b2c"/><stop offset=".58" stop-color="#293f78"/><stop offset="1" stop-color="#07080b"/></radialGradient>
      <rect width="${size}" height="${size}" fill="url(#g1)"/>
      <path d="M-40 690 C190 500 298 720 520 560 S870 260 1320 420 L1320 1320 L-40 1320Z" fill="#100b12" opacity=".72" filter="url(#rough)"/>
      <path d="M-60 650 C210 475 335 665 560 520 S900 255 1340 380" fill="none" stroke="#ffbd67" stroke-width="22" opacity=".5" filter="url(#rough)"/>
      ${stars(180)}
    `),
  },
  {
    id: "aurora-ink",
    title: "Aurora Ink",
    subtitle: "Green aurora in black water",
    tags: ["ambient", "cold", "liquid"],
    dominantColor: "#4bd17b",
    recommendedScene: "image-warp",
    art: () => svg(`
      <linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#081312"/><stop offset=".42" stop-color="#123e32"/><stop offset=".72" stop-color="#0d1d24"/><stop offset="1" stop-color="#06070a"/></linearGradient>
      <rect width="${size}" height="${size}" fill="url(#g2)"/>
      <path d="M-80 520 C220 140 370 800 640 390 C850 70 1010 520 1360 210 L1360 590 C1040 810 880 410 660 720 C410 1070 180 650 -80 910Z" fill="#7bff9b" opacity=".46" filter="url(#rough)"/>
      <path d="M120 920 C410 730 505 1030 780 820 C970 675 1080 760 1260 650" stroke="#d6ff9a" stroke-width="9" fill="none" opacity=".45" filter="url(#rough)"/>
      ${stars(90, "#e9ffd6")}
    `),
  },
  {
    id: "bauhaus-mono",
    title: "Bauhaus Mono",
    subtitle: "Paper geometry in black and cream",
    tags: ["geometric", "minimal", "print"],
    dominantColor: "#d9d0bd",
    recommendedScene: "image-pulse",
    art: () => svg(`
      <rect width="${size}" height="${size}" fill="#d9d0bd"/>
      <rect x="0" y="0" width="430" height="${size}" fill="#111"/>
      <rect x="840" y="0" width="440" height="${size}" fill="#ece4d2"/>
      <circle cx="442" cy="530" r="265" fill="#080808"/>
      <circle cx="650" cy="530" r="270" fill="#e8dfcc" opacity=".9"/>
      <rect x="548" y="60" width="94" height="1020" fill="#111"/>
      <rect x="720" y="0" width="55" height="${size}" fill="#b7ae9f"/>
      <rect x="902" y="880" width="260" height="260" fill="#050505"/>
      <circle cx="925" cy="220" r="150" fill="#e8dfcc"/>
      ${lines({ count: 10, color: "#111", opacity: .13, width: 3 })}
    `),
  },
  {
    id: "target-press",
    title: "Target Press",
    subtitle: "Concentric ink target",
    tags: ["geometric", "monochrome", "rhythmic"],
    dominantColor: "#c8bda5",
    recommendedScene: "image-pulse",
    art: () => svg(`
      <rect width="${size}" height="${size}" fill="#c8bda5"/>
      <rect width="${size}" height="${size}" fill="#101010" opacity=".08"/>
      ${circles({ count: 15, color: "#12110f", opacity: .92, width: 23, gap: 40 })}
      <circle cx="640" cy="640" r="86" fill="#111"/>
      <circle cx="640" cy="640" r="24" fill="#c8bda5"/>
      <path d="M-40 220 L1320 1040" stroke="#fff4dd" stroke-width="42" opacity=".16"/>
    `),
  },
  {
    id: "oil-current",
    title: "Oil Current",
    subtitle: "Iridescent liquid stream",
    tags: ["liquid", "colorful", "vj"],
    dominantColor: "#19b8ce",
    recommendedScene: "image-warp",
    art: () => svg(`
      <linearGradient id="g5" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071014"/><stop offset=".5" stop-color="#121014"/><stop offset="1" stop-color="#05070b"/></linearGradient>
      <rect width="${size}" height="${size}" fill="url(#g5)"/>
      <path d="M-120 830 C120 500 250 710 430 490 C630 245 760 690 1010 430 C1160 275 1240 245 1390 240" stroke="#19b8ce" stroke-width="132" fill="none" opacity=".74" filter="url(#rough)"/>
      <path d="M-120 780 C140 425 315 690 510 455 C675 255 830 640 1060 410 C1200 270 1280 230 1400 220" stroke="#f2b23d" stroke-width="58" fill="none" opacity=".7" filter="url(#rough)"/>
      <path d="M-100 855 C130 540 340 780 520 560 C720 320 910 720 1180 390" stroke="#d83f8d" stroke-width="36" fill="none" opacity=".6" filter="url(#rough)"/>
      ${stars(70, "#ffe9b5")}
    `),
  },
  {
    id: "lava-cells",
    title: "Lava Cells",
    subtitle: "Warm analog bubbles",
    tags: ["liquid", "warm", "retro"],
    dominantColor: "#f05a28",
    recommendedScene: "image-warp",
    art: () => svg(`
      <linearGradient id="g6" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f7d07a"/><stop offset=".48" stop-color="#ef5b2c"/><stop offset="1" stop-color="#140b0a"/></linearGradient>
      <rect width="${size}" height="${size}" fill="url(#g6)"/>
      ${Array.from({ length: 42 }, (_, i) => {
        const x = (Math.sin(i * 12.989) * .5 + .5) * 1260;
        const y = (Math.sin(i * 78.233) * .5 + .5) * 1260;
        const r = 28 + (Math.sin(i * 44.7) * .5 + .5) * 150;
        const c = i % 3 === 0 ? "#150b08" : i % 3 === 1 ? "#f7c36b" : "#ff3d1f";
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${c}" opacity=".64" stroke="#120807" stroke-width="8"/>`;
      }).join("")}
    `),
  },
  {
    id: "rain-neon",
    title: "Rain Neon",
    subtitle: "Wet city lights as abstraction",
    tags: ["city", "neon", "night"],
    dominantColor: "#22c7d8",
    recommendedScene: "image-pulse",
    art: () => svg(`
      <linearGradient id="g7" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#081013"/><stop offset=".5" stop-color="#18343b"/><stop offset="1" stop-color="#160b0a"/></linearGradient>
      <rect width="${size}" height="${size}" fill="url(#g7)"/>
      ${Array.from({ length: 54 }, (_, i) => {
        const x = i * 27 - 90;
        const h = 160 + (Math.sin(i * 1.7) * .5 + .5) * 830;
        const c = i % 4 === 0 ? "#22c7d8" : i % 4 === 1 ? "#ff5a35" : i % 4 === 2 ? "#f4e7b6" : "#0e1115";
        return `<rect x="${x}" y="${(size - h).toFixed(1)}" width="${12 + (i % 7) * 8}" height="${h.toFixed(1)}" fill="${c}" opacity="${i % 4 === 3 ? .62 : .38}" filter="url(#rough)"/>`;
      }).join("")}
      ${lines({ count: 36, color: "#f8f0de", opacity: .12, rotate: 1, width: 2 })}
    `),
  },
  {
    id: "vhs-harbor",
    title: "VHS Harbor",
    subtitle: "Purple blue scanline glow",
    tags: ["city", "vhs", "retro"],
    dominantColor: "#8567ff",
    recommendedScene: "image-pulse",
    art: () => svg(`
      <linearGradient id="g8" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#2d1d58"/><stop offset=".52" stop-color="#17315a"/><stop offset="1" stop-color="#09080d"/></linearGradient>
      <rect width="${size}" height="${size}" fill="url(#g8)"/>
      <rect x="0" y="685" width="${size}" height="260" fill="#fc4277" opacity=".32" filter="url(#rough)"/>
      <rect x="0" y="780" width="${size}" height="180" fill="#49d7ff" opacity=".25" filter="url(#rough)"/>
      ${lines({ count: 95, color: "#d5c9ff", opacity: .18, rotate: 90, width: 2 })}
      <path d="M90 700 C310 590 470 760 680 650 C830 570 970 685 1190 625" stroke="#f7e7ff" stroke-width="17" opacity=".3" fill="none"/>
    `),
  },
  {
    id: "moss-signal",
    title: "Moss Signal",
    subtitle: "Organic green texture",
    tags: ["nature", "texture", "dark"],
    dominantColor: "#5aa12f",
    recommendedScene: "image-warp",
    art: () => svg(`
      <linearGradient id="g9" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#080907"/><stop offset=".48" stop-color="#2b321e"/><stop offset="1" stop-color="#050605"/></linearGradient>
      <rect width="${size}" height="${size}" fill="url(#g9)"/>
      ${Array.from({ length: 120 }, (_, i) => {
        const x = (Math.sin(i * 28.1) * .5 + .5) * size;
        const y = (Math.sin(i * 41.9) * .5 + .5) * size;
        const r = 15 + (Math.sin(i * 9.4) * .5 + .5) * 82;
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${i % 2 ? "#6ed043" : "#1f130d"}" opacity=".26" filter="url(#rough)"/>`;
      }).join("")}
      <path d="M170 -40 C430 300 210 550 530 760 C830 960 780 1170 1020 1340" stroke="#1a100c" stroke-width="180" opacity=".68" fill="none" filter="url(#rough)"/>
    `),
  },
  {
    id: "dune-ghost",
    title: "Dune Ghost",
    subtitle: "Soft sand shadows",
    tags: ["nature", "minimal", "warm"],
    dominantColor: "#c5a56b",
    recommendedScene: "image-warp",
    art: () => svg(`
      <linearGradient id="g10" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e8d1a1"/><stop offset=".52" stop-color="#b3915b"/><stop offset="1" stop-color="#342719"/></linearGradient>
      <rect width="${size}" height="${size}" fill="url(#g10)"/>
      <path d="M-140 950 C120 580 320 505 620 665 C850 780 1020 630 1420 285 L1420 1400 L-140 1400Z" fill="#201915" opacity=".52" filter="url(#rough)"/>
      <path d="M-100 730 C260 430 480 570 760 380 C985 228 1140 205 1390 120" stroke="#f5dfaa" stroke-width="118" opacity=".35" fill="none" filter="url(#rough)"/>
      ${lines({ count: 58, color: "#3b2b19", opacity: .12, rotate: -18, width: 2 })}
    `),
  },
  {
    id: "red-field",
    title: "Red Field",
    subtitle: "Rothko heat blocks",
    tags: ["painting", "warm", "minimal"],
    dominantColor: "#c73224",
    recommendedScene: "image-pulse",
    art: () => svg(`
      <rect width="${size}" height="${size}" fill="#1d100d"/>
      <rect x="115" y="145" width="1050" height="470" rx="24" fill="#d64a1c" opacity=".88" filter="url(#rough)"/>
      <rect x="130" y="650" width="1015" height="390" rx="24" fill="#9d171d" opacity=".92" filter="url(#rough)"/>
      <rect x="75" y="85" width="1130" height="1070" fill="none" stroke="#ffb46b" stroke-width="6" opacity=".16"/>
    `),
  },
  {
    id: "black-brush",
    title: "Black Brush",
    subtitle: "Ink slash on paper",
    tags: ["painting", "print", "monochrome"],
    dominantColor: "#111111",
    recommendedScene: "image-pulse",
    art: () => svg(`
      <rect width="${size}" height="${size}" fill="#ede4d1"/>
      <path d="M-90 920 C240 760 370 650 520 455 C660 270 880 230 1390 78" stroke="#090909" stroke-width="170" stroke-linecap="round" fill="none" opacity=".95" filter="url(#rough)"/>
      <path d="M120 1080 C365 855 585 800 910 560" stroke="#090909" stroke-width="46" stroke-linecap="round" fill="none" opacity=".78" filter="url(#rough)"/>
      <path d="M80 340 C200 460 360 520 570 470" stroke="#090909" stroke-width="18" fill="none" opacity=".3"/>
    `),
  },
  {
    id: "holo-circuit",
    title: "Holo Circuit",
    subtitle: "Pastel PCB haze",
    tags: ["cyber", "sci-fi", "bright"],
    dominantColor: "#7de6e6",
    recommendedScene: "image-pulse",
    art: () => svg(`
      <linearGradient id="g13" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#7de6e6"/><stop offset=".45" stop-color="#a08cff"/><stop offset=".8" stop-color="#ffe277"/><stop offset="1" stop-color="#092027"/></linearGradient>
      <rect width="${size}" height="${size}" fill="url(#g13)"/>
      ${lines({ count: 28, color: "#ffffff", opacity: .24, rotate: 0, width: 4 })}
      ${lines({ count: 24, color: "#223a53", opacity: .22, rotate: 90, width: 3 })}
      ${Array.from({ length: 44 }, (_, i) => `<circle cx="${(80 + (i * 151) % 1120)}" cy="${(90 + (i * 97) % 1080)}" r="${12 + i % 5 * 5}" fill="none" stroke="#23334c" stroke-width="5" opacity=".28"/>`).join("")}
      <path d="M80 980 L390 670 L390 450 L740 450 L970 220" stroke="#faffb7" stroke-width="15" fill="none" opacity=".58"/>
    `),
  },
  {
    id: "terminal-grid",
    title: "Terminal Grid",
    subtitle: "Green horizon matrix",
    tags: ["cyber", "grid", "dark"],
    dominantColor: "#24e36d",
    recommendedScene: "image-pulse",
    art: () => svg(`
      <rect width="${size}" height="${size}" fill="#030604"/>
      <linearGradient id="gg" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#030604"/><stop offset=".65" stop-color="#031307"/><stop offset="1" stop-color="#061f0d"/></linearGradient>
      <rect width="${size}" height="${size}" fill="url(#gg)"/>
      <g transform="perspective(600px)">
        ${lines({ count: 32, color: "#24e36d", opacity: .42, rotate: 0, width: 3 })}
        ${lines({ count: 24, color: "#24e36d", opacity: .5, rotate: 90, width: 3 })}
      </g>
      <path d="M0 725 L1280 725" stroke="#24e36d" stroke-width="5" opacity=".8"/>
      <path d="M-140 1280 L640 725 L1420 1280" stroke="#24e36d" stroke-width="4" opacity=".52" fill="none"/>
    `),
  },
  {
    id: "poster-torn",
    title: "Poster Torn",
    subtitle: "No-text collage fragments",
    tags: ["poster", "print", "collage"],
    dominantColor: "#c94f3d",
    recommendedScene: "image-pulse",
    art: () => svg(`
      <rect width="${size}" height="${size}" fill="#d7cbb5"/>
      <path d="M0 0 L490 0 L430 1280 L0 1280Z" fill="#111"/>
      <path d="M445 0 L820 0 L760 1280 L315 1280Z" fill="#c6332b"/>
      <path d="M720 210 L1280 0 L1280 1280 L640 1040Z" fill="#171515"/>
      <path d="M300 820 L745 610 L1015 800 L480 1095Z" fill="#17a7a9"/>
      <path d="M845 735 L1280 650 L1280 1280 L1000 1280Z" fill="#d7a72e"/>
      <path d="M0 0 L1280 0 L1280 1280 L0 1280Z" fill="none" stroke="#f6efe0" stroke-width="34" opacity=".42" filter="url(#rough)"/>
    `),
  },
  {
    id: "dust-bloom",
    title: "Dust Bloom",
    subtitle: "Gold smoke in black",
    tags: ["cosmic", "ambient", "dark"],
    dominantColor: "#b8995b",
    recommendedScene: "image-warp",
    art: () => svg(`
      <rect width="${size}" height="${size}" fill="#080806"/>
      <radialGradient id="g16" cx="54%" cy="44%" r="45%"><stop stop-color="#fff0bf" stop-opacity=".8"/><stop offset=".42" stop-color="#b8995b" stop-opacity=".44"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      <circle cx="685" cy="570" r="560" fill="url(#g16)" filter="url(#rough)"/>
      <path d="M325 790 C440 350 740 240 970 420 C1110 530 1030 720 800 750 C600 775 505 900 380 1040" stroke="#f6dca4" stroke-width="115" opacity=".26" fill="none" filter="url(#rough)"/>
      ${stars(220, "#ffd27d")}
    `),
  },
  {
    id: "laser-red",
    title: "Laser Red",
    subtitle: "Horizon beam grid",
    tags: ["cyber", "laser", "high-energy"],
    dominantColor: "#ff2222",
    recommendedScene: "image-pulse",
    art: () => svg(`
      <rect width="${size}" height="${size}" fill="#080102"/>
      <radialGradient id="g17" cx="50%" cy="58%" r="55%"><stop stop-color="#ff2a1f" stop-opacity=".55"/><stop offset=".4" stop-color="#3d0307" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      <rect width="${size}" height="${size}" fill="url(#g17)"/>
      <path d="M0 694 L1280 694" stroke="#ff3028" stroke-width="12"/>
      ${Array.from({ length: 24 }, (_, i) => `<path d="M640 694 L${-260 + i * 78} 1280" stroke="#ff3028" stroke-width="3" opacity=".7"/>`).join("")}
      ${Array.from({ length: 15 }, (_, i) => `<path d="M0 ${760 + i * 38} L1280 ${760 + i * 38}" stroke="#ff3028" stroke-width="${i < 4 ? 2 : 4}" opacity="${.18 + i * .035}"/>`).join("")}
      <path d="M640 0 L640 1280" stroke="#ff3028" stroke-width="4" opacity=".75"/>
    `),
  },
  {
    id: "ice-vapor",
    title: "Ice Vapor",
    subtitle: "Blue smoke wash",
    tags: ["cold", "ambient", "texture"],
    dominantColor: "#9edfff",
    recommendedScene: "image-warp",
    art: () => svg(`
      <linearGradient id="g18" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0a3142"/><stop offset=".55" stop-color="#d8f4ff"/><stop offset="1" stop-color="#08202c"/></linearGradient>
      <rect width="${size}" height="${size}" fill="url(#g18)"/>
      <path d="M-120 980 C145 740 285 950 455 640 C595 385 810 545 880 260 C955 -45 1125 145 1420 -50" stroke="#e9fbff" stroke-width="210" opacity=".54" fill="none" filter="url(#rough)"/>
      <path d="M-80 400 C280 655 465 190 720 480 C935 720 1040 430 1370 690" stroke="#5bb7df" stroke-width="130" opacity=".34" fill="none" filter="url(#rough)"/>
    `),
  },
  {
    id: "tape-amber",
    title: "Tape Amber",
    subtitle: "Analog horizontal blur",
    tags: ["retro", "warm", "film"],
    dominantColor: "#e68a24",
    recommendedScene: "image-pulse",
    art: () => svg(`
      <linearGradient id="g19" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#32120b"/><stop offset=".3" stop-color="#e68a24"/><stop offset=".58" stop-color="#f1c367"/><stop offset="1" stop-color="#24363b"/></linearGradient>
      <rect width="${size}" height="${size}" fill="url(#g19)"/>
      ${Array.from({ length: 48 }, (_, i) => `<rect x="${-80 + (i % 7) * 23}" y="${i * 29}" width="${900 + (i % 5) * 190}" height="${10 + i % 8 * 8}" fill="${i % 3 === 0 ? "#fff0a8" : i % 3 === 1 ? "#1c130f" : "#e95123"}" opacity="${.12 + (i % 8) * .035}" filter="url(#rough)"/>`).join("")}
      <rect x="0" y="0" width="${size}" height="${size}" fill="#000" opacity=".08"/>
    `),
  },
  {
    id: "gold-particles",
    title: "Gold Particles",
    subtitle: "Black and gold spark field",
    tags: ["particles", "lux", "dark"],
    dominantColor: "#d7a642",
    recommendedScene: "image-warp",
    art: () => svg(`
      <rect width="${size}" height="${size}" fill="#050504"/>
      <path d="M-70 850 C260 590 435 760 650 575 C875 380 1110 390 1370 250" stroke="#d7a642" stroke-width="95" opacity=".4" fill="none" filter="url(#rough)"/>
      ${stars(620, "#e7b348")}
      <circle cx="860" cy="500" r="340" fill="#d7a642" opacity=".08"/>
    `),
  },
];

const manifest = {
  version: 1,
  generatedAt: "2026-05-21",
  backgrounds: backgrounds.map(({ id, title, subtitle, tags, dominantColor, recommendedScene }) => ({
    id,
    title,
    subtitle,
    tags,
    src: `/assets/backgrounds/${id}.svg`,
    thumb: `/assets/backgrounds/${id}-thumb.svg`,
    dominantColor,
    recommendedScene,
    license: "CC0-style generated asset",
    credit: "Generated by Codex for VibeStrudel",
  })),
};

for (const bg of backgrounds) {
  const content = bg.art();
  writeFileSync(join(outDir, `${bg.id}.svg`), content, "utf8");
  writeFileSync(join(outDir, `${bg.id}-thumb.svg`), content.replace(`width="${size}" height="${size}"`, `width="200" height="200"`), "utf8");
}

writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Generated ${backgrounds.length} backgrounds in ${outDir}`);
