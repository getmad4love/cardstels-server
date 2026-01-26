
import { CARDS_DB_BASE, KING_CARDS_DB } from "../data/cards";
import { CardType, PlayerStats, GameStats, PlayerColorProfile } from "../types";

const SAVE_PREFIX = 'cardstels_v180_slot_'; // Version bump to invalidate old bad saves
const REGISTRY_KEY = 'cardstels_save_registry';

export interface SaveState {
    timestamp: number;
    player: PlayerStats;
    opponent: PlayerStats;
    deck: any[]; // Sanitized
    hand: any[]; // Sanitized
    aiHand: any[]; // Sanitized
    turnCounts: { p: number, c: number };
    playerTurn: boolean;
    cardPlayedInTurn: number;
    gameState: string;
    isTowerMode: boolean;
    isEndlessMode: boolean;
    isMultiplayer: boolean;
    towerStage: number;
    endlessStage: number;
    gameStats: GameStats;
    endlessCpuColor: any;
    lastDiscardedCard: any;
    playerKingCards: any[];
    opponentKingCards: any[];
    // Critical additions for restoring exact state
    kingSelectionState: any; 
    isInitialDealing: boolean;
    levelIntroActive: boolean;
    destructionState: string | null;
    lootState: any;
    // Colors
    p1Color: PlayerColorProfile;
    p2Color: PlayerColorProfile;
}

const sanitizeCard = (c: CardType) => {
    return {
        id: c.id,
        uniqueId: c.uniqueId,
        isMadness: c.isMadness,
        type: c.type,
        name: c.name
    };
};

const sanitizeList = (list: CardType[]) => list.map(sanitizeCard);

export const hydrateCard = (savedCard: any): CardType | null => {
    if (!savedCard) return null;
    
    // 1. Try finding in Base DB
    let base = CARDS_DB_BASE.find(db => db.id === savedCard.id);
    
    // 2. Try finding in King DB (if not found or if it looks like a king card)
    if (!base) {
        base = KING_CARDS_DB.find(db => db.id === savedCard.id);
    }

    // 3. Fallback for Special Cards (Type 4) that might be dynamically generated or have static IDs
    if (!base && savedCard.type === 4) {
       // Often specials are in CARDS_DB_BASE (id 100+), but if missing, use saved data
       return savedCard as CardType;
    }

    if (!base) {
        return savedCard as CardType;
    }

    return {
        ...base,
        uniqueId: savedCard.uniqueId,
        isMadness: savedCard.isMadness,
    };
};

const hydrateList = (list: any[]): CardType[] => {
    if (!list) return [];
    return list.map(hydrateCard).filter(c => c !== null) as CardType[];
};

export const saveGameToSlot = (slotId: number | string, state: SaveState) => {
    try {
        const dataToSave = {
            ...state,
            deck: sanitizeList(state.deck),
            hand: sanitizeList(state.hand),
            aiHand: sanitizeList(state.aiHand),
            lastDiscardedCard: state.lastDiscardedCard ? { ...state.lastDiscardedCard, card: sanitizeCard(state.lastDiscardedCard.card) } : null,
            playerKingCards: state.playerKingCards, // King cards are static enough
            opponentKingCards: state.opponentKingCards,
            p1Color: state.p1Color,
            p2Color: state.p2Color
        };

        localStorage.setItem(`${SAVE_PREFIX}${slotId}`, JSON.stringify(dataToSave));

        let registry: any = {};
        try {
            registry = JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{}');
        } catch { registry = {}; }

        registry[slotId] = {
            occupied: true,
            timestamp: Date.now(),
            isTowerMode: state.isTowerMode,
            isEndlessMode: state.isEndlessMode,
            isMultiplayer: state.isMultiplayer,
            towerStage: state.towerStage,
            endlessStage: state.endlessStage
        };
        localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
        return true;
    } catch (e) {
        console.error("Save failed", e);
        return false;
    }
};

export const loadGameFromSlot = (slotId: number | string): SaveState | null => {
    try {
        const str = localStorage.getItem(`${SAVE_PREFIX}${slotId}`);
        if (!str) return null;

        const raw = JSON.parse(str);
        
        const restoredState: SaveState = {
            ...raw,
            deck: hydrateList(raw.deck),
            hand: hydrateList(raw.hand),
            aiHand: hydrateList(raw.aiHand),
            lastDiscardedCard: raw.lastDiscardedCard ? { ...raw.lastDiscardedCard, card: hydrateCard(raw.lastDiscardedCard.card) } : null,
            player: { ...raw.player, shield: raw.player.shield || 0 },
            opponent: { ...raw.opponent, shield: raw.opponent.shield || 0 },
            // Ensure colors are present if legacy save didn't have them
            p1Color: raw.p1Color,
            p2Color: raw.p2Color
        };

        return restoredState;
    } catch (e) {
        console.error("Load failed", e);
        return null;
    }
};

export const getSaveRegistry = () => {
    try {
        return JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{}');
    } catch { return {}; }
};
