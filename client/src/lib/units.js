/**
 * @file units.js
 * @description The unit vocabulary the admin forms offer. `server/lib/validation.js`
 * is the authority — it is what actually rejects a bad value — and this file exists
 * only so the client can render a dropdown instead of asking a human to guess the
 * server's list.
 *
 * That makes it a copy, which is a foot-gun this codebase already carries twice
 * (todo.md Group 8 #31). It is guarded rather than commented: units.test.js imports
 * the server's array and fails if the two ever disagree. Group 5 #15 turns the column
 * into a Prisma enum, at which point both arrays are generated and this file is deleted.
 */
export const UNITS = ['kg', 'm', 'roll', 'pcs']
