import assert from 'node:assert/strict';
import { test } from 'node:test';
import { centeredWallpaper } from '../src/lib/wallpaper-preview.ts';

test('only the card nearest the viewport center is selected', () => {
  assert.equal(centeredWallpaper([
    { id: 'above', top: -550, bottom: 150 },
    { id: 'center', top: 170, bottom: 870 },
    { id: 'below', top: 890, bottom: 1590 },
  ], 0, 800), 'center');
});

test('a phone taller than the visible Safari viewport can still open', () => {
  assert.equal(centeredWallpaper([{ id: 'tall', top: -100, bottom: 660 }], 0, 550), 'tall');
});

test('small fragments at the edges do not activate', () => {
  assert.equal(centeredWallpaper([
    { id: 'above', top: -600, bottom: 100 },
    { id: 'below', top: 700, bottom: 1400 },
  ], 0, 800), null);
});

test('tablet rows and equal distances still select a single stable card', () => {
  assert.equal(centeredWallpaper([
    { id: 'left', top: 80, bottom: 680 },
    { id: 'right', top: 80, bottom: 680 },
  ], 0, 760), 'left');
});

test('the actual visual viewport offset is respected', () => {
  assert.equal(centeredWallpaper([
    { id: 'first', top: -100, bottom: 400 },
    { id: 'second', top: 420, bottom: 920 },
  ], 300, 900), 'second');
});

test('hidden and missing cards never open a preview', () => {
  assert.equal(centeredWallpaper([{ id: 'hidden', top: 100, bottom: 100 }], 0, 800), null);
  assert.equal(centeredWallpaper([], 0, 800), null);
  assert.equal(centeredWallpaper([{ id: 'phone', top: 100, bottom: 700 }], 0, 0), null);
});
