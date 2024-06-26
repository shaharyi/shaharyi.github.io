/** @module compute */

import * as consts from './consts.js';
import * as drawing from './drawing.js';
import { edge_equal } from './graph_components.js';
import { allow_epsilon_transition, initial_stack_symbol, pda_extended_transition } from './menus.js';

/** given a graph and its input, compute the input alphabet */
export function compute_alphabet(graph, input) {
  const alphabet = new Set();
  for(const vertex of Object.values(graph)) {
    for(const e of vertex.out) {
      alphabet.add(e.transition);
    }
  }

  if(input) {
    for(let i = 0; i < input.length; i++) {
      alphabet.add(input.charAt(i));
    }
  }

  alphabet.delete(consts.EMPTY_SYMBOL);
  return alphabet;
}

/**
 * finds the start vertex
 * @param {Object} graph - the graph whose starting vertex is to be computed
 * @returns {string} the start of the graph, null of graph empty
 */
export function find_start(graph) {
  for (const [v, vertex] of Object.entries(graph)) {
    if (vertex.is_start) {
      return v;
    }
  }
  return null;
}

/**
 * compute the set of closure of current states (in-place and returns)
 * @param {Object} graph - the graph containing the cur_states
 * @param {Set<string>} cur_states - current states the machine is in
 * @returns {Set<string>} the closure of cur_states
 */
export function closure(graph, cur_states) {
  for (const v of cur_states) {  // sets are interated in insertion order, so is BFS by default
    for (const edge of graph[v].out) {
      if (edge.transition === consts.EMPTY_SYMBOL) {
        cur_states.add(edge.to);
      }
    }
  }
  return cur_states;
}

/**
 * checks if the set of states provided contains a final state
 * @param {Object} graph - the graph containing the cur_states
 * @param {Set<string>} cur_states - the set of current states we want to check if any is a final state
 * @returns {boolean} true iff some state in cur_states is a final state
 */
export function contains_final(graph, cur_states) {
  for (const v of cur_states) {
    if (graph[v].is_final) {
      return true;
    }
  }
  return false;
}

/**
 * a single step of the NFA running algorithm
 * @param {Object} graph - the NFA of interest
 * @param {Set<string>} cur_states - all possible states the machine is in
 * @param {string} symbol - the transition symbol
 * @returns {Set<string>} a new set of states after the transition
 */
export function NFA_step(graph, cur_states, symbol) {
  const new_states = new Set();
  for (const v of cur_states) {
    for (const edge of graph[v].out) {
      if (edge.transition === symbol) {
        new_states.add(edge.to);
      }
    }
  }
  return closure(graph, new_states);
}

/**
 * a single step of the NFA running algorithm
 * @param {Object} graph - the Mealy machine of interest
 * @param {string} cur_state - current state of the machine
 * @param {string} symbol - the transition symbol
 * @returns {Object} the output of the transition and the next state
 */
export function mealy_step(graph, cur_state, symbol) {
  let next_state;
  let output;

  for (const edge of graph[cur_state].out) {
    if(edge.transition === symbol) {
      next_state = edge.to;
      output = edge.mealy_output;
    }
  }

  return { next_state, output };
}

export function moore_step(graph, cur_state, symbol) {
  let next_state;

  for (const edge of graph[cur_state].out) {
    if(edge.transition === symbol) {
      next_state = edge.to;
    }
  }
  
  return next_state;
}

/**
 * check if the input is accepted
 * @param {Object} graph - machine graph
 * @param {string} input - input string
 * @returns {Iterable} a generator that evaluates to true iff the input is accepted by the machine
 */
function* run_input_NFA(graph, input, interactive=false) {
  let cur_states = closure(graph, new Set([find_start(graph)]));  // find closure of start
  if (interactive) {
    drawing.highlight_states(graph, cur_states);
    drawing.viz_NFA_input(input, 0);
    yield;
  }
  for (let i = 0; i < input.length; ++i) {
    cur_states = NFA_step(graph, cur_states, input.charAt(i));
    if (!cur_states.size) {  // can't go anywhere
      break;
    }
    
    if (interactive) {
      drawing.highlight_states(graph, cur_states);
      drawing.viz_NFA_input(input, i+1);
      if (i === input.length-1) {  // last step
        break;
      } else {
        yield;
      }
    }
  }
  return contains_final(graph, cur_states);
}

/**
 * Compute the (almost) closure of PDA states stored inside the queue q and add them to the queue
 * Note that we only evaluate all the epsilon transitions once to speed up computation
 * @param {Object} graph 
 * @param {Map<string, Array>} cur_configs - an array of configurations [vertex_name, stack, remaining_input]
 *                                           we package it in a set to deduplicate
 */
