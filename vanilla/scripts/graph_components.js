/** @module graph_components */

import * as consts from './consts.js';
import { is_Mealy, is_Moore, is_Turing, initial_stack_symbol, allow_epsilon_transition, pda_extended_transition } from './menus.js';

/**
 * making a new vertex
 * @param {string} name - name of the vertex
 * @param {float} x - x cooridnate w.r.t. canvas
 * @param {float} y - y cooridnate w.r.t. canvas
 * @param {float} r - radius in pixels
 * @param {boolean} is_start - is the vertex a start state?
 * @param {boolean} is_final - is the vertex an accept state?
 * @param {Array<Object>} out - neighbors, more specifically array of edges to neighbors
 * @param {string} moore_output - the output associated with the vertex (for Moore machines)
 * @returns {Object} the vertex as a json object
 */
export function make_vertex(name, x, y, r, is_start, is_final, out, moore_output) {
  return {
    name: name,
    x: x,
    y: y,
    r: r ? r : consts.DEFAULT_VERTEX_RADIUS,
    is_start: is_start ? is_start : false,
    is_final: is_final ? is_final : false,
    out: out ? out : [],
    moore_output: moore_output ? moore_output : consts.DEFAULT_MOORE_OUTPUT,
    highlighted: false  // a vertex is lit up during running the machine if it is in the current state
  };
}

/**
 * Check which user interface we are on and return the appropriate empty symbol
 * @returns {string} ☐ if dealing with Turing machine and ε otherwise
 */
export function get_empty_symbol() {
  if (is_Turing()) {
    return consts.EMPTY_TAPE;
  } else if(is_Moore() || is_Mealy()) {
    return consts.DEFAULT_MOORE_MEALY_TRANSITION;
  } else {
    return consts.EMPTY_SYMBOL;
  }
}

/**
 * making a new edge
 * @param {string} from - from vertex
 * @param {string} to - to vertex
 * @param {string | undefined} transition - transition symbol
 * @param {float} a1 - first coordinate for the edge basis
 * @param {float} a2 - second cooridnate for the edge basis
 * @param {float} angle1 - start angle for self loop
 * @param {float} angle2 - end angle for self loop
 * @param {string} pop_symbol - the read symbol
 * @param {string} push_symbol - the write symbol
 * @param {string} move - whether move left of right
 * @param {string} mealy_output - output for a Mealy machine
 * @returns {Object} the edge as a json object
 */
export function make_edge(from, to, transition, a1, a2, angle1, angle2, pop_symbol, push_symbol, move, mealy_output) {
  if (from === to && (angle1 === undefined || angle2 === undefined)) {
    angle1 = 0, angle2 = Math.PI/2, a1 = 0.5, a2 = 1;
  } else if (a1 === undefined || a2 === undefined) {
    a1 = 0.5, a2 = 0;
  }  // making sure edges are properly drawn
  return {
    from: from,
    to: to,
    transition: transition ? transition : allow_epsilon_transition() ? get_empty_symbol() : 'a',
    a1: a1,
    a2: a2,
    angle1: angle1,
    angle2: angle2,
    pop_symbol: pop_symbol ? pop_symbol : initial_stack_symbol() ? consts.STACK_INITIAL_SYMBOL : get_empty_symbol(),
    push_symbol: push_symbol ? push_symbol : !pda_extended_transition() ? get_empty_symbol() : 'N',
    move: move ? move : consts.RIGHT,
    mealy_output: mealy_output ? mealy_output : consts.DEFAULT_MEALY_OUTPUT
  };
}

/**
 * check if the two edges are equal up to graphical representation
 * @param {Object} e1 - edge 1
 * @param {Object} e2 - edge 2
 * @returns {boolean} true iff equal
 */
export function edge_equal(e1, e2) {
  return e1.from === e2.from &&
         e1.to === e2.to &&
         e1.transition === e2.transition &&
         e1.pop_symbol === e2.pop_symbol &&
         e1.push_symbol === e2.push_symbol &&
         e1.move === e2.move &&
         e1.mealy_output === e2.mealy_output;
}
