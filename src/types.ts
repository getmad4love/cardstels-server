
import React from 'react';

export interface CardType {
  id: number | string;
  name: string;
  type: number; // 0: Brick, 1: Weapon, 2: Crystal, 3: King, 4: Special
  costB?: number;
  costW?: number;
  costC?: number;
  desc: string;
  effect?: any;
  img?: string;
  count?: number;
  uniqueId?: string;
  isKing?: boolean;
  isMadness?: boolean; // Discounted card from Madness effect
}

export interface PlayerStats {
  tower: number;
  wall: number;
  king: number;
  bricks: number;
  prodBricks: number;
  crystals: number;
  prodCrystals: number;
  weapons: number;
  prodWeapons: number;
  burn: number;
  shield: number; 
  madnessActive?: boolean; // Madness effect active for next draw
}

export type GameState = 'LOBBY' | 'PLAYING' | 'WON' | 'LOST' | 'TRANSITION' | 'LOOTING' | 'ENDING';

export interface FloatingTextData {
  id: string;
  x: number;
  y: number;
  val: number;
  type: string;
  key?: string | null;
  variant?: number;
  isDown?: boolean;
}

export interface PlayerGameStats {
    built: number;
    dmg: number;
    taken: number;
    cardsUsed: number;
    cardsDiscarded: number;
    totalCost: number;
}

export interface CumulativeStats {
    totalEnemiesDefeated: number;
    totalCardsPlayedByCpu: number;
    totalCpuCost: number;
}

export interface GameStats {
    p1: PlayerGameStats;
    p2: PlayerGameStats;
    startTime: number;
    endTime?: number;
    cumulative?: CumulativeStats;
}

export interface PlayerColorProfile {
    id?: number;
    name: string;
    text: string;
    bg?: string;
    border: string;
    bar: string;
    tower: string;
    wall: string;
    king: string;
    roof: string; 
    glow?: string;
}

export interface TowerStage {
    wall: number;
    tower: number;
    king: number;
    color: PlayerColorProfile;
}

export interface MultiPlayerInfo {
    id: string;
    nickname: string;
    colorId: number;
    isReady: boolean;
    role: 'p1' | 'p2';
}

export interface LobbyState {
    p1: MultiPlayerInfo | null;
    p2: MultiPlayerInfo | null;
    messages: { sender: string; text: string; color: string }[];
}

// NEW: Context passed to cards so they can execute their own logic symmetrically for Player and AI
export interface GameContext {
    me: PlayerStats;
    opponent: PlayerStats;
    setMe: React.Dispatch<React.SetStateAction<PlayerStats>>;
    setOpponent: React.Dispatch<React.SetStateAction<PlayerStats>>;
    myHand: CardType[];
    setMyHand: React.Dispatch<React.SetStateAction<CardType[]>>;
    myKingCards: CardType[];
    opponentKingCards: CardType[];
    addLog: (msg: string, type: string, isRawHtml?: boolean) => void;
    playSFX: (key: string) => void;
    triggerAnimation: (type: string, direction: string) => void;
    spawnParticles: (x: number, y: number, scale: number, type: string) => void;
    updateStats: (playerKey: string, category: string, amount: number) => void;
    triggerKingPowerSequence: (isPlayer: boolean) => Promise<void>;
    returnCardToBottom: (card: CardType, isPlayer: boolean, action: string) => void;
    isP1: boolean;
    labels: { p1: string; p2: string };
    setDeck?: React.Dispatch<React.SetStateAction<CardType[]>>; // For Tornado effect
}
