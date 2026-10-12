-- La dificultad de cada partida.
--
-- Los finales ya tenian su columna, preparada y nula, desde la primera
-- migracion. Ahora que el navegador la manda, la partida tambien la guarda: es
-- de la PARTIDA -se elige al crearla y no cambia- y forma parte de su receta,
-- porque decide si los de revivir salen de las tiendas.
--
-- Nula en las de antes: no se sabe, y se juegan como Normal.

alter table partidas
  add column dificultad text check (dificultad in ('normal', 'nuzlocke', 'nivelada'));
