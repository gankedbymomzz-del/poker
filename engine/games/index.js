// Danh sách các game. Thêm game mới: viết 1 file cùng khuôn rồi khai báo ở đây.
import * as poker from './poker.js';
import * as baicao from './baicao.js';
import * as xidach from './xidach.js';
import * as tienlen from './tienlen.js';
import * as maubinh from './maubinh.js';

export const GAMES = { poker, baicao, xidach, tienlen, maubinh };
export const GAME_LIST = Object.values(GAMES).map((g) => g.meta);
export const gameOf = (type) => GAMES[type] || GAMES.poker;
