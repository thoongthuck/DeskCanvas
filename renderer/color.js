// 색 계산 — '직접 고르기'로 정한 쪽지 색(RGB)에 맞는 접힌 모서리 그림 · 어두운 색 판단
// (정해진 6색은 icons/fold-<이름>.svg 를 그대로 쓰고, 직접 고른 색만 여기서 그림을 만듦)

export function isHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function hslToHex(h, s, l) {
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

// 밝기 (0 = 검정, 1 = 흰색)
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// 어두운 쪽지 색이면 글자·아이콘을 밝게 바꿈
export function isDarkColor(hex) {
  return luminance(hex) < 0.3;
}

const foldCache = new Map();

// 접힌 모서리 그림 (icons/fold-yellow.svg 와 같은 모양, 색만 계산)
//   접힌 면: 배경보다 조금씩 진하게 · 접힌 선: 더 진하게 · 그림자: 같은 색 계열의 어두운 색
export function customFoldImage(hex) {
  if (foldCache.has(hex)) return foldCache.get(hex);
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  const flap1 = hslToHex(h, s, l - 5);
  const flap2 = hslToHex(h, s, l - 9);
  const flap3 = hslToHex(h, s + 5, l - 13);
  const crease = hslToHex(h, s, l - 22);
  const shadow = hslToHex(h, Math.max(20, Math.min(60, s)), Math.min(28, l * 0.4));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">`
    + `<defs><linearGradient id="f" gradientUnits="userSpaceOnUse" x1="2.5" y1="2.5" x2="15.25" y2="15.25">`
    + `<stop offset="0" stop-color="${flap1}"/><stop offset=".55" stop-color="${flap2}"/><stop offset="1" stop-color="${flap3}"/></linearGradient>`
    + `<linearGradient id="s" gradientUnits="userSpaceOnUse" x1="15.25" y1="15.25" x2="24.485" y2="24.485">`
    + `<stop offset="0" stop-color="${shadow}" stop-opacity=".2"/><stop offset=".45" stop-color="${shadow}" stop-opacity=".08"/>`
    + `<stop offset="1" stop-color="${shadow}" stop-opacity=".015"/></linearGradient>`
    + `<filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation=".7"/></filter></defs>`
    + `<path d="M28 0V16A12 12 0 0 1 16 28H0A6.036 6.036 0 0 0 4.268 26.232L26.232 4.268A6.036 6.036 0 0 0 28 0Z" fill="url(#s)" filter="url(#b)"/>`
    + `<path d="M0 0H28A6.036 6.036 0 0 1 26.232 4.268L4.268 26.232A6.036 6.036 0 0 1 0 28Z" fill="${hex}"/>`
    + `<path d="M9.5 2.5H27.458A6.036 6.036 0 0 1 26.232 4.268L4.268 26.232A6.036 6.036 0 0 1 2.5 27.458V9.5A7 7 0 0 1 9.5 2.5Z" fill="url(#f)"/>`
    + `<path d="M26.232 4.268L4.268 26.232" fill="none" stroke="${crease}" stroke-opacity=".5" stroke-width=".8" stroke-linecap="round"/>`
    + `<path d="M26.858 2.5H9.5A7 7 0 0 0 2.5 9.5V26.858" fill="none" stroke="#FFFFFF" stroke-opacity=".45" stroke-width=".7" stroke-linecap="round"/>`
    + `</svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  foldCache.set(hex, url);
  return url;
}
