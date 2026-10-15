import { readFileSync } from 'node:fs';
import { leerTexto } from './packages/pokemon/src/index.ts';

const rom = readFileSync(process.argv[2]);
const BASE = 0x3d4f50, ENTRADA = 44, NOMBRE = 14;
const nombreDe = (id) =>
  id > 0 && id <= 377
    ? leerTexto(new Uint8Array(rom.subarray(BASE + id * ENTRADA, BASE + id * ENTRADA + NOMBRE)))
    : `<${id}>`;
const real = (id) => id > 0 && id <= 377 && rom.readUInt16LE(BASE + id * ENTRADA + NOMBRE) === id
  && !/^[?·]+$/.test(nombreDe(id));

// Los offsets del INI del propio randomizer, para BPRS.
import { execSync } from 'node:child_process';
const ini = execSync('python -c "' +
  'import zipfile,sys;' +
  "z=zipfile.ZipFile('tools/randomizer/PokeRandoZX.jar');" +
  "d=z.read('com/dabomstew/pkrandom/config/gen3_offsets.ini').decode('utf-8','replace');" +
  'sec=None;cur={};' +
  'import re;' +
  "lines=d.splitlines();" +
  'out=[];' +
  'for l in lines:\n' +
  "    l=l.strip()\n" +
  "    if l.startswith('['): cur={}\n" +
  "    elif '=' in l:\n" +
  "        k,v=l.split('=',1); cur[k.strip()]=v.strip()\n" +
  "        if k.strip()=='SkipShops' and cur.get('Game')=='BPRS': out.append((cur.get('ShopItemOffsets'),v.strip()))\n" +
  'print(out[0] if out else ())"', { encoding: 'utf8' });
console.log('INI:', ini.trim().slice(0, 300));
