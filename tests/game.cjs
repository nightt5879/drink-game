const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(source);
source = source.replace(/\}\)\(\);\s*$/, `
  globalThis.testGame = {
    startGame, dropCurrent, tick, openConfirm, closeConfirm, beginFailure,
    openSettings, closeSettings, saveSettings, moveCharacter, openGallery, closeGallery, drawPortrait,
    get LEVELS() { return LEVELS; }, get IMAGES() { return IMAGES; },
    setPair(level) {
      startGame();
      var radius = LEVELS[level].radius;
      items = [makeItem(level, 320 - radius, 740), makeItem(level, 320 + radius, 740)];
      physicsStep(1 / 120);
    },
    get state() {return {items, score, mode, hasMergedHighest, maxLevelReached, currentLevel,
      savedOrder: savedOrder.slice(), draftOrder: draftOrder.slice()};}
  };
})();`);

function harness(initial = [], unavailable = false) {
  const elements = {};
  const stored = new Map(initial);
  const timers = [];
  const document = {
    hidden: false, events: {}, title: '',
    addEventListener(type, fn) {this.events[type] = fn;},
    querySelector() { return this.getElementById('app'); },
    getElementById(id) {
      return elements[id] ||= {
        textContent: '', hidden: true, style: {}, events: {}, innerHTML: '',
        classList: {toggle() {}},
        focus() {document.activeElement = this;},
        addEventListener(type, fn) {this.events[type] = fn;},
        setAttribute(name, value) {this[name] = value;},
        querySelector() {return {disabled: false, focus() {}};}, querySelectorAll() {return [];},
        getContext() {return new Proxy({}, {get: () => () => {}});},
        getBoundingClientRect() {return {left: 0, top: 0, width: 440, height: 660};}
      };
    }
  };
  const sandbox = {
    document,
    window: {addEventListener() {}, devicePixelRatio: 1, localStorage: {
      getItem(key) {if (unavailable) throw Error('blocked'); return stored.get(key);},
      setItem(key, value) {if (unavailable) throw Error('blocked'); stored.set(key, value);}
    }},
    Image: class {complete = true; naturalWidth = 1608; addEventListener() {}},
    requestAnimationFrame() {return 1;},
    setTimeout(fn) {timers.push(fn);}
  };
  vm.runInNewContext(source, sandbox);
  return {game: sandbox.testGame, elements, stored, timers, document};
}

const {game, elements, stored, timers, document} = harness();
const names = ['嘎子','牢大','雪风','螺哥','峰哥','忍者神龟','咩西','许老板','兔娘','魔人布欧','大头','棋圣'];
const orderKey = 'merge-drinks:order:v1';
const ids = Array.from(game.state.savedOrder);
assert.deepEqual(Array.from(game.LEVELS, x => x.name), names);
assert.equal(game.LEVELS[0].radius, 58);
assert.equal(game.LEVELS[11].radius, 220);
assert.equal(document.title, '合成饮料');
assert.equal(/sysu|scut|大学|校徽|orderRejected/.test(html), false);
const crypto = require('node:crypto');
const digest = x => crypto.createHash('sha256').update(fs.readFileSync(x)).digest('hex');
assert.equal(digest(path.join(root, 'assets/drink-people.jpg')), 'da53616046c20151c5265b53592918bd71cb6f18ca94d2d3d8140cdcd60dca19');
for (const ball of game.LEVELS) {
  assert.ok(fs.existsSync(path.join(root, ball.asset)));
  const [x,y,w,h] = ball.source;
  assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x+w <= 1608 && y+h <= 1079);
  const calls = [];
  const context = new Proxy({}, {get: (_, name) => (...args) => calls.push([name,...args]), set: () => true});
  game.drawPortrait(context, ball, 0, 0, 58);
  const draw = calls.find(x => x[0] === 'drawImage');
  assert.deepEqual(draw.slice(2,6), Array.from(ball.source));
  assert.ok(Math.abs(draw[9] - 58*1.85) < 1e-9);
  assert.ok(draw[8] < draw[9]); // Portrait aspect ratio is preserved.
}
for (let level = 0; level < 11; level++) {
  game.setPair(level);
  assert.equal(game.state.items.length, 1);
  assert.equal(game.state.items[0].level, level+1);
  assert.equal(game.state.score, 2**(level+1));
}
game.beginFailure(); timers.pop()();
assert.equal(elements.gameOverMessage.textContent, '已合成棋圣！');
game.setPair(11); assert.equal(game.state.items.length, 2);
game.startGame(); game.dropCurrent(); game.dropCurrent();
assert.equal(game.state.items.length, 1);
game.openConfirm(); game.closeConfirm(false); assert.equal(game.state.items.length, 1);
game.openConfirm(); game.closeConfirm(true); assert.equal(game.state.items.length, 0);
game.setPair(0);
const item = game.state.items[0], score = game.state.score;
game.openGallery(); game.tick(1); assert.equal(game.state.mode, 'gallery');
game.closeGallery(); assert.equal(game.state.items[0], item); assert.equal(game.state.score, score);
game.openSettings(); game.moveCharacter('laoda', 0); game.closeSettings(false);
assert.deepEqual(Array.from(game.state.savedOrder), ids);
assert.equal(game.state.items[0], item);
game.openSettings(); game.saveSettings(); assert.equal(game.state.items[0], item);
game.openSettings(); game.moveCharacter('qisheng', 0); game.moveCharacter('gazi', 11); game.saveSettings();
const saved = Array.from(game.state.savedOrder);
assert.equal(saved[0], 'qisheng'); assert.equal(saved[11], 'gazi');
assert.deepEqual(JSON.parse(stored.get(orderKey)), saved);
assert.equal(game.state.items.length, 0);
assert.equal(document.title, '合成饮料');
const loaded = harness(Array.from(stored));
assert.deepEqual(Array.from(loaded.game.state.savedOrder), saved);
for (let level=0; level<11; level++) {
  loaded.game.setPair(level); assert.equal(loaded.game.state.items[0].level, level+1);
}
loaded.game.beginFailure(); loaded.timers.pop()();
assert.equal(loaded.elements.gameOverMessage.textContent, '已合成嘎子！');
game.openSettings(); elements.settingsResetButton.events.click(); game.closeSettings(false);
assert.deepEqual(Array.from(game.state.savedOrder), saved);
game.openSettings(); elements.settingsResetButton.events.click(); game.saveSettings();
assert.deepEqual(Array.from(game.state.savedOrder), ids);
game.beginFailure(); timers.pop()(); game.openGallery(); game.closeGallery();
assert.equal(game.state.mode, 'gameover');
game.openSettings(); game.moveCharacter('fengge', 0); game.saveSettings();
assert.equal(game.state.mode, 'playing'); assert.equal(elements.gameOverOverlay.hidden, true);
for (const raw of ['{bad','{}','null',JSON.stringify(ids.slice(1)),JSON.stringify(ids.map(()=>'gazi')),JSON.stringify([...ids.slice(0,11),'unknown'])]) {
  assert.deepEqual(Array.from(harness([[orderKey,raw]]).game.state.savedOrder), ids);
}
const blocked = harness([], true);
blocked.game.openSettings(); blocked.game.moveCharacter('laoda',0); blocked.game.saveSettings();
assert.equal(blocked.game.state.savedOrder[0], 'laoda');
assert.equal(blocked.game.state.mode, 'playing');
console.log('PASS: 12 selected original portraits, unchanged image, full-height aspect-ratio rendering, 22 merges, largest level, cooldown/restart, pause/cancel, free order/save/reload/reset, game-over and corrupt/blocked storage.');

