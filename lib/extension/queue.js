/*
 * Array FIFO (peeled from tree.js — G8n). Plain class; not GObject topology.
 */

export class Queue {
  constructor() {
    this._elements = [];
  }

  get length() {
    return this._elements.length;
  }

  enqueue(item) {
    this._elements.push(item);
  }

  dequeue() {
    return this._elements.shift();
  }
}
