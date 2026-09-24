export class Input {
  constructor() {
    this.keys = new Set();
    this.mouseDown = false;
    this._onKeyDown = (e) => {
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseDown = (e) => {
      if (e.button === 0) this.mouseDown = true;
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouseDown = false;
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
  }

  get forward() {
    return this.keys.has('KeyW') || this.keys.has('ArrowUp');
  }

  get back() {
    return this.keys.has('KeyS') || this.keys.has('ArrowDown');
  }

  get left() {
    return this.keys.has('KeyA') || this.keys.has('ArrowLeft');
  }

  get right() {
    return this.keys.has('KeyD') || this.keys.has('ArrowRight');
  }

  get boost() {
    return this.keys.has('Space') || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  get fire() {
    return this.mouseDown || this.keys.has('KeyF');
  }

  get respawn() {
    return this.keys.has('KeyR');
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
  }
}
