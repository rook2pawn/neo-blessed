/**
 * terminal.js - term.js terminal element for blessed
 * Copyright (c) 2013-2015, Christopher Jeffrey and contributors (MIT License).
 * https://github.com/chjj/blessed
 */

/**
 * Modules
 */

var nextTick = global.setImmediate || process.nextTick.bind(process);
var os = require('os');

var Node = require('./node');
var Box = require('./box');

/**
 * Terminal
 */

function Terminal(options) {
  if (!(this instanceof Node)) {
    return new Terminal(options);
  }

  options = options || {};
  options.scrollable = false;

  Box.call(this, options);

  // XXX Workaround for all motion
  if (this.screen.program.tmux && this.screen.program.tmuxVersion >= 2) {
    this.screen.program.enableMouse();
  }

  this.handler = options.handler;
  this.shell = options.shell || process.env.SHELL || 'sh';
  this.args = options.args || [];

  this.cursor = this.options.cursor;
  this.cursorBlink = this.options.cursorBlink;
  this.screenKeys = this.options.screenKeys;

  this.style = this.style || {};
  this.style.bg = this.style.bg || 'default';
  this.style.fg = this.style.fg || 'default';

  this.termName = options.terminal ||
    options.term ||
    process.env.TERM ||
    'xterm';

  this.bootstrap();
}

Object.setPrototypeOf(Terminal.prototype, Box.prototype);

Terminal.prototype.type = 'terminal';

Terminal.prototype.bootstrap = function() {
  var self = this;

  var element = {
    // window
    get document() { return element; },
    navigator: { userAgent: 'node.js' },

    // document
    get defaultView() { return element; },
    get documentElement() { return element; },
    createElement: function() { return element; },

    // element
    get ownerDocument() { return element; },
    addEventListener: function() {},
    removeEventListener: function() {},
    getElementsByTagName: function() { return [element]; },
    getElementById: function() { return element; },
    parentNode: null,
    offsetParent: null,
    appendChild: function() {},
    removeChild: function() {},
    setAttribute: function() {},
    getAttribute: function() {},
    style: {},
    focus: function() {},
    blur: function() {},
    console: console
  };

  element.parentNode = element;
  element.offsetParent = element;

  this.term = require('term.js')({
    termName: this.termName,
    cols: this.width - this.iwidth,
    rows: this.height - this.iheight,
    context: element,
    document: element,
    body: element,
    parent: element,
    cursorBlink: this.cursorBlink,
    screenKeys: this.screenKeys
  });

  this.term.refresh = function() {
    self.screen.render();
  };

  this.term.keyDown = function() {};
  this.term.keyPress = function() {};

  this.term.open(element);

  // Emits key sequences in html-land.
  // Technically not necessary here.
  // In reality if we wanted to be neat, we would overwrite the keyDown and
  // keyPress methods with our own node.js-keys->terminal-keys methods, but
  // since all the keys are already coming in as escape sequences, we can just
  // send the input directly to the handler/socket (see below).
  // this.term.on('data', function(data) {
  //   self.handler(data);
  // });

  // Incoming keys and mouse inputs.
  // NOTE: Cannot pass mouse events - coordinates will be off!
  this.screen.program.input.on('data', this._onData = function(data) {
    if (self.screen.focused === self && !self._isMouse(data)) {
      self.handler(data);
    }
  });

  this.onScreenEvent('mouse', function(data) {
    if (self.screen.focused !== self) return;

    if (data.x < self.aleft + self.ileft) return;
    if (data.y < self.atop + self.itop) return;
    if (data.x > self.aleft - self.ileft + self.width) return;
    if (data.y > self.atop - self.itop + self.height) return;

    if (!(self.term.x10Mouse ||
          self.term.vt200Mouse ||
          self.term.normalMouse ||
          self.term.mouseEvents ||
          self.term.utfMouse ||
          self.term.sgrMouse ||
          self.term.urxvtMouse)) {
      return;
    }

    var b = data.raw[0],
       x = data.x - self.aleft,
       y = data.y - self.atop,
       s;

    if (self.term.urxvtMouse) {
      if (self.screen.program.sgrMouse) {
        b += 32;
      }
      s = '\x1b[' + b + ';' + (x + 32) + ';' + (y + 32) + 'M';
    } else if (self.term.sgrMouse) {
      if (!self.screen.program.sgrMouse) {
        b -= 32;
      }
      s = '\x1b[<' + b + ';' + x + ';' + y +
        (data.action === 'mousedown' ? 'M' : 'm');
    } else {
      if (self.screen.program.sgrMouse) {
        b += 32;
      }
      s = '\x1b[M' +
        String.fromCharCode(b) +
        String.fromCharCode(x + 32) +
        String.fromCharCode(y + 32);
    }

    self.handler(s);
  });

  this.on('focus', function() {
    self.term.focus();
  });

  this.on('blur', function() {
    self.term.blur();
  });

  this.term.on('title', function(title) {
    self.title = title;
    self.emit('title', title);
  });

  this.term.on('passthrough', function(data) {
    self.screen.program.flush();
    self.screen.program._owrite(data);
  });

  this.on('resize', function() {
    nextTick(function() {
      self.term.resize(self.width - self.iwidth, self.height - self.iheight);
    });
  });

  this.once('render', function() {
    self.term.resize(self.width - self.iwidth, self.height - self.iheight);
  });

  this.on('destroy', function() {
    self.kill();
    self.screen.program.input.removeListener('data', self._onData);
  });

  if (this.handler) {
    return;
  }

  var pty = this._loadPty();
  var spawn = pty.spawn || pty.fork;

  if (typeof spawn !== 'function') {
    throw new Error('node-pty does not expose a compatible spawn API.');
  }

  this.pty = spawn(this.shell, this.args, {
    name: this.termName,
    cols: this.width - this.iwidth,
    rows: this.height - this.iheight,
    cwd: this.options.cwd || process.env.HOME || os.homedir(),
    env: this.options.env || process.env
  });

  this.on('resize', function() {
    nextTick(function() {
      try {
        self.pty.resize(self.width - self.iwidth, self.height - self.iheight);
      } catch (e) {
        // PTY can already be gone during teardown races.
      }
    });
  });

  this.handler = function(data) {
    self.pty.write(data);
    self.screen.render();
  };

  this._onPtyData(this.pty, function(data) {
    self.write(data);
    self.screen.render();
  });

  this._onPtyExit(this.pty, function(code) {
    self.emit('exit', code || null);
  });

  this.onScreenEvent('keypress', function() {
    self.screen.render();
  });

  this.screen._listenKeys(this);
};

