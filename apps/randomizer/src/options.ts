// Catalogo de lo que se puede aleatorizar.
//
// Es la unica fuente de verdad: la interfaz pinta lo que diga este fichero, y
// de aqui sale tambien el script que construye el fichero de ajustes. Anadir
// una opcion es anadir una entrada.
//
// Sobre `index`: los setters del randomizer reciben un boolean[] donde **la
// posicion es el ordinal del enum**, y la posicion 0 es siempre UNCHANGED.
// Poner true en la 0 significa "no cambiar nada", no "la primera opcion". Un
// ejemplo anterior se equivoco justo ahi y producia una ROM sin aleatorizar.

export type RandomizerOption = {
  id: string;
  label: string;
  description: string;
  /** Metodo de Settings al que llamar. */
  setter: string;
  /** Ordinal del enum que queremos activar. */
  index: number;
  /** Cuantos valores tiene ese enum. */
  total: number;
};

export const OPTIONS: readonly RandomizerOption[] = [
  {
    id: 'salvajes',
    label: 'Pokemon salvajes',
    description: 'Cambia que aparece en cada ruta, cueva y agua.',
    setter: 'setWildPokemonMod',
    index: 1, // RANDOM
    total: 4,
  },
  {
    id: 'iniciales',
    label: 'Pokemon iniciales',
    description: 'Los tres que ofrece el profesor al empezar.',
    setter: 'setStartersMod',
    index: 2, // COMPLETELY_RANDOM
    total: 4,
  },
  {
    id: 'fijos',
    label: 'Pokemon fijos y regalos',
    description: 'Legendarios, fosiles y los que te dan en la aventura.',
    setter: 'setStaticPokemonMod',
    index: 3, // SIMILAR_STRENGTH
    total: 4,
  },
  {
    id: 'entrenadores',
    label: 'Entrenadores',
    description: 'Los equipos de rivales, lideres y Alto Mando.',
    setter: 'setTrainersMod',
    index: 1, // RANDOM
    total: 6,
  },
  {
    id: 'movimientos',
    label: 'Movimientos que aprenden',
    description: 'Que ataque aprende cada Pokemon y a que nivel.',
    setter: 'setMovesetsMod',
    index: 1, // RANDOM_PREFER_SAME_TYPE, mas jugable que el aleatorio total
    total: 4,
  },
  {
    id: 'mts',
    label: 'MTs',
    description: 'Que movimiento ensena cada maquina tecnica.',
    setter: 'setTmsMod',
    index: 1, // RANDOM
    total: 2,
  },
  {
    id: 'objetos',
    label: 'Objetos del mapa',
    description: 'Los objetos que se recogen del suelo.',
    setter: 'setFieldItemsMod',
    index: 2, // RANDOM
    total: 4,
  },
  {
    id: 'tiendas',
    label: 'Objetos de tienda',
    description: 'Lo que venden los centros comerciales.',
    setter: 'setShopItemsMod',
    index: 2, // RANDOM
    total: 3,
  },
  {
    id: 'estadisticas',
    label: 'Estadisticas base',
    description: 'Ataque, defensa y velocidad de cada especie.',
    setter: 'setBaseStatisticsMod',
    index: 2, // RANDOM
    total: 3,
  },
  {
    id: 'habilidades',
    label: 'Habilidades',
    description: 'La habilidad de cada especie.',
    setter: 'setAbilitiesMod',
    index: 1, // RANDOMIZE
    total: 2,
  },
];

export const optionById = (id: string): RandomizerOption | undefined =>
  OPTIONS.find((option) => option.id === id);

/** Lo que ve la interfaz: sin los detalles de como se aplica. */
export const publicOptions = () =>
  OPTIONS.map(({ id, label, description }) => ({ id, label, description }));

/**
 * Construye el script de jjs que escribe el fichero de ajustes.
 *
 * Se genera en vez de mantenerlo a mano para que el catalogo de arriba sea el
 * unico sitio donde vive la correspondencia. Los identificadores ya vienen
 * validados contra el catalogo, asi que aqui no entra nada que no sea nuestro.
 */
export const buildSettingsScript = (chosen: readonly RandomizerOption[]): string => {
  const calls = chosen
    .map((option) => `s.${option.setter}(elegir(${option.index}, ${option.total}));`)
    .join('\n');

  return `var Settings = Java.type('com.dabomstew.pkrandom.Settings');
var CustomNamesSet = Java.type('com.dabomstew.pkrandom.CustomNamesSet');
var ExpCurve = Java.type('com.dabomstew.pkrandom.pokemon.ExpCurve');
var FileOutputStream = Java.type('java.io.FileOutputStream');

var destino = arguments[0];
var s = new Settings();

// Un Settings recien creado deja cuatro campos a null y al guardar revienta.
s.setCustomNames(new CustomNamesSet());
s.setRomName('');
s.setSelectedEXPCurve(ExpCurve.MEDIUM_FAST);

var elegir = function (indice, total) {
  var flags = [];
  for (var i = 0; i < total; i++) flags.push(i === indice);
  return Java.to(flags, 'boolean[]');
};

${calls}

var out = new FileOutputStream(destino);
try { s.write(out); } finally { out.close(); }
`;
};
