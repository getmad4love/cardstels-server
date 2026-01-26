
import { PlayerStats, CardType } from "../types";
import { CARDS_DB_BASE, KING_CARDS_DB } from "../data/cards";

export const formatLabel = (type: string) => {
    switch(type) {
        // Zdroje (Resources)
case 'bricks': return '<span class="bg-red-500 text-black font-extrabold px-2 rounded [-webkit-text-stroke:1px_black]">B</span>';
case 'weapons': return '<span class="bg-green-500 text-black font-extrabold px-2 rounded [-webkit-text-stroke:1px_black]">W</span>';
case 'crystals': return '<span class="bg-blue-400 text-black font-extrabold px-2 rounded [-webkit-text-stroke:1px_black]">C</span>';

// Jednotky a budovy (Units & Buildings)
case 'wall': return '<span class="bg-red-500 text-black font-extrabold px-2 rounded [-webkit-text-stroke:1px_black]">W</span>';
case 'tower': return '<span class="bg-blue-500 text-black font-extrabold px-2 rounded [-webkit-text-stroke:1px_black]">T</span>';
case 'king': return '<span class="bg-yellow-500 text-black font-extrabold px-2 rounded [-webkit-text-stroke:1px_black]">K</span>';
case 'shield': return '<span class="bg-cyan-400 text-black font-extrabold px-2 rounded [-webkit-text-stroke:1px_black]">SHIELD</span>';

// Produkce (Production)
case 'prodBricks': return '<span class="bg-red-500 text-black font-extrabold px-2 rounded [-webkit-text-stroke:1px_black]">B+</span>';
case 'prodWeapons': return '<span class="bg-green-500 text-black font-extrabold px-2 rounded [-webkit-text-stroke:1px_black]">W+</span>';
case 'prodCrystals': return '<span class="bg-blue-600 text-black font-extrabold px-2 rounded [-webkit-text-stroke:1px_black]">C+</span>';
        default: return `[${type.toUpperCase()}]`;
    }
};

export const formatValue = (val: number, isPlayer: boolean) => {
    const color = isPlayer ? 'text-white' : 'text-white';
    return `<span class="${color} font-bold">${val > 0 ? '+' : ''}${val}</span>`;
};

const getCardColorClass = (type: number) => {
    if (type === 0) return 'text-red-500'; // Brick
    if (type === 1) return 'text-green-500'; // Weapon
    if (type === 2) return 'text-blue-400'; // Crystal
    if (type === 3) return 'text-yellow-500'; // King
    if (type === 4) return 'text-teal-400'; // Special
    return 'text-white';
};

// Helper for larger emojis
const emo = (emoji: string) => `<span class="text-2xl align-middle drop-shadow-md mx-0.5">${emoji}</span>`;

const getIcon = (card: CardType) => {
    if (card.img) return card.img;
    
    // Fallback lookup if card object is partial
    const dbCard = CARDS_DB_BASE.find(c => c.id == card.id) || KING_CARDS_DB.find(c => c.id == card.id);
    if (dbCard && dbCard.img) return dbCard.img;

    // Type-based fallback (No more Joker default unless unknown)
    if (card.type === 0) return '🧱';
    if (card.type === 1) return '⚔️';
    if (card.type === 2) return '💎';
    if (card.type === 3) return '👑';
    if (card.type === 4) return '✨';
    
    return '🃏';
}

