const WEAPON_NAMES = {
  rocket: 'Ракета ×',
};

export class HUD {
  constructor() {
    this.healthBar = document.getElementById('health-bar');
    this.armorBar = document.getElementById('armor-bar');
    this.healthVal = document.getElementById('health-val');
    this.armorVal = document.getElementById('armor-val');
    this.weaponVal = document.getElementById('weapon-val');
    this.boostVal = document.getElementById('boost-val');
    this.lapVal = document.getElementById('lap-val');
    this.timeVal = document.getElementById('time-val');
    this.placeVal = document.getElementById('place-val');
    this.message = document.getElementById('message');
    this._msgTimer = 0;
  }

  showMessage(text, duration = 2) {
    this.message.textContent = text;
    this.message.classList.remove('hidden');
    this._msgTimer = duration;
  }

  update(dt, player, place, raceTime, maxLaps = 3) {
    if (this._msgTimer > 0) {
      this._msgTimer -= dt;
      if (this._msgTimer <= 0) this.message.classList.add('hidden');
    }

    const hp = Math.max(0, player.health);
    const ar = Math.max(0, player.armor);
    this.healthBar.style.width = `${hp}%`;
    this.armorBar.style.width = `${ar}%`;
    this.healthBar.classList.toggle('low', hp > 0 && hp <= 30);
    this.healthVal.textContent = String(Math.round(hp));
    this.armorVal.textContent = String(Math.round(ar));

    if (player.weapon) {
      const name = WEAPON_NAMES[player.weapon.type] || 'Оружие ×';
      this.weaponVal.textContent = `${name}${player.weapon.ammo}`;
    } else {
      this.weaponVal.textContent = '—';
    }

    this.boostVal.textContent = String(Math.round(player.boost));
    this.lapVal.textContent = `${Math.min(player.lap, maxLaps)} / ${maxLaps}`;
    this.timeVal.textContent = formatTime(raceTime);
    this.placeVal.textContent = String(place);
  }
}

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
