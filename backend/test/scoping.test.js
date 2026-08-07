const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isEquipmentAllowedForClient, scopeEquipmentsForClient, scopeRequestsForClient } = require('../src/lib/scoping');

const equipments = [
  { id: 'eq-a-filial1', empresa_id: 'empresa-A', unidade_id: 'filial-1' },
  { id: 'eq-a-filial2', empresa_id: 'empresa-A', unidade_id: 'filial-2' },
  { id: 'eq-a-compartilhado', empresa_id: 'empresa-A', unidade_id: null },
  { id: 'eq-b-filial1', empresa_id: 'empresa-B', unidade_id: 'filial-1' }
];

test('cliente sem unidade vê todos os equipamentos da própria empresa', () => {
  const user = { empresa_id: 'empresa-A', unidade_id: null };
  const result = scopeEquipmentsForClient(equipments, user);
  assert.deepEqual(result.map((e) => e.id).sort(), ['eq-a-compartilhado', 'eq-a-filial1', 'eq-a-filial2']);
});

test('cliente com unidade vê só a própria filial + equipamentos compartilhados', () => {
  const user = { empresa_id: 'empresa-A', unidade_id: 'filial-1' };
  const result = scopeEquipmentsForClient(equipments, user);
  assert.deepEqual(result.map((e) => e.id).sort(), ['eq-a-compartilhado', 'eq-a-filial1']);
});

test('cliente nunca vê equipamentos de outra empresa, mesmo sem unidade restrita', () => {
  const user = { empresa_id: 'empresa-A', unidade_id: null };
  const result = scopeEquipmentsForClient(equipments, user);
  assert.ok(!result.some((e) => e.empresa_id === 'empresa-B'));
});

test('cliente com unidade não vê equipamento de OUTRA filial da mesma empresa', () => {
  const user = { empresa_id: 'empresa-A', unidade_id: 'filial-1' };
  const result = scopeEquipmentsForClient(equipments, user);
  assert.ok(!result.some((e) => e.id === 'eq-a-filial2'));
});

test('isEquipmentAllowedForClient: bloqueia equipamento de outra empresa', () => {
  const user = { empresa_id: 'empresa-A', unidade_id: null };
  assert.equal(isEquipmentAllowedForClient(equipments.find((e) => e.id === 'eq-b-filial1'), user), false);
});

test('isEquipmentAllowedForClient: permite equipamento compartilhado (sem unidade) mesmo com filial definida', () => {
  const user = { empresa_id: 'empresa-A', unidade_id: 'filial-1' };
  assert.equal(isEquipmentAllowedForClient(equipments.find((e) => e.id === 'eq-a-compartilhado'), user), true);
});

const requests = [
  { id: 'req-1', empresa_id: 'empresa-A', equipamento_id: 'eq-a-filial1' },
  { id: 'req-2', empresa_id: 'empresa-A', equipamento_id: 'eq-a-filial2' },
  { id: 'req-3', empresa_id: 'empresa-A', equipamento_id: 'eq-a-compartilhado' },
  { id: 'req-4', empresa_id: 'empresa-B', equipamento_id: 'eq-b-filial1' }
];

test('scopeRequestsForClient: filtra chamados por empresa e, se houver, pela filial do equipamento vinculado', () => {
  const user = { empresa_id: 'empresa-A', unidade_id: 'filial-1' };
  const result = scopeRequestsForClient(requests, equipments, user);
  assert.deepEqual(result.map((r) => r.id).sort(), ['req-1', 'req-3']);
});

test('scopeRequestsForClient: sem unidade definida, vê todos os chamados da empresa', () => {
  const user = { empresa_id: 'empresa-A', unidade_id: null };
  const result = scopeRequestsForClient(requests, equipments, user);
  assert.deepEqual(result.map((r) => r.id).sort(), ['req-1', 'req-2', 'req-3']);
});