function PDA_closure(graph, cur_configs) {
  let original_len = cur_configs.size;
  for (const [v, stack, remaining_input] of cur_configs.values()) {
    for (const edge of graph[v].out) {
      const {transition, to, pop_symbol, push_symbol} = edge;
      const stack_copy = [...stack], input_copy = [...remaining_input];  // deep clone the input and stack
      if (transition !== consts.EMPTY_SYMBOL) {  // not spontaneous transition
        continue;
      }
      const topsym = stack_copy.pop();
      stack_copy.push(topsym);
      if (pop_symbol !== consts.EMPTY_SYMBOL && pop_symbol !== topsym) {  // stack mismatch
        continue;
      }
      if (push_symbol !== consts.EMPTY_SYMBOL) {  // add to the stack
        const op = push_symbol[0];
        if (op == '+')
          push_symbol.substring(1).split('').map(x => stack_copy.push(x));
        if (op == '-' && topsym == push_symbol.substring(1)) {
          const x = stack_copy.pop();
          if (x == '=')    // cannot pop start symbol
            stack_copy.push(x);
        }
      }
      cur_configs.set(JSON.stringify([to, stack_copy, input_copy]), [to, stack_copy, input_copy]);
    }
    --original_len;
    if (!original_len) {  // we have evaluated all the original configurations
      break;              // break to prevent infinite loop after adding new configurations
    }
  }
}

/**
 * Extract a list of vertices from a map of configurations
 * @param {Map<string, Array>} cur_configs - a map of whose values are [vertex_name, stack, remaining_input]
 * @returns Set<string> a set of vertex names
 */
function config_to_vertices(cur_configs) {
  const cur_vertices = new Set();
  // eslint-disable-next-line no-unused-vars
  for (const [v, _, __] of cur_configs.values()) {
    cur_vertices.add(v);
  }
  return cur_vertices;
}

/**
 * step through the the computation of PDA with BFS
 * @param {Object} graph - machine graph
 * @param {string} v - starting vertex
 * @param {Array<string>} remaining_input - input string split into char array
 * @param {int} allowed_depth - the computation will halt and return false if the BFS tree is deeper than this
 * @returns {Iterable} a generator that evaluates to true iff the input is accepted by the machine
 */
function* BFS_step(graph, v, remaining_input, interactive=false, allowed_depth=64) {
  console.log('remaining_input = ' + remaining_input);
  let stack =  initial_stack_symbol() ? [consts.STACK_INITIAL_SYMBOL] : [];  // the computational stack
  let cur_configs = new Map(), nxt_configs = new Map();  // the current configurations [vertex, stack, remaining_input]
  cur_configs.set(JSON.stringify([v, stack, remaining_input]), [v, stack, remaining_input]);
  if (allow_epsilon_transition())
    PDA_closure(graph, cur_configs);
  if (interactive) {
    drawing.highlight_states(graph, config_to_vertices(cur_configs));
    drawing.viz_PDA_configs(graph, cur_configs);
    yield;
  }
  if (graph[v].is_final && !remaining_input.length) {  // final state + empty input
    if (interactive) {
      const cur_vertices = config_to_vertices(cur_configs);
      cur_vertices.add(v);
      drawing.highlight_states(graph, cur_vertices);
    }
    return true;
  }
  while (cur_configs.size && allowed_depth --> 0) {
    // process all configurations on a single depth of the BFS tree
    for (const [v, stack, remaining_input] of cur_configs.values()) {
      for (const edge of graph[v].out) {
        const {transition, to, pop_symbol, push_symbol} = edge;
        const stack_copy = [...stack], input_copy = [...remaining_input];  // deep clone the input and stack
        console.log('letter: '+ input_copy[input_copy.length-1]);
        if ((!allow_epsilon_transition() || transition !== consts.EMPTY_SYMBOL) && transition !== input_copy.pop()) {
          console.log('input letter mismatch');
          continue;  // input mismatch
        }
        const topsym = stack_copy.pop();
        if (pda_extended_transition()) 
          stack_copy.push(topsym);
        if ((!allow_epsilon_transition() || pop_symbol !== consts.EMPTY_SYMBOL) && pop_symbol !== topsym) {
          continue;  // stack mismatch
        }
        // now we can go since both transition and stack match
        if (!pda_extended_transition()) {
          if (push_symbol !== consts.EMPTY_SYMBOL) {  
              push_symbol.split('').map(x => stack_copy.push(x));
              const x = stack_copy.pop();
              if (x == consts.STACK_INITIAL_SYMBOL)    // cannot pop start symbol
                stack_copy.push(x);
            }
          } else {
            switch (push_symbol[0]) {
              case 'N':  //no-op
                break;
              case '+':  //push
                push_symbol.substring(1).split('').map(x => stack_copy.push(x));
                break;
              case '-':  //pop, unless its the stack bottom symbol
                if (topsym == push_symbol[1] && stack_copy[stack_copy.length-1] != consts.STACK_INITIAL_SYMBOL)
                  stack_copy.pop();
                break;
              default:
                print('bad input');
              }
          }        
        if (graph[to].is_final && !input_copy.length) {  // final state + exhausted input
          if (interactive) {
            const cur_vertices = config_to_vertices(cur_configs);
            cur_vertices.add(to);
            drawing.highlight_states(graph, cur_vertices);
          }
          return true;
        }
        nxt_configs.set(JSON.stringify([to, stack_copy, input_copy]), [to, stack_copy, input_copy]);
      }
    }
    if (allow_epsilon_transition())
      PDA_closure(graph, nxt_configs);
    if (interactive) {
      if (nxt_configs.size) {  // not the last step
        drawing.highlight_states(graph, config_to_vertices(nxt_configs));
        drawing.viz_PDA_configs(graph, nxt_configs);
        yield;
      } else {
        return false;
      }
    }
    cur_configs = nxt_configs;
    nxt_configs = new Map();  // swap the buffers
  }
  return false;  // either stuck or exhausted step limit
}

