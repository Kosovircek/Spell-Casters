// Every effect spell's behaviour, by spell id (see ../spellbook.js for names, costs and levels).
import { ELEMENTS } from './elements.js';
import { SUMMONS } from './summons.js';
import { CONTROL } from './control.js';
import { UTILITY } from './utility.js';

export const CASTS = { ...ELEMENTS, ...SUMMONS, ...CONTROL, ...UTILITY };
