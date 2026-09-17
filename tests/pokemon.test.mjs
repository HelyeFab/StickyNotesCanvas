import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Same vm-sandbox loading pattern as zoom.test.mjs, plus the names table.
const dir = path.dirname(fileURLToPath(import.meta.url));
const sandbox = { React: {}, window: {}, document: {}, navigator: {}, console, Math, JSON, Date };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(dir, '..', 'pokemon-names.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(dir, '..', 'utils.jsx'), 'utf8'), sandbox);
const { pokemonForNoteId, notePokemon, pokemonOnEveryNote, POKEMON_COUNT, POKEMON_NAMES, isPokemonId, pokemonName, pokemonSpriteUrl, randomPokemonId, searchPokemon } = sandbox.window;
const arr = (a) => Array.from(a);

test('the names table covers the whole National Dex in order', () => {
  assert.equal(POKEMON_NAMES.length, POKEMON_COUNT);
  assert.deepEqual(arr(POKEMON_NAMES[0]), ['Bulbasaur', 'フシギダネ']);
  assert.deepEqual(arr(POKEMON_NAMES[24]), ['Pikachu', 'ピカチュウ']);
  assert.ok(POKEMON_NAMES.every(([en, ja]) => en && ja), 'every entry has both names');
});

test('isPokemonId accepts 1…1025 integers only', () => {
  for (const ok of [1, 25, 1025]) assert.equal(isPokemonId(ok), true);
  for (const bad of [0, 1026, 2.5, '25', null, undefined, NaN]) assert.equal(isPokemonId(bad), false);
});

test('pokemonName returns English and Japanese', () => {
  const n = pokemonName(25);
  assert.equal(n.en, 'Pikachu');
  assert.equal(n.ja, 'ピカチュウ');
});

test('search by number, with or without #', () => {
  assert.deepEqual(arr(searchPokemon('25')), [25]);
  assert.deepEqual(arr(searchPokemon('#150')), [150]);
  assert.deepEqual(arr(searchPokemon('9999')), []);
});

test('search by English puts prefix matches first, case-insensitive', () => {
  const r = arr(searchPokemon('PIKA'));
  assert.equal(r[0], 25);
  const chu = arr(searchPokemon('chu'));
  assert.ok(chu.includes(25) && chu.includes(26), 'contains-matches are found too');
});

test('search by Japanese works in katakana or hiragana', () => {
  assert.equal(arr(searchPokemon('ピカチュウ'))[0], 25);
  assert.equal(arr(searchPokemon('ぴかちゅう'))[0], 25);
});

test('an empty search lists the Dex from #1', () => {
  assert.deepEqual(arr(searchPokemon('', 3)), [1, 2, 3]);
});

test('random ids stay inside the Dex', () => {
  assert.equal(randomPokemonId(() => 0), 1);
  assert.equal(randomPokemonId(() => 0.999999), POKEMON_COUNT);
});

test('sprite URL: app protocol on desktop, PokeAPI repo in the browser', () => {
  assert.match(pokemonSpriteUrl(25), /^https:\/\/raw\.githubusercontent\.com\/PokeAPI\/sprites\/.*\/home\/25\.png$/);
  sandbox.window.stickyAPI = {};
  try { assert.equal(pokemonSpriteUrl(25), 'sticky-pokemon://25.png'); }
  finally { delete sandbox.window.stickyAPI; }
});

test('every note gets its own Pokémon, stable for its id', () => {
  const a = pokemonForNoteId('n_knivp9');
  assert.ok(isPokemonId(a));
  assert.equal(pokemonForNoteId('n_knivp9'), a, 'same id, same Pokémon');
  const spread = new Set(['n_a', 'n_b', 'n_c', 'n_d', 'n_e', 'n_f', 'n_g', 'n_h'].map(pokemonForNoteId));
  assert.ok(spread.size >= 6, 'different notes mostly get different Pokémon');
});

test('notePokemon: explicit pick wins, 0 removes, otherwise the auto one only when enabled', () => {
  assert.equal(notePokemon({ id: 'x', pokemon: 25 }, false), 25);
  assert.equal(notePokemon({ id: 'x', pokemon: 25 }, true), 25);
  assert.equal(notePokemon({ id: 'x', pokemon: 0 }, true), null);
  assert.equal(notePokemon({ id: 'x' }, false), null);
  assert.equal(notePokemon({ id: 'x' }, true), pokemonForNoteId('x'));
});

test('"Pokémon on every note" defaults to on in the Pokémon theme only', () => {
  assert.equal(pokemonOnEveryNote({ theme: 'pokemon' }), true);
  assert.equal(pokemonOnEveryNote({ theme: 'paper' }), false);
  assert.equal(pokemonOnEveryNote({ theme: 'pokemon', pokemonEveryNote: false }), false);
  assert.equal(pokemonOnEveryNote({ theme: 'flat', pokemonEveryNote: true }), true);
});