/**
 * check if the input is accepted
 * @param {Object} graph - machine graph
 * @param {string} input - input string
 * @param {boolean} interactive - whether to show the computation step by step
 * @returns {Iterable} a generator that evaluates to true iff the input is accepted by the machine
 */
function run_input_PDA(graph, input, interactive) {
  const v = find_start(graph);
  const remaining_input = input.split('').reverse();
  return BFS_step(graph, v, remaining_input, interactive);
}

/**
 * check if the input is accepted
 * @param {Object} graph - machine graph
 * @param {string} input - input string
 * @param {int} allowed_steps - the computation will halt and return false if the step limit is reached
 * @returns {Iterable} a generator that evaluates to true iff the input is accepted by the machine
 */
function* run_input_Turing(graph, input, interactive=false, allowed_steps=512) {
  const tape = {};  // we use an object instead of array to have negative index
  for (let i = 0; i < input.length; i++) {
    tape[i] = input[i];  // copy all input over
  }
  let tape_idx = 0;  // starting tape index
  let cur_state = find_start(graph);
  if (interactive) {
    drawing.highlight_states(graph, [cur_state]);
    drawing.viz_TM_tape(tape, tape_idx);
    yield;
  }

  let stuck = false;  // whether we are out of legal transitions
  while (!stuck && !graph[cur_state].is_final && allowed_steps --> 0) {
    stuck = true;  // assume we are stuck and change to not stuck in the loop
    for (const edge of graph[cur_state].out) {
      if (!tape[tape_idx]) {  // fill in empty if tape null/undefined
        tape[tape_idx] = consts.EMPTY_TAPE;
      }
      if (edge.transition !== tape[tape_idx]) {  // cannot take this transition
        continue;
      }
      cur_state = edge.to;  // go to next state
      tape[tape_idx] = edge.push_symbol;  // write to tape
      tape_idx += (edge.move === consts.LEFT) ? -1 : 1;  // move tape needle
      stuck = false;  // we just moved, so not stuck
      break;  // determinism, so can't multi-branch
    }
    if (interactive) {
      drawing.highlight_states(graph, [cur_state]);
      drawing.viz_TM_tape(tape, tape_idx);
      if (graph[cur_state].is_final) {
        return true;
      } else if (stuck) {
        return false;
      } else {
        yield;
      }
    }
  }
  return graph[cur_state].is_final;
}

/**
 * check if the input is accepted
 * @param {Object} graph - machine graph
 * @param {string} input - input string
 * @param {boolean} interactive - whether to show the computation step by step
 * @returns {Iterable} a generator that evaluates to the final output of the machine
 */
function* run_input_Mealy(graph, input, interactive) {
  let cur_state = find_start(graph);  // find closure of start
  let output_string = '';

  if (interactive) {
    drawing.highlight_states(graph, [cur_state]);
    drawing.viz_NFA_input(input, 0);
    yield;
  }
  for (let i = 0; i < input.length; ++i) {
    let mealy_output = mealy_step(graph, cur_state, input.charAt(i));
    cur_state = mealy_output.next_state;
    output_string += mealy_output.output;
    
    if (interactive) {
      drawing.highlight_states(graph, [cur_state]);
      drawing.viz_NFA_input(input, i+1);
      if (i === input.length-1) {  // last step
        break;
      } else {
        yield;
      }
    }
  }

  return output_string;
}

