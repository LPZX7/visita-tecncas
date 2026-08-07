// Um cliente sempre enxerga apenas a própria empresa. Se também tiver uma
// unidade (filial/sede) específica atribuída, só vê equipamentos daquela
// unidade ou sem unidade definida (tratados como recurso compartilhado da empresa).

function isEquipmentAllowedForClient(equipment, user) {
  if (equipment.empresa_id !== user.empresa_id) return false;
  if (!user.unidade_id) return true;
  return !equipment.unidade_id || equipment.unidade_id === user.unidade_id;
}

function scopeEquipmentsForClient(equipments, user) {
  return equipments.filter((e) => isEquipmentAllowedForClient(e, user));
}

function scopeRequestsForClient(requests, equipments, user) {
  return requests.filter((r) => {
    if (r.empresa_id !== user.empresa_id) return false;
    if (!user.unidade_id) return true;
    const equipment = equipments.find((e) => e.id === r.equipamento_id);
    return !equipment?.unidade_id || equipment.unidade_id === user.unidade_id;
  });
}

module.exports = { isEquipmentAllowedForClient, scopeEquipmentsForClient, scopeRequestsForClient };