Terminal.prototype.write = function(data) {
  return this.term.write(data);
};

Terminal.prototype.render = function() {
  var ret = this._render();
  if (!ret) return;

  this.dattr = this.sattr(this.style);

  var xi = ret.xi + this.ileft,
     xl = ret.xl - this.iright,
     yi = ret.yi + this.itop,
     yl = ret.yl - this.ibottom,
     cursor;

  var scrollback = this.term.lines.length - (yl - yi);

  for (var y = Math.max(yi, 0); y < yl; y++) {
    var line = this.screen.lines[y];
    if (!line || !this.term.lines[scrollback + y - yi]) break;

    if (y === yi + this.term.y &&
        this.term.cursorState &&
        this.screen.focused === this &&
        (this.term.ydisp === this.term.ybase || this.term.selectMode) &&
        !this.term.cursorHidden) {
      cursor = xi + this.term.x;
    } else {
      cursor = -1;
    }

    for (var x = Math.max(xi, 0); x < xl; x++) {
      if (!line[x] || !this.term.lines[scrollback + y - yi][x - xi]) break;

      line[x][0] = this.term.lines[scrollback + y - yi][x - xi][0];

      if (x === cursor) {
        if (this.cursor === 'line') {
          line[x][0] = this.dattr;
          line[x][1] = '\u2502';
          continue;
        } else if (this.cursor === 'underline') {
          line[x][0] = this.dattr | (2 << 18);
        } else if (this.cursor === 'block' || !this.cursor) {
          line[x][0] = this.dattr | (8 << 18);
        }
      }

      line[x][1] = this.term.lines[scrollback + y - yi][x - xi][1];
      line[x][0] = this._applyDefaultAttrs(line[x][0]);
    }

    line.dirty = true;
  }

  return ret;
};