export const Logger = {
    formatLabel,
    formatValue,
    
    // A. System Messages
    system: (msg: string) => `<span class="text-stone-400 font-bold tracking-widest">[SYSTEM]</span> ${msg}`,
    warning: (msg: string) => `<span class="text-red-500 font-black animate-pulse">[WARNING]</span> ${msg}`,
    
    // B. Turns
    turnStart: (label: string, turn: number) => `<span class="text-stone-500">  </span><br/><span class="text-white font-black">${label}: TURN ${turn}</span>`,
    stageStart: (num: number, isEndless: boolean) => `<span class="text-purple-400 font-black text-sm uppercase tracking-widest">--- ${isEndless ? 'ENDLESS ' : ''}STAGE ${num} START ---</span>`,

    // C. King Powers
    kingPowerFound: (label: string) => `<span class="text-yellow-500 font-black">${label} FOUND A KING POWER!</span>`,
    kingPowerDraw: (label: string, cardName: string) => `${label} DRAWS: <span class="text-yellow-400 font-bold">${cardName}</span>`,
    kingPowerLost: (label: string) => `${label}: KING POWER LOST TO VOID`,

    // D. Card Play
    cardPlayed: (label: string, card: CardType, costStr: string) => {
        const color = getCardColorClass(card.type);
        const icon = getIcon(card);
        return `${label}: USED ${emo(icon)} <span class="${color} font-black uppercase">${card.name}</span> ${costStr}`;
    },
    cardDiscarded: (label: string, card: CardType) => {
        const color = getCardColorClass(card.type);
        const icon = getIcon(card);
        return `${label}: DISCARDED ${emo(icon)} <span class="${color} font-bold uppercase">${card.name}</span>`;
    },

    // E. Special Effects (Type 4 & Specifics)
    special: (label: string, msg: string) => `${label}: <span class="text-teal-400 font-bold uppercase">${msg}</span>`,
    
    // F. Passive / King Buffs
    passive: (label: string, msg: string, isNegative = false) => `${label}: <span class="${isNegative ? 'text-red-400' : 'text-green-300'} font-bold uppercase">${msg}</span>`,

    // G. Stat Changes (The Mnemonic Log)
    diff: (prev: PlayerStats, next: PlayerStats, isPlayer: boolean) => {
        const changes: string[] = [];
        const keys = [
            { k: 'bricks', l: 'bricks' }, { k: 'weapons', l: 'weapons' }, { k: 'crystals', l: 'crystals' },
            { k: 'wall', l: 'wall' }, { k: 'tower', l: 'tower' }, { k: 'king', l: 'king' },
            { k: 'shield', l: 'shield' },
            { k: 'prodBricks', l: 'prodBricks' }, { k: 'prodWeapons', l: 'prodWeapons' }, { k: 'prodCrystals', l: 'prodCrystals' }
        ];

        keys.forEach(({k, l}) => {
            const valDiff = (next as any)[k] - (prev as any)[k];
            if (valDiff !== 0) {
                changes.push(`${formatLabel(l)} ${formatValue(valDiff, isPlayer)}`);
            }
        });

        if (changes.length === 0) return null;
        return changes.join(' ');
    },

    // Cost formatter used in cardPlayed
    formatCost: (prev: PlayerStats, next: PlayerStats) => {
        const bDiff = prev.bricks - next.bricks;
        const wDiff = prev.weapons - next.weapons;
        const cDiff = prev.crystals - next.crystals;
        if (bDiff <= 0 && wDiff <= 0 && cDiff <= 0) return '<span class="text-slate-500 font-bold text-xs ml-1">( FREE )</span>';
        
        const parts = [];
        if (bDiff > 0) parts.push(`<span class="text-red-500 font-bold">${bDiff}</span>`);
        if (wDiff > 0) parts.push(`<span class="text-green-500 font-bold">${wDiff}</span>`);
        if (cDiff > 0) parts.push(`<span class="text-blue-400 font-bold">${cDiff}</span>`);
        
        return `<span class="text-slate-400 text-xs ml-1 font-mono">( -${parts.join(' -')} )</span>`;
    },

    // H. Production
    production: (label: string, b: number, w: number, c: number, isPlayer: boolean) => {
        return `${label}: END TURN PROD: ${formatLabel('bricks')} ${formatValue(b, isPlayer)} ${formatLabel('weapons')} ${formatValue(w, isPlayer)} ${formatLabel('crystals')} ${formatValue(c, isPlayer)}`;
    }
};
