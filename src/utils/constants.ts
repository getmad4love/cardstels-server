
import { TowerStage } from "../types";

export const BASE_WIDTH = 1600;
export const BASE_HEIGHT = 720;
export const START_TOWER = 10;
export const START_WALL = 25;
export const START_KING = 5;
export const START_RESOURCE = 25;
export const START_PROD = 3;
export const MAX_HAND_SIZE = 6;
export const MAX_ENDLESS_KINGS = 5;
export const MAX_SHIELD = 10;

export const WIN_TOWER = 150;
export const MAX_WALL = 200;
export const WIN_KING_MAX = 100;

// Colors
export const COLOR_KING = 'text-yellow-500';
export const COLOR_TOWER = 'text-blue-400';
export const COLOR_WALL = 'text-red-500';
export const COLOR_BRICKS = 'text-red-500';
export const COLOR_WEAPONS = 'text-green-500';
export const COLOR_CRYSTALS = 'text-blue-400';
export const COLOR_PRODUCTION_FLOAT = 'text-lime-300';
export const COLOR_ARCHER_FLOAT = 'text-lime-300';

export const BORDER_KING = 'border-yellow-500';
export const BORDER_TOWER = 'border-blue-500';
export const BORDER_WALL = 'border-red-500';
export const BORDER_WEAPONS = 'border-green-500';

export const PLAYER_COLORS = [
    { id: 0, name: 'LIME', text: 'text-lime-500', bg: 'bg-lime-500', border: 'border-lime-500', bar: 'from-lime-600 to-lime-900', tower: 'from-lime-500 to-lime-700', roof: 'bg-lime-500', wall: 'bg-lime-800', king: 'bg-lime-900', glow: 'shadow-lime-500/50' },
    { id: 1, name: 'RED', text: 'text-red-500', bg: 'bg-red-500', border: 'border-red-500', bar: 'from-red-600 to-red-900', tower: 'from-red-600 to-red-800', roof: 'bg-red-600', wall: 'bg-red-900', king: 'bg-red-950', glow: 'shadow-red-500/50' },
    { id: 2, name: 'BLUE', text: 'text-blue-500', bg: 'bg-blue-500', border: 'border-blue-500', bar: 'from-blue-600 to-blue-900', tower: 'from-blue-600 to-blue-800', roof: 'bg-blue-600', wall: 'bg-blue-900', king: 'bg-blue-950', glow: 'shadow-blue-500/50' },
    { id: 3, name: 'PURPLE', text: 'text-purple-500', bg: 'bg-purple-500', border: 'border-purple-500', bar: 'from-purple-600 to-purple-900', tower: 'from-purple-600 to-purple-800', roof: 'bg-purple-600', wall: 'bg-purple-900', king: 'bg-purple-950', glow: 'shadow-purple-500/50' },
    { id: 4, name: 'CYAN', text: 'text-cyan-400', bg: 'bg-cyan-400', border: 'border-cyan-400', bar: 'from-cyan-600 to-cyan-900', tower: 'from-cyan-500 to-cyan-700', roof: 'bg-cyan-500', wall: 'bg-cyan-800', king: 'bg-cyan-900', glow: 'shadow-cyan-400/50' },
    { id: 5, name: 'ORANGE', text: 'text-orange-500', bg: 'bg-orange-500', border: 'border-orange-500', bar: 'from-orange-600 to-orange-900', tower: 'from-orange-500 to-orange-700', roof: 'bg-orange-500', wall: 'bg-orange-800', king: 'bg-orange-900', glow: 'shadow-orange-500/50' },
    { id: 6, name: 'PINK', text: 'text-pink-500', bg: 'bg-pink-500', border: 'border-pink-500', bar: 'from-pink-600 to-pink-900', tower: 'from-pink-500 to-pink-700', roof: 'bg-pink-500', wall: 'bg-pink-800', king: 'bg-pink-900', glow: 'shadow-pink-500/50' },
    { id: 7, name: 'GOLD', text: 'text-amber-400', bg: 'bg-amber-400', border: 'border-amber-400', bar: 'from-amber-600 to-amber-900', tower: 'from-amber-500 to-amber-700', roof: 'bg-amber-500', wall: 'bg-amber-800', king: 'bg-amber-900', glow: 'shadow-amber-400/50' },

];

export const TOWER_STAGES: TowerStage[] = [
    { wall: 25, tower: 10, king: 5, color: PLAYER_COLORS[4] }, // Cyan
    { wall: 35, tower: 15, king: 10, color: PLAYER_COLORS[2] }, // Blue
    { wall: 40, tower: 25, king: 15, color: { ...PLAYER_COLORS[7], name: 'ELECTRIC YELLOW', text: 'text-yellow-400', border: 'border-yellow-500', roof: 'bg-yellow-500' } }, // Yellow custom
    { wall: 50, tower: 25, king: 20, color: PLAYER_COLORS[5] }, // Orange
    { wall: 55, tower: 35, king: 25, color: PLAYER_COLORS[6] }, // Pink
    { wall: 60, tower: 40, king: 30, color: PLAYER_COLORS[1] }, // Red
    { wall: 70, tower: 50, king: 40, color: PLAYER_COLORS[3] }, // Purple
    { wall: 50, tower: 60, king: 50, color: PLAYER_COLORS[7] }  // Gold
];

export const getTierColor = (val: number) => {
    if (val >= 90) return '#F44336';
    if (val >= 80) return '#FF9800';
    if (val >= 70) return '#9C27B0';
    if (val >= 60) return '#2196F3';
    if (val >= 50) return '#4CAF50';
    return null;
};

export const getTowerProductionBonus = (height: number, _kingCards?: any[]) => {
    if (height >= 90) return 5;
    if (height >= 80) return 4;
    if (height >= 70) return 3;
    if (height >= 60) return 2;
    if (height >= 50) return 1;
    return 0;
};
