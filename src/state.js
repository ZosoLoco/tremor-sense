// S: everything that changes while the game runs and that more than one module touches.
// L: late-bound functions and objects, so a module can call into one that loads after it.
export const S = {};
export const L = {};
