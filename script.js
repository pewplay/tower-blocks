/*
 * Tower Blocks for PewPlay.
 * Same rules as the original three.js version, now drawn with a small
 * built-in isometric renderer (Canvas 2D), so no external libraries are needed.
 */
(function () {
  'use strict';

  var STORE_BEST = 'tower-blocks:best';
  var STORE_MUTED = 'tower-blocks:muted';
  var BG = '#d0cbc7';
  var MOVE_AMOUNT = 12;
  var FRAME_MS = 1000 / 60;

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, String(value));
    } catch (e) { /* storage unavailable */ }
    return null;
  }

  // ------------------------------------------------------------ tweens
  var tweens = [];
  var ease = {
    linear: function (t) { return t; },
    inOut: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    in: function (t) { return t * t; },
    out: function (t) { return 1 - (1 - t) * (1 - t); }
  };

  // Animate numeric props of obj to the values in `to` over `dur` seconds.
  function tween(obj, dur, to, opts) {
    opts = opts || {};
    var from = {};
    for (var k in to) from[k] = obj[k];
    var tw = {
      obj: obj, from: from, to: to, dur: Math.max(0.001, dur), t: -(opts.delay || 0),
      ease: opts.ease || ease.inOut, onUpdate: opts.onUpdate, onComplete: opts.onComplete, done: false
    };
    tweens.push(tw);
    return tw;
  }

  function killTweensOf(obj) {
    for (var i = 0; i < tweens.length; i++) if (tweens[i].obj === obj) tweens[i].done = true;
  }

  function updateTweens(dt) {
    var list = tweens.slice();
    for (var i = 0; i < list.length; i++) {
      var tw = list[i];
      if (tw.done) continue;
      tw.t += dt;
      if (tw.t < 0) continue;
      var p = Math.min(1, tw.t / tw.dur);
      var e = tw.ease(p);
      for (var k in tw.to) tw.obj[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e;
      if (tw.onUpdate) tw.onUpdate();
      if (p >= 1) {
        tw.done = true;
        if (tw.onComplete) tw.onComplete();
      }
    }
    tweens = tweens.filter(function (t) { return !t.done; });
  }

  // ------------------------------------------------------------- audio
  var Sound = {
    ctx: null,
    muted: store(STORE_MUTED) === '1',
    unlock: function () {
      if (!this.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        try { this.ctx = new AC(); } catch (e) { return; }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(function () {});
    },
    note: function (freq, dur, vol, type, delay) {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      var c = this.ctx;
      var t = c.currentTime + (delay || 0);
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    },
    place: function (streak) {
      this.note(180, 0.12, 0.18, 'triangle');
      if (streak > 0) {
        // Perfect drop: a rising chime for each perfect in a row.
        var f = 523.25 * Math.pow(2, Math.min(streak - 1, 12) / 12);
        this.note(f, 0.35, 0.09, 'sine', 0.01);
        this.note(f * 1.5, 0.3, 0.05, 'sine', 0.06);
      }
    },
    miss: function () {
      this.note(140, 0.4, 0.16, 'sawtooth');
      this.note(90, 0.5, 0.12, 'triangle', 0.12);
    }
  };

  // --------------------------------------------------------- renderer
  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d');
  var view = { w: 1, h: 1, dpr: 1, k: 20, cy: 0.58, baseCy: 0.58 };
  var camera = { y: 4 };
  var SQ2 = Math.SQRT2;
  var SQ6 = Math.sqrt(6);

  // Isometric projection, camera looking along (-1,-1,-1).
  function project(x, y, z) {
    return [
      view.w / 2 + (x - z) / SQ2 * view.k,
      view.h * view.cy - (2 * (y - camera.y) - x - z) / SQ6 * view.k
    ];
  }

  function rgb(c, f) {
    return 'rgb(' + Math.min(255, Math.round(c[0] * f)) + ',' +
      Math.min(255, Math.round(c[1] * f)) + ',' + Math.min(255, Math.round(c[2] * f)) + ')';
  }

  function rotate(v, rx, ry, rz) {
    var x = v[0], y = v[1], z = v[2], c, s, t;
    if (rz) { c = Math.cos(rz); s = Math.sin(rz); t = x * c - y * s; y = x * s + y * c; x = t; }
    if (ry) { c = Math.cos(ry); s = Math.sin(ry); t = x * c + z * s; z = -x * s + z * c; x = t; }
    if (rx) { c = Math.cos(rx); s = Math.sin(rx); t = y * c - z * s; z = y * s + z * c; y = t; }
    return [x, y, z];
  }

  var FACES = [
    { n: [0, 1, 0], v: [2, 3, 7, 6] },   // top
    { n: [0, -1, 0], v: [0, 4, 5, 1] },  // bottom
    { n: [1, 0, 0], v: [1, 5, 7, 3] },   // +x
    { n: [-1, 0, 0], v: [0, 2, 6, 4] },  // -x
    { n: [0, 0, 1], v: [4, 6, 7, 5] },   // +z
    { n: [0, 0, -1], v: [0, 1, 3, 2] }   // -z
  ];

  // Box: x,y,z = min corner; w,h,d = size; rx,ry,rz rotation about its centre; s = scale.
  function drawBox(b) {
    var s = b.s === undefined ? 1 : b.s;
    if (s <= 0.001 || b.w <= 0 || b.d <= 0) return;
    var hx = b.w / 2 * s, hy = b.h / 2 * s, hz = b.d / 2 * s;
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2, cz = b.z + b.d / 2;
    var rot = b.rx || b.ry || b.rz;
    var pts = [];
    for (var i = 0; i < 8; i++) {
      var v = [(i & 1) ? hx : -hx, (i & 2) ? hy : -hy, (i & 4) ? hz : -hz];
      if (rot) v = rotate(v, b.rx || 0, b.ry || 0, b.rz || 0);
      pts.push(project(cx + v[0], cy + v[1], cz + v[2]));
    }
    for (var f = 0; f < FACES.length; f++) {
      var face = FACES[f];
      var n = rot ? rotate(face.n, b.rx || 0, b.ry || 0, b.rz || 0) : face.n;
      var facing = n[0] + n[1] + n[2];
      if (facing <= 0.0001) continue;
      // Soft light from above plus a little from the right.
      var light = 0.6 + 0.4 * Math.max(0, n[1]) + 0.16 * Math.max(0, n[0]) + 0.02 * Math.max(0, n[2]);
      var col = rgb(b.color, light);
      ctx.beginPath();
      ctx.moveTo(pts[face.v[0]][0], pts[face.v[0]][1]);
      for (var j = 1; j < 4; j++) ctx.lineTo(pts[face.v[j]][0], pts[face.v[j]][1]);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 0.75;
      ctx.stroke();
    }
  }

  // ------------------------------------------------------------ blocks
  function blockColor(index, offset) {
    var o = index + offset;
    return [
      Math.sin(0.3 * o) * 55 + 200,
      Math.sin(0.3 * o + 2) * 55 + 200,
      Math.sin(0.3 * o + 4) * 55 + 200
    ];
  }

  function Block(target) {
    this.target = target;
    this.index = (target ? target.index : 0) + 1;
    this.plane = this.index % 2 ? 'x' : 'z';
    this.dim = this.index % 2 ? 'w' : 'd';
    this.w = target ? target.w : 10;
    this.h = target ? target.h : 2;
    this.d = target ? target.d : 10;
    this.x = target ? target.x : 0;
    this.y = this.h * this.index;
    this.z = target ? target.z : 0;
    this.colorOffset = target ? target.colorOffset : Math.round(Math.random() * 100);
    this.color = target ? blockColor(this.index, this.colorOffset) : [0x33, 0x33, 0x44];
    this.state = this.index > 1 ? 'active' : 'stopped';
    this.speed = Math.max(-4, -0.1 - this.index * 0.005);
    this.direction = this.speed;
    if (this.state === 'active') this[this.plane] = Math.random() > 0.5 ? -MOVE_AMOUNT : MOVE_AMOUNT;
  }

  Block.prototype.tick = function (frames) {
    if (this.state !== 'active') return;
    // Bounce between -MOVE_AMOUNT and +MOVE_AMOUNT. The direction depends on WHICH edge was passed
    // (not on the current direction), so a large frame step can never leave the block stuck outside.
    var speed = Math.abs(this.speed);
    var v = this[this.plane] + this.direction * frames;
    if (v > MOVE_AMOUNT) {
      v = 2 * MOVE_AMOUNT - v;
      this.direction = -speed;
    } else if (v < -MOVE_AMOUNT) {
      v = -2 * MOVE_AMOUNT - v;
      this.direction = speed;
    }
    this[this.plane] = Math.max(-MOVE_AMOUNT, Math.min(MOVE_AMOUNT, v));
  };

  // Same cutting rules as the original game.
  Block.prototype.place = function () {
    this.state = 'stopped';
    var t = this.target;
    var plane = this.plane, dim = this.dim;
    var overlap = t[dim] - Math.abs(this[plane] - t[plane]);
    var res = { plane: plane, direction: this.direction };
    if (this[dim] - overlap < 0.3) {
      overlap = this[dim];
      res.bonus = true;
      this.x = t.x;
      this.z = t.z;
      this.w = t.w;
      this.d = t.d;
    }
    if (overlap > 0) {
      var chopped = { x: this.x, y: this.y, z: this.z, w: this.w, h: this.h, d: this.d, color: this.color };
      chopped[dim] -= overlap;
      this[dim] = overlap;
      if (this[plane] < t[plane]) {
        this[plane] = t[plane];
      } else {
        chopped[plane] += overlap;
      }
      res.placed = true;
      if (!res.bonus && chopped[dim] > 0.001) res.chopped = chopped;
    } else {
      this.state = 'missed';
      res.missed = { x: this.x, y: this.y, z: this.z, w: this.w, h: this.h, d: this.d, color: this.color };
    }
    return res;
  };

  // -------------------------------------------------------------- game
  var el = {
    container: document.getElementById('container'),
    score: document.getElementById('score'),
    instructions: document.getElementById('instructions'),
    best: document.getElementById('best'),
    overBest: document.getElementById('over-best'),
    start: document.getElementById('start-button'),
    mute: document.getElementById('mute'),
    perfect: document.getElementById('perfect')
  };

  var Game = {
    state: 'loading',
    blocks: [],
    falling: [],
    rings: [],
    paused: false,
    best: 0,
    streak: 0,
    last: 0,

    init: function () {
      var b = parseInt(store(STORE_BEST), 10);
      this.best = isFinite(b) && b > 0 ? b : 0;
      this.showBest();
      this.resize();
      this.addBlock();
      this.setState('ready');
      this.bind();
      this.updateMute();
      var self = this;
      this.last = performance.now();
      requestAnimationFrame(function loop(t) {
        self.frame(t);
        requestAnimationFrame(loop);
      });
    },

    resize: function () {
      var w = Math.max(1, window.innerWidth);
      var h = Math.max(1, window.innerHeight);
      var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      view.w = w;
      view.h = h;
      view.dpr = dpr;
      // Keep the whole sliding range (about 36 units wide) on screen.
      view.k = Math.max(6, Math.min(w / 38, h / 30, 34));
      view.baseCy = h > w * 1.2 ? 0.5 : 0.54;
      killTweensOf(view);
      view.cy = view.baseCy;
      if (this.state === 'ended') this.makeRoomForText(0);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    },

    bind: function () {
      var self = this;
      window.addEventListener('resize', function () { self.resize(); });
      document.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
          e.preventDefault();
          if (e.repeat) return;
          if (e.target === el.mute && e.code !== 'Space') return;
          self.onAction();
        } else if (e.code === 'KeyM') {
          self.toggleMute();
        } else if (e.code === 'KeyP' || e.code === 'Escape') {
          self.setPaused(!self.paused);
        }
      });
      el.container.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.target.closest && e.target.closest('#mute')) return;
        e.preventDefault();
        self.onAction();
      });
      el.container.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      el.mute.addEventListener('click', function (e) {
        e.stopPropagation();
        self.toggleMute();
        el.mute.blur();
      });
      el.mute.addEventListener('keydown', function (e) {
        if (e.code === 'Space') e.stopPropagation();
      });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) self.setPaused(true);
      });
      window.addEventListener('blur', function () { self.setPaused(true); });
    },

    setState: function (s) {
      this.state = s;
      el.container.className = s + (this.paused ? ' paused' : '');
    },

    setPaused: function (p) {
      if (p && this.state !== 'playing') return;
      this.paused = p;
      el.container.classList.toggle('paused', p);
      this.last = performance.now();
    },

    toggleMute: function () {
      Sound.muted = !Sound.muted;
      store(STORE_MUTED, Sound.muted ? '1' : '0');
      if (!Sound.muted) Sound.unlock();
      this.updateMute();
    },

    updateMute: function () {
      el.mute.classList.toggle('off', Sound.muted);
      el.mute.setAttribute('aria-label', Sound.muted ? 'Unmute sound' : 'Mute sound');
      el.mute.title = Sound.muted ? 'Sound off (M)' : 'Sound on (M)';
    },

    showBest: function () {
      el.best.textContent = this.best > 0 ? 'Best: ' + this.best : '';
    },

    onAction: function () {
      Sound.unlock();
      if (this.paused) { this.setPaused(false); return; }
      if (this.state === 'ready') this.startGame();
      else if (this.state === 'playing') this.placeBlock();
      else if (this.state === 'ended') this.restartGame();
    },

    startGame: function () {
      if (this.state === 'playing') return;
      el.score.textContent = '0';
      el.instructions.classList.remove('hide');
      this.streak = 0;
      this.setState('playing');
      this.addBlock();
    },

    restartGame: function () {
      this.setState('resetting');
      var self = this;
      var old = this.blocks.slice(1);
      var removeSpeed = 0.2;
      var delay = 0.02;
      for (var i = 0; i < old.length; i++) {
        (function (b, i) {
          b.s = 1;
          b.ry = 0;
          tween(b, removeSpeed, { s: 0, ry: 0.5 }, { delay: (old.length - i) * delay, ease: ease.in });
        })(old[i], i);
      }
      var total = removeSpeed * 2 + old.length * delay;
      this.setCamera(this.blocks[0].y + 2, total);
      killTweensOf(view);
      tween(view, Math.min(total, 0.6), { cy: view.baseCy }, { ease: ease.inOut });
      var countdown = { v: this.blocks.length - 1 };
      tween(countdown, total, { v: 0 }, {
        ease: ease.linear,
        onUpdate: function () { el.score.textContent = String(Math.round(countdown.v)); }
      });
      setTimeout(function () {
        self.blocks = self.blocks.slice(0, 1);
        self.falling = [];
        self.startGame();
      }, total * 1000 + 30);
    },

    placeBlock: function () {
      var current = this.blocks[this.blocks.length - 1];
      var res = current.place();
      if (res.chopped) this.drop(res.chopped, res, current);
      if (res.missed) {
        this.drop(res.missed, res, current);
        Sound.miss();
      } else {
        if (res.bonus) {
          this.streak++;
          this.rings.push({ b: current, t: 0 });
          this.flashPerfect();
        } else {
          this.streak = 0;
        }
        Sound.place(res.bonus ? this.streak : 0);
      }
      this.addBlock();
    },

    // The cut-off piece tumbles away and falls.
    drop: function (piece, res, placed) {
      piece.rx = 0; piece.ry = 0; piece.rz = 0;
      var plane = res.plane;
      var away;
      if (res.missed) {
        away = piece[plane] >= placed.target[plane] ? 1 : -1;
      } else {
        away = piece[plane] > placed[plane] ? 1 : -1;
      }
      piece.behind = away < 0;
      var pos = { y: piece.y - 30 };
      pos[plane] = piece[plane] + away * 40 * Math.abs(res.direction);
      tween(piece, 1, pos, { ease: ease.in });
      var r = 10;
      tween(piece, 1, {
        rx: plane === 'z' ? Math.random() * r - r / 2 : 0.1,
        rz: plane === 'x' ? Math.random() * r - r / 2 : 0.1,
        ry: Math.random() * 0.1
      }, { delay: 0.05, ease: ease.inOut });
      var self = this;
      this.falling.push(piece);
      setTimeout(function () {
        var i = self.falling.indexOf(piece);
        if (i >= 0) self.falling.splice(i, 1);
      }, 1100);
    },

    flashPerfect: function () {
      var p = el.perfect;
      p.textContent = this.streak > 1 ? 'Perfect ×' + this.streak : 'Perfect!';
      p.classList.remove('show');
      void p.offsetWidth;
      p.classList.add('show');
    },

    addBlock: function () {
      var last = this.blocks[this.blocks.length - 1];
      if (last && last.state === 'missed') return this.endGame();
      el.score.textContent = String(this.blocks.length - 1);
      var b = new Block(last);
      this.blocks.push(b);
      this.setCamera(this.blocks.length * 2, 0.3);
      if (this.blocks.length >= 5) el.instructions.classList.add('hide');
    },

    setCamera: function (y, dur) {
      killTweensOf(camera);
      tween(camera, dur, { y: y }, { ease: ease.inOut });
    },

    endGame: function () {
      var score = this.blocks.length - 2;
      var isNew = score > this.best;
      if (isNew) {
        this.best = score;
        store(STORE_BEST, score);
      }
      el.overBest.textContent = isNew && score > 0 ? 'New best score!' : (this.best > 0 ? 'Best: ' + this.best : '');
      this.showBest();
      this.setState('ended');
      this.makeRoomForText(0.5);
    },

    // On short screens, lower the view so the game-over text does not cover the tower.
    makeRoomForText: function (dur) {
      var again = document.querySelector('.game-over .again');
      if (!again) return;
      var r = again.getBoundingClientRect();
      var textBottom = r.bottom + 40 + 16; // the text slides 40px down as it appears
      var top = this.blocks[this.blocks.length - 1];
      if (top.state === 'missed') top = this.blocks[this.blocks.length - 2] || top;
      var y = project(top.x, top.y + top.h, top.z + top.d)[1];
      var tip = Math.min(y, project(top.x, top.y + top.h, top.z)[1]);
      var shift = textBottom - tip;
      if (shift <= 0) return;
      var cy = Math.min(0.92, view.cy + shift / view.h);
      killTweensOf(view);
      if (dur) tween(view, dur, { cy: cy }, { ease: ease.inOut });
      else view.cy = cy;
    },

    frame: function (t) {
      var dtMs = Math.min(t - this.last, 50);
      this.last = t;
      if (!this.paused) {
        updateTweens(dtMs / 1000);
        if (this.state === 'playing') {
          this.blocks[this.blocks.length - 1].tick(dtMs / FRAME_MS);
        }
        for (var i = 0; i < this.rings.length; i++) this.rings[i].t += dtMs / 1000;
        this.rings = this.rings.filter(function (r) { return r.t < 0.6; });
      }
      this.render();
    },

    render: function () {
      var dpr = view.dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      var g = ctx.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, '#dcd8d5');
      g.addColorStop(1, '#c6c0bc');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineJoin = 'round';

      var i;
      var visibleBottom = camera.y - view.h * 1.3 / view.k;
      for (i = 0; i < this.falling.length; i++) if (this.falling[i].behind) drawBox(this.falling[i]);

      // Pedestal under the first block.
      var base = this.blocks[0];
      if (base) {
        var depth = Math.max(60, view.h / view.k * 2);
        drawBox({ x: base.x, y: base.y - depth, z: base.z, w: base.w, h: depth + base.h, d: base.d, color: base.color });
      }
      for (i = 1; i < this.blocks.length; i++) {
        var b = this.blocks[i];
        if (b.state === 'missed') continue;
        if (b.y + b.h < visibleBottom) continue;
        drawBox(b);
      }
      for (i = 0; i < this.rings.length; i++) this.drawRing(this.rings[i]);
      for (i = 0; i < this.falling.length; i++) if (!this.falling[i].behind) drawBox(this.falling[i]);
    },

    // Outline that grows from a perfectly placed block.
    drawRing: function (r) {
      var b = r.b;
      var p = r.t / 0.6;
      var grow = 0.4 + p * 2.2;
      var y = b.y + b.h;
      var c = [
        project(b.x - grow, y, b.z - grow), project(b.x + b.w + grow, y, b.z - grow),
        project(b.x + b.w + grow, y, b.z + b.d + grow), project(b.x - grow, y, b.z + b.d + grow)
      ];
      ctx.beginPath();
      ctx.moveTo(c[0][0], c[0][1]);
      for (var i = 1; i < 4; i++) ctx.lineTo(c[i][0], c[i][1]);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * (1 - p)).toFixed(3) + ')';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  };

  Game.init();
})();
