import test from 'node:test'; import assert from 'node:assert';
import { photoReader } from './photoReader.js';
const M = [
  { key: 'deepseek/deepseek-v4-pro', provider: 'deepseek', vision: false, label: 'Pro' },
  { key: 'deepseek/deepseek-v4-flash', provider: 'deepseek', vision: true, label: 'Flash' },
  { key: 'anthropic/claude-haiku-4-5', provider: 'anthropic', vision: true, label: 'Haiku' },
  { key: 'zhipu/glm-5.3', provider: 'zhipu', vision: false, label: 'GLM' },
];
const R = ['deepseek/deepseek-v4-flash', 'anthropic/claude-haiku-4-5'];
test('chosen vision model reads', () => assert.equal(photoReader(M, new Set(['anthropic','deepseek']), 'anthropic/claude-haiku-4-5', R).label, 'Haiku'));
test('non-vision falls back in server order', () => assert.equal(photoReader(M, new Set(['deepseek']), 'deepseek/deepseek-v4-pro', R).label, 'Flash'));
test('skips providers without key', () => assert.equal(photoReader(M, new Set(['anthropic','zhipu']), 'zhipu/glm-5.3', R).label, 'Haiku'));
test('none when no vision key', () => assert.equal(photoReader(M, new Set(['zhipu']), 'zhipu/glm-5.3', R), null));
