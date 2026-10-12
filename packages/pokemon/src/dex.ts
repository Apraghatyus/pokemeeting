// Del numero interno de especie al de la Pokedex nacional, sin ROM delante.
//
// POR QUE EXISTE ESTO, si la tabla ya se lee de la ROM. Porque no siempre hay
// una ROM: el ranking enseña equipos de partidas de OTRA gente, y se mira
// tantas veces sin estar jugando como jugando. Sin este respaldo, ahi no habia
// sprites, solo circulos con dos letras.
//
// POR QUE SE PUEDE FIJAR. Esta tabla es parte del juego, no de la partida: el
// aleatorizador cambia que Pokemon aparece donde y con que datos, pero no
// renumera la Pokedex. Se comprobo leyendola de cuatro ROMs distintas -Rojo
// Fuego, Verde Hoja, Esmeralda y Rubi- y es la misma en las cuatro, numero a
// numero. La prueba `test:dex` vuelve a comprobarlo contra la ROM que se le
// pase, en vez de fiarse de este comentario.
//
// Y NO ES UNA RESTA, aunque lo parezca: el orden interno de los de Hoenn es el
// de la Pokedex de Hoenn, no el nacional. La interna 411 es CHIMECHO, la 358
// nacional, y restando un desplazamiento fijo saldria la 386, que es DEOXYS.
// Los huecos 252-276 no son Pokemon: son relleno, y sus numeros -del 387 en
// adelante- no corresponden a nada que se pueda enseñar.

/** Indice = numero interno de especie. El 0 no existe. */
export const NACIONAL_GEN3: readonly number[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
  32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47,
  48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63,
  64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79,
  80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95,
  96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111,
  112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127,
  128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143,
  144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159,
  160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175,
  176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191,
  192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207,
  208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223,
  224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239,
  240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 387, 388, 389, 390,
  391, 392, 393, 394, 395, 396, 397, 398, 399, 400, 401, 402, 403, 404, 405, 406,
  407, 408, 409, 410, 411, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262,
  263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 290, 291, 292,
  276, 277, 285, 286, 327, 278, 279, 283, 284, 320, 321, 300, 301, 352, 343, 344,
  299, 324, 302, 339, 340, 370, 341, 342, 349, 350, 318, 319, 328, 329, 330, 296,
  297, 309, 310, 322, 323, 363, 364, 365, 331, 332, 361, 362, 337, 338, 298, 325,
  326, 311, 312, 303, 307, 308, 333, 334, 360, 355, 356, 315, 287, 288, 289, 316,
  317, 357, 293, 294, 295, 366, 367, 368, 359, 353, 354, 336, 335, 369, 304, 305,
  306, 351, 313, 314, 345, 346, 347, 348, 280, 281, 282, 371, 372, 373, 374, 375,
  376, 377, 378, 379, 382, 383, 384, 380, 381, 385, 386, 358,
];

/**
 * El numero nacional de una especie de tercera generacion.
 *
 * Devuelve 0 si ese numero interno no es un Pokemon de verdad, que es lo mismo
 * que devuelve la tabla leida de la ROM cuando no sabe.
 */
export const nacionalDeGen3 = (especie: number): number => {
  const nacional = NACIONAL_GEN3[especie] ?? 0;
  // Del 387 en adelante son los huecos de relleno: no hay Pokemon detras.
  return nacional > 0 && nacional <= 386 ? nacional : 0;
};
