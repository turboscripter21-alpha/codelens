/* Landing page: the account chip (top right) and, once per tab, the "log in or continue as guest" card. */
import { mountChip, askOnce } from './account.js';
import { FEATURES } from './features.js';
if (FEATURES.accounts !== false) {
  mountChip(document.body).classList.add('ac-chip--float');
  setTimeout(() => { askOnce(); }, 700);
}
