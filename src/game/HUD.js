const WEAPON_NAMES = {
  rocket: 'Ракета ×',
  mine: 'Мины ×',
  shotgun: 'Дробь ×',
};

export class HUD {
  constructor(audio) {
    this.audio = audio || null;
    this.healthBar = document.getElementById('health-bar');
    this.armorBar = document.getElementById('armor-bar');
    this.healthVal = document.getElementById('health-val');
    this.armorVal = document.getElementById('armor-val');
    this.weaponVal = document.getElementById('weapon-val');
    this.boostVal = document.getElementById('boost-val');
    this.lapVal = document.getElementById('lap-val');
    this.timeVal = document.getElementById('time-val');
    this.placeVal = document.getElementById('place-val');
    this.destVal = document.getElementById('dest-val');
    this.message = document.getElementById('message');
    this.results = document.getElementById('results-screen');
    this.resultsBody = document.getElementById('results-body');
    this._msgTimer = 0;

    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
      muteBtn.addEventListener('pointerup', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.audio) return;
        this.audio.ensure();
        const muted = this.audio.toggleMute();
        muteBtn.textContent = muted ? '🔇' : '🔊';
        muteBtn.classList.toggle('muted', muted);
      });
    }
    window.__applyMute = (muted) => {
      if (!this.audio) return;
      this.audio.ensure();
      this.audio.setMuted(!!muted);
      if (muteBtn) {
        muteBtn.textContent = muted ? '🔇' : '🔊';
        muteBtn.classList.toggle('muted', muted);
      }
    };
  }

  showMessage(text, duration = 2) {
    if (!this.message) return;
    this.message.textContent = text;
    this.message.classList.remove('hidden');
    this._msgTimer = duration;
  }

  showResults({ place, time, standings, medal, destruction }) {
    // Results now primarily shown via Menu; keep overlay as fallback
    if (!this.results) return;
    const places = ['🥇 1-е место!', '🥈 2-е место!', '🥉 3-е место!'];
    const title = document.getElementById('results-title');
    if (title) title.textContent = places[place - 1] || 'Финиш!';
    const timeEl = document.getElementById('results-time');
    if (timeEl) {
      timeEl.textContent = `Время: ${formatTime(time)} · Разрушения: ${destruction || 0}${
        medal ? ' · ' + (medal === 'gold' ? 'Золото' : medal === 'silver' ? 'Серебро' : 'Бронза') : ''
      }`;
    }
    if (this.resultsBody && standings) {
      this.resultsBody.innerHTML = standings
        .map(
          (s) =>
            `<div class="result-row"><span class="place">${s.place}.</span> <span class="name">${s.name}</span> <span class="lap">${s.extra || 'круг ' + s.lap}</span></div>`
        )
        .join('');
    }
    // Hide canvas overlay — Menu takes over
    this.results.classList.add('hidden');
  }

  hideResults() {
    this.results?.classList.add('hidden');
  }

  update(dt, player, place, raceTime, maxLaps = 3, extra = {}) {
    if (this._msgTimer > 0) {
      this._msgTimer -= dt;
      if (this._msgTimer <= 0) this.message?.classList.add('hidden');
    }
    if (!player) return;

    const hp = Math.max(0, player.health);
    const ar = Math.max(0, player.armor);
    if (this.healthBar) {
      this.healthBar.style.width = `${hp}%`;
      this.healthBar.classList.toggle('low', hp > 0 && hp <= 30);
    }
    if (this.armorBar) this.armorBar.style.width = `${ar}%`;
    if (this.healthVal) this.healthVal.textContent = String(Math.round(hp));
    if (this.armorVal) this.armorVal.textContent = String(Math.round(ar));

    if (this.weaponVal) {
      if (player.weapon) {
        const name = WEAPON_NAMES[player.weapon.type] || 'Оружие ×';
        this.weaponVal.textContent = `${name}${player.weapon.ammo}`;
      } else this.weaponVal.textContent = '—';
    }

    if (this.boostVal) this.boostVal.textContent = String(Math.round(player.boost));
    if (this.lapVal) {
      this.lapVal.textContent = extra.derby
        ? `Живы: ${extra.aliveCount || 0}`
        : `${Math.min(player.lap, maxLaps)} / ${maxLaps}`;
    }
    if (this.timeVal) this.timeVal.textContent = formatTime(raceTime);
    if (this.placeVal) this.placeVal.textContent = String(place);
    if (this.destVal) this.destVal.textContent = String(extra.destruction || 0);
  }
}

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
}
