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

/** Generaciones de Pokemon que este servicio sabe aleatorizar. */
export type Generacion = 2 | 3;

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
  /**
   * En que generaciones existe lo que esta opcion cambia.
   *
   * No es un detalle: si se ofreciera una opcion que ese juego no tiene, el
   * randomizer la ignoraria en silencio y luego le diriamos al jugador que la
   * habia cambiado. Ya paso una vez con unos ajustes que no tocaban nada.
   */
  generaciones: readonly Generacion[];
};

/** Casi todo existe en las dos; se nombra una vez para no repetirlo catorce. */
const AMBAS: readonly Generacion[] = [2, 3];

export const OPTIONS: readonly RandomizerOption[] = [
  {
    id: 'salvajes',
    label: 'Pokemon salvajes',
    description: 'Cambia que aparece en cada ruta, cueva y agua.',
    setter: 'setWildPokemonMod',
    index: 1, // RANDOM
    total: 4,
    generaciones: AMBAS,
  },
  {
    id: 'iniciales',
    label: 'Pokemon iniciales',
    description: 'Los tres que ofrece el profesor al empezar.',
    setter: 'setStartersMod',
    index: 2, // COMPLETELY_RANDOM
    total: 4,
    generaciones: AMBAS,
  },
  {
    id: 'fijos',
    label: 'Pokemon fijos y regalos',
    description: 'Legendarios, fosiles y los que te dan en la aventura.',
    setter: 'setStaticPokemonMod',
    index: 3, // SIMILAR_STRENGTH
    total: 4,
    generaciones: AMBAS,
  },
  {
    id: 'entrenadores',
    label: 'Equipos de los entrenadores',
    // La descripcion anterior decia "rivales, lideres y Alto Mando" y se leia
    // como si los entrenadores normales quedaran fuera. Los incluye a todos.
    description: 'Todos los NPC con los que peleas: rutas, gimnasios, rival y Alto Mando.',
    setter: 'setTrainersMod',
    index: 1, // RANDOM
    total: 6,
    generaciones: AMBAS,
  },
  {
    id: 'intercambios',
    label: 'Intercambios con NPC',
    description: 'El Pokemon que te dan los personajes que intercambian contigo.',
    setter: 'setInGameTradesMod',
    index: 1, // RANDOMIZE_GIVEN: se aleatoriza el que te dan, no el que piden
    total: 3,
    generaciones: AMBAS,
  },
  {
    id: 'tutores',
    label: 'Tutores de movimientos',
    description: 'Que ensena cada tutor repartido por el mapa. En segunda generacion solo Cristal tiene.',
    setter: 'setMoveTutorMovesMod',
    index: 1, // RANDOM
    total: 2,
    generaciones: AMBAS,
  },
  {
    id: 'evoluciones',
    label: 'Evoluciones',
    description: 'En que evoluciona cada especie.',
    setter: 'setEvolutionsMod',
    index: 1, // RANDOM
    total: 3,
    generaciones: AMBAS,
  },
  {
    id: 'tipos',
    label: 'Tipos',
    description: 'El tipo de cada especie, respetando su linea evolutiva.',
    setter: 'setTypesMod',
    index: 1, // RANDOM_FOLLOW_EVOLUTIONS
    total: 3,
    generaciones: AMBAS,
  },
  {
    id: 'movimientos',
    label: 'Movimientos que aprenden',
    description: 'Que ataque aprende cada Pokemon y a que nivel.',
    setter: 'setMovesetsMod',
    index: 1, // RANDOM_PREFER_SAME_TYPE, mas jugable que el aleatorio total
    total: 4,
    generaciones: AMBAS,
  },
  {
    id: 'mts',
    label: 'MTs',
    description: 'Que movimiento ensena cada maquina tecnica.',
    setter: 'setTmsMod',
    index: 1, // RANDOM
    total: 2,
    generaciones: AMBAS,
  },
  {
    id: 'objetos',
    label: 'Objetos del mapa',
    description: 'Los objetos que se recogen del suelo.',
    setter: 'setFieldItemsMod',
    index: 2, // RANDOM
    total: 4,
    generaciones: AMBAS,
  },
  {
    id: 'tiendas',
    label: 'Objetos de tienda',
    description: 'Lo que venden los centros comerciales.',
    setter: 'setShopItemsMod',
    index: 2, // RANDOM
    total: 3,
    generaciones: AMBAS,
  },
  {
    id: 'estadisticas',
    label: 'Estadisticas base',
    description: 'Ataque, defensa y velocidad de cada especie.',
    setter: 'setBaseStatisticsMod',
    index: 2, // RANDOM
    total: 3,
    generaciones: AMBAS,
  },
  {
    id: 'habilidades',
    label: 'Habilidades',
    description: 'La habilidad de cada especie.',
    setter: 'setAbilitiesMod',
    index: 1, // RANDOMIZE
    total: 2,
    // Las habilidades no existen hasta la tercera generacion.
    generaciones: [3],
  },
];

export const optionById = (id: string): RandomizerOption | undefined =>
  OPTIONS.find((option) => option.id === id);

/** Lo que ve la interfaz: sin los detalles de como se aplica. */
export const publicOptions = () =>
  OPTIONS.map(({ id, label, description, generaciones }) => ({
    id,
    label,
    description,
    generaciones,
  }));

/** Las opciones que tienen sentido en un juego de esa generacion. */
export const optionsFor = (generacion: Generacion): RandomizerOption[] =>
  OPTIONS.filter((option) => option.generaciones.includes(generacion));

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