Terminal.prototype._isMouse = function(buf) {
  var s = buf;
  if (Buffer.isBuffer(s)) {
    if (s[0] > 127 && s[1] === undefined) {
      s[0] -= 128;
      s = '\x1b' + s.toString('utf-8');
    } else {
      s = s.toString('utf-8');
    }
  }

  if (buf[0] === 0x1b && buf[1] === 0x5b && buf[2] === 0x4d) {
    return true;
  }

  if (typeof s !== 'string' || !s.startsWith('\x1b[')) {
    return false;
  }

  var body = s.slice(2);
  if (body[0] === 'M' && body.length >= 4) return true;
  if ((/^(\d+;\d+;\d+)M/).test(body)) return true;
  if ((/^<(\d+;\d+;\d+)([mM])/).test(body)) return true;
  if ((/^<(\d+;\d+;\d+;\d+)&w/).test(body)) return true;
  if ((/^24([0135])~\[(\d+),(\d+)\]/).test(body) && body.endsWith('\r')) return true;
  if ((/^(O|I)/).test(body)) return true;

  return false;
};

Terminal.prototype.setScroll =
Terminal.prototype.scrollTo = function(offset) {
  this.term.ydisp = offset;
  return this.emit('scroll');
};

Terminal.prototype.getScroll = function() {
  return this.term.ydisp;
};

Terminal.prototype.scroll = function(offset) {
  this.term.scrollDisp(offset);
  return this.emit('scroll');
};

Terminal.prototype.resetScroll = function() {
  this.term.ydisp = 0;
  this.term.ybase = 0;
  return this.emit('scroll');
};

Terminal.prototype.getScrollHeight = function() {
  return this.term.rows - 1;
};

Terminal.prototype.getScrollPerc = function() {
  return (this.term.ydisp / this.term.ybase) * 100;
};

Terminal.prototype.setScrollPerc = function(i) {
  return this.setScroll((i / 100) * this.term.ybase | 0);
};

Terminal.prototype.screenshot = function(xi, xl, yi, yl) {
  xi = 0 + (xi || 0);
  if (xl !== null && xl !== undefined) {
    xl = 0 + (xl || 0);
  } else {
    xl = this.term.lines[0].length;
  }
  yi = 0 + (yi || 0);
  if (yl !== null && yl !== undefined) {
    yl = 0 + (yl || 0);
  } else {
    yl = this.term.lines.length;
  }
  return this.screen.screenshot(xi, xl, yi, yl, this.term);
};

Terminal.prototype.kill = function() {
  if (this.pty) {
    if (typeof this.pty.destroy === 'function') {
      this.pty.destroy();
    }
    if (typeof this.pty.kill === 'function') {
      this.pty.kill();
    }
  }
  this.term.refresh = function() {};
  this.term.write('\x1b[H\x1b[J');
  if (this.term._blink) {
    clearInterval(this.term._blink);
  }
  this.term.destroy();
};

Terminal.prototype._loadPty = function() {
  try {
    return require('node-pty');
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        'Terminal widget requires node-pty. Install optional dependency `node-pty` to enable it.'
      );
    }
    throw err;
  }
};

Terminal.prototype._onPtyData = function(pty, listener) {
  if (typeof pty.onData === 'function') {
    return pty.onData(listener);
  }
  return pty.on('data', listener);
};

Terminal.prototype._onPtyExit = function(pty, listener) {
  if (typeof pty.onExit === 'function') {
    return pty.onExit(function(event) {
      listener(event && event.exitCode);
    });
  }
  return pty.on('exit', listener);
};

Terminal.prototype._applyDefaultAttrs = function(attr) {
  // default foreground = 257
  if (((attr >> 9) & 0x1ff) === 257) {
    attr &= ~(0x1ff << 9);
    attr |= ((this.dattr >> 9) & 0x1ff) << 9;
  }

  // default background = 256
  if ((attr & 0x1ff) === 256) {
    attr &= ~0x1ff;
    attr |= this.dattr & 0x1ff;
  }

  return attr;
};

/**
 * Expose
 */

module.exports = Terminal;
