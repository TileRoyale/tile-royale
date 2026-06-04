function onPlayGauntletBtn() {
  openGauntletHub();
}

function openRingInventory() {
  renderRingInventory();
  document.getElementById('ringInventoryOverlay').style.display = 'block';
}
function closeRingInventory() {
  document.getElementById('ringInventoryOverlay').style.display = 'none';
}

function showGauntletModeTeaser() {
  const p = document.getElementById('gauntletModePopup');
  p.style.display = 'flex';
}
function hideGauntletModeTeaser() {
  const p = document.getElementById('gauntletModePopup');
  p.style.display = 'none';
}
