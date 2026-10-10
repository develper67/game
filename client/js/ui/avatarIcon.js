// 2D avatar portraits drawn on a canvas (used in lists, profile, party slots).
const cache = new Map();

export function avatarDataUrl(av = {}, size = 96) {
  const key = `${av.color}|${av.hat}|${av.face}|${size}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const s = size / 96;
  x.scale(s, s);
  // background
  const g = x.createRadialGradient(48, 40, 10, 48, 48, 60);
  g.addColorStop(0, lighten(av.color || '#4cc9f0', 0.35));
  g.addColorStop(1, av.color || '#4cc9f0');
  x.fillStyle = g;
  x.beginPath(); x.arc(48, 48, 48, 0, Math.PI * 2); x.fill();
  // body
  x.fillStyle = darken(av.color || '#4cc9f0', 0.75);
  x.beginPath(); x.roundRect(22, 72, 52, 40, 12); x.fill();
  // head
  const bot = av.face === 'bot';
  x.fillStyle = bot ? '#b0bec5' : '#ffcc99';
  x.beginPath(); x.roundRect(26, 26, 44, 44, 8); x.fill();
  // face
  x.fillStyle = bot ? '#1b2a3a' : 'transparent';
  if (bot) { x.beginPath(); x.roundRect(30, 34, 36, 28, 5); x.fill(); }
  x.fillStyle = '#1a1a1a'; x.strokeStyle = '#1a1a1a'; x.lineWidth = 3; x.lineCap = 'round';
  const eye = (cx, cy, r = 3.5) => { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); };
  switch (av.face) {
    case 'bot': x.fillStyle = '#4cc9f0'; x.fillRect(35, 42, 8, 5); x.fillRect(53, 42, 8, 5); x.fillRect(40, 54, 16, 3); break;
    case 'cool': x.fillRect(31, 40, 34, 7); x.beginPath(); x.arc(48, 52, 7, 0.2 * Math.PI, 0.8 * Math.PI); x.stroke(); break;
    case 'angry': eye(39, 45); eye(57, 45); x.beginPath(); x.moveTo(33, 38); x.lineTo(43, 41); x.moveTo(63, 38); x.lineTo(53, 41); x.stroke(); x.beginPath(); x.arc(48, 62, 7, 1.15 * Math.PI, 1.85 * Math.PI); x.stroke(); break;
    case 'derp': eye(39, 44, 5); eye(58, 47, 3); x.beginPath(); x.moveTo(40, 58); x.quadraticCurveTo(48, 64, 57, 56); x.stroke(); break;
    case 'wink': eye(39, 45); x.beginPath(); x.moveTo(52, 45); x.lineTo(62, 45); x.stroke(); x.beginPath(); x.arc(48, 52, 8, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke(); break;
    default: eye(39, 45); eye(57, 45); x.beginPath(); x.arc(48, 52, 9, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke();
  }
  // hat
  switch (av.hat) {
    case 'cap': x.fillStyle = '#e63946'; x.beginPath(); x.roundRect(24, 18, 48, 14, [10, 10, 2, 2]); x.fill(); x.fillRect(48, 28, 30, 5); break;
    case 'beanie': x.fillStyle = '#e63946'; x.beginPath(); x.arc(48, 30, 23, Math.PI, 0); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(48, 7, 5, 0, Math.PI * 2); x.fill(); break;
    case 'cowboy': x.fillStyle = '#8b5a2b'; x.fillRect(14, 24, 68, 6); x.beginPath(); x.roundRect(32, 8, 32, 18, 6); x.fill(); break;
    case 'crown': x.fillStyle = '#ffd23f'; x.beginPath(); x.moveTo(28, 28); x.lineTo(28, 12); x.lineTo(38, 20); x.lineTo(48, 8); x.lineTo(58, 20); x.lineTo(68, 12); x.lineTo(68, 28); x.fill(); break;
    case 'tophat': x.fillStyle = '#111'; x.fillRect(20, 24, 56, 5); x.fillRect(32, 2, 32, 24); x.fillStyle = '#c0392b'; x.fillRect(32, 18, 32, 5); break;
    case 'party': x.fillStyle = '#ff4d6d'; x.beginPath(); x.moveTo(36, 28); x.lineTo(48, 0); x.lineTo(60, 28); x.fill(); x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(48, 2, 4, 0, Math.PI * 2); x.fill(); break;
    default:
  }
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export function avatarImg(av, cls = '') {
  const img = document.createElement('img');
  img.className = 'avatar-img ' + cls;
  img.alt = '';
  img.src = avatarDataUrl(av, cls === 'lg' ? 192 : 96);
  return img;
}

function hexToRgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lighten(hex, k) { const [r, g, b] = hexToRgb(hex); return `rgb(${r + (255 - r) * k | 0},${g + (255 - g) * k | 0},${b + (255 - b) * k | 0})`; }
function darken(hex, k) { const [r, g, b] = hexToRgb(hex); return `rgb(${r * k | 0},${g * k | 0},${b * k | 0})`; }
