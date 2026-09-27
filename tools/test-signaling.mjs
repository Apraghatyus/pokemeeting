// Prueba del servidor de senalizacion sin navegador: dos clientes WebSocket
// crean una sala, se emparejan y se pasan un mensaje.
import { WebSocket } from 'ws';

const URL = process.env.SIGNALING_URL ?? 'ws://localhost:8787';
const rom = (crc32) => ({
  title: 'POKEMON FIRE',
  gameCode: 'BPRS',
  version: 0,
  crc32,
  fileName: 'test.gba',
});

const open = () =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });

const next = (ws, timeoutMs = 5000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no llego ninguna respuesta a tiempo')), timeoutMs);
    ws.once('message', (raw) => {
      clearTimeout(timer);
      resolve(JSON.parse(raw.toString()));
    });
  });

const say = (ws, msg) => ws.send(JSON.stringify(msg));

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FALLO'} ${name}${detail ? '  -> ' + detail : ''}`);
  if (!ok) failures += 1;
};

// --- 1. crear sala ---
const host = await open();
say(host, { type: 'create-room', password: 'pikachu', rom: rom('aaaa1111') });
const created = await next(host);
check('crear sala devuelve codigo', created.type === 'room-created' && /^[A-Z2-9]{6}$/.test(created.roomCode), created.roomCode);
const code = created.roomCode;

// --- 2. contrasena incorrecta ---
const intruder = await open();
say(intruder, { type: 'join-room', roomCode: code, password: 'incorrecta', rom: rom('aaaa1111') });
const rejected = await next(intruder);
check('contrasena incorrecta se rechaza', rejected.type === 'error' && rejected.code === 'contrasena-incorrecta');
intruder.close();

// --- 3. otra edicion se rechaza ---
//
// La regla es misma edicion: mismo juego y mismo idioma. Verde Hoja no entra
// en una sala de Rojo Fuego, ni la version inglesa en una espanola.
const leafGreen = await open();
say(leafGreen, { type: 'join-room', roomCode: code, password: 'pikachu', rom: { ...rom('bbbb2222'), gameCode: 'BPGS' } });
const rejectedGame = await next(leafGreen);
check('Verde Hoja no entra en una sala de Rojo Fuego',
  rejectedGame.type === 'error' && rejectedGame.code === 'rom-incompatible', rejectedGame.message);
leafGreen.close();

const english = await open();
say(english, { type: 'join-room', roomCode: code, password: 'pikachu', rom: { ...rom('cccc3333'), gameCode: 'BPRE' } });
const rejectedLang = await next(english);
check('otro idioma del mismo juego tampoco entra',
  rejectedLang.type === 'error' && rejectedLang.code === 'rom-incompatible', rejectedLang.message);
english.close();

// --- 4. union correcta con CRC distinto (caso randomizado) ---
const guestRom = rom('bbbb2222');
const guest = await open();
const hostNotified = next(host);
say(guest, { type: 'join-room', roomCode: code, password: 'pikachu', rom: guestRom });
const joined = await next(guest);
check('union con CRC distinto se permite', joined.type === 'room-joined', joined.type === 'room-joined' ? `ve la ROM del anfitrion crc=${joined.peerRom.crc32}` : joined.message);
const notice = await hostNotified;
check('el anfitrion recibe aviso de que entra alguien', notice.type === 'peer-joined' && notice.peerRom.crc32 === 'bbbb2222');

// --- 5. reenvio de senales en los dos sentidos ---
const toGuest = next(guest);
say(host, { type: 'signal', data: { kind: 'offer', sdp: 'prueba' } });
const relayed = await toGuest;
check('senal anfitrion -> invitado', relayed.type === 'signal' && relayed.data.sdp === 'prueba');

const toHost = next(host);
say(guest, { type: 'signal', data: { kind: 'answer', sdp: 'vuelta' } });
const back = await toHost;
check('senal invitado -> anfitrion', back.type === 'signal' && back.data.sdp === 'vuelta');

// --- 6. salida de un jugador ---
const departure = next(host);
guest.close();
const goodbye = await departure;
check('se avisa cuando el companero se va', goodbye.type === 'peer-left');

// --- 7. sala inexistente ---
const lost = await open();
say(lost, { type: 'join-room', roomCode: 'ZZZZZZ', password: 'x', rom: rom('cccc') });
const missing = await next(lost);
check('sala inexistente da error claro', missing.type === 'error' && missing.code === 'sala-no-encontrada');
lost.close();

host.close();
console.log(failures === 0 ? '\nTODO CORRECTO' : `\n${failures} COMPROBACIONES FALLIDAS`);
process.exit(failures === 0 ? 0 : 1);
