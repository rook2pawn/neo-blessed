/**
 * line.js - line element for blessed
 * Copyright (c) 2013-2015, Christopher Jeffrey and contributors (MIT License).
 * https://github.com/chjj/blessed
 */

/**
 * Modules
 */

var Node = require('./node');
var Box = require('./box');

/**
 * Line
 */

function Line(options) {
  if (!(this instanceof Node)) {
    return new Line(options);
  }

  options = options || {};

  var orientation = options.orientation || 'vertical';
  delete options.orientation;

  if (orientation === 'vertical') {
    options.width = 1;
  } else {
    options.height = 1;
  }

  Box.call(this, options);
  if (!options.type || options.type === 'line') {
    this.ch = orientation === 'horizontal' ? '\u2500' : '\u2502';
  } else {
    this.ch = options.ch || ' ';
  }

  this.border = {
    type: 'bg',
    __proto__: this
  };

  this.style.border = this.style;
}

Object.setPrototypeOf(Line.prototype, Box.prototype);

Line.prototype.type = 'line';

/**
 * Expose
 */

module.exports = Line;
