function showToast(msg, color = 'var(--red)') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.borderColor = color;
  t.style.color = color;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function updateMenuStats() {
  document.getElementById('statWins').textContent = gameState.wins;
  document.getElementById('statGames').textContent = gameState.games;
  document.getElementById('statDiamonds').textContent = (gameState.diamonds||0).toLocaleString();
  document.getElementById('statTickets').textContent = gameState.tickets;
  updateTicketUI();
  if (typeof updateSoloMenuLives === 'function') updateSoloMenuLives();
}