function* run_input_Moore(graph, input, interactive) {
  let cur_state = find_start(graph);
  let output_string = graph[cur_state].moore_output;

  if (interactive) {
    drawing.highlight_states(graph, [cur_state]);
    drawing.viz_NFA_input(input, 0);
    yield;
  }
  for (let i = 0; i < input.length; ++i) {
    cur_state = moore_step(graph, cur_state, input.charAt(i));
    output_string += graph[cur_state].moore_output;
    
    if (interactive) {
      drawing.highlight_states(graph, [cur_state]);
      drawing.viz_NFA_input(input, i+1);
      if (i === input.length-1) {  // last step
        break;
      } else {
        yield;
      }
    }
  }

  return output_string;
}

/**
 * determines whether the machine is PDA or normal NFA and checks if the input is accepted
 * @param {Object} graph - machine graph
 * @param {string} machine_type - type of machine the graph represents
 * @param {string} input - input string
 * @param {boolean} interactive - whether to step through and highlight the computation
 * @returns {Iterable} return a generator that
 *                     if noninteractive, evaluates to  the final accept/reject immediately in one step
 *                     if interactive, evaluates step by step with highlight
 */
export function run_input(graph, machine_type, input, interactive=false) {
  let arr = input.split(',');
  if (interactive) {
    drawing.highlight_states(graph, []);  // clear all highlights
    arr = arr.slice(0,1);
  }
  if (!Object.keys(graph).length) {  // empty graph
    return 'The graph is empty; nothing to do...';
  }
  let r = true;
  let output = true;
  for (input of arr) {
    drawing.viz_NFA_input(input, 0);
    console.log(input);
    if (machine_type === consts.MACHINE_TYPES.NFA) {
      r = run_input_NFA(graph, input, interactive);
    } else if (machine_type === consts.MACHINE_TYPES.PDA) {
      r = run_input_PDA(graph, input, interactive);
    } else if (machine_type === consts.MACHINE_TYPES.Turing) {
      r = run_input_Turing(graph, input, interactive);
    } else if (machine_type === consts.MACHINE_TYPES.Mealy && is_DFA(graph, input)) {
      r = run_input_Mealy(graph, input, interactive);
    } else if (machine_type === consts.MACHINE_TYPES.Moore && is_DFA(graph, input)) {
      r = run_input_Moore(graph, input, interactive);
    } else
      console.log('Bug - did not find machine type ' + machine_type);
    if (!interactive) {
      output = r.next().value;
      if (!output) {
        return false;
      }
    }
  }
  return (interactive) ? r : output;
}

/** given an NFA, check if it is in fact deterministic */
export function is_DFA(NFA, input) {
  const alphabet = compute_alphabet(NFA, input);

  for(const vertex of Object.values(NFA)) {
    const outgoing = [];
    for(const e of vertex.out) {
      outgoing.push(e.transition);
    }

    if(outgoing.includes(consts.EMPTY_SYMBOL)) {
      return false;
    }

    if(outgoing.length < alphabet.size) {
      let missing_transitions = '';
      let alpha_array = Array.from(alphabet);
      for(let i = 0; i < alpha_array.length; i++) {
        if(!outgoing.includes(alpha_array[i])) {
          missing_transitions += alpha_array[i] + ', ';
        }
      }

      alert('Missing transitions ' + missing_transitions.substring(0, missing_transitions.length - 2) + ' for ' + vertex.name);
      return false;
    } else if(outgoing.length > alphabet.size) {
      let extra_transitions = '';
      for(let i = 0; i < outgoing; i++) {
        if(!alphabet.has(outgoing[i])) {
          extra_transitions += outgoing[i] + ', ';
        }
      }

      alert('Extra transitions ' + extra_transitions.substring(0, extra_transitions.length - 2) + ' for ' + vertex.name);
      return false;
    }
  }

  return true;
}

/**
 * computes if the edge is the same as another one already in graph up to graphical representation
 * @param {Object} graph 
 * @param {Object} edge 
 * @returns {boolean} true iff edge in graph
 */
export function edge_has_equiv_edge_in_graph(graph, edge) {
  for (const vertex of Object.values(graph)) {
    for (const e of vertex.out) {
      if (edge_equal(e, edge)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * computes if the edge IS already in graph
 * @param {Object} graph 
 * @param {Object} edge 
 * @returns {boolean} true iff edge in graph
 */
export function edge_in_graph(graph, edge) {
  for (const vertex of Object.values(graph)) {
    for (const e of vertex.out) {
      if (edge === e) {
        return true;
      }
    }
  }
  return false;
}
