
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Card, { CardBackContent, KingCardBackContent } from '../components/Card';
import { ResourceIndicator, HpIndicator, FloatingText, AnimationOverlay } from '../components/GameUI';
import { TowerDisplay } from '../components/TowerDisplay';
import { KingSelectionOverlay, KingLootOverlay, KingDeckOverlay, PlayedCardShowcase, DealingCardVisual, KingPowerShuffleVisual, CardModal } from '../components/Overlays';
import { GameOverPanel } from '../components/GameOver';
import { CARDS_DB_BASE, KING_CARDS_DB, calculateDamage, getEffectiveCardCost, canAfford, getKingBuffs, activeKingBuff, playCardAction } from '../data/cards';
import { CardType, PlayerStats, PlayerColorProfile, GameContext, GameStats } from '../types';
import { 
    BASE_WIDTH, BASE_HEIGHT, START_TOWER, START_WALL, START_KING, START_RESOURCE, START_PROD, 
    MAX_HAND_SIZE, MAX_ENDLESS_KINGS, TOWER_STAGES, getTowerProductionBonus, PLAYER_COLORS, WIN_KING_MAX, WIN_TOWER, MAX_WALL, MAX_SHIELD 
} from '../utils/constants';
import { playSFX, resumeAudioContext, toggleMusic, toggleSfx, updateMusicTempoByHP, updateMusicTempo } from '../utils/audioManager';
import { executeAiTurn } from '../utils/aiLogic';
import { loadGameFromSlot, saveGameToSlot, SaveState, getSaveRegistry } from '../utils/saveManager';
import { Logger } from '../utils/Logger';

const generateDeck = () => {
    const deckList: CardType[] = [];
    CARDS_DB_BASE.forEach(card => {
        if (card.id === 42) return;
        const count = card.count || 1;
        for (let i = 0; i < count; i++) deckList.push({ ...card, uniqueId: Math.random().toString(36).substr(2, 9) });
    });
    for (let i = deckList.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deckList[i], deckList[j]] = [deckList[j], deckList[i]]; }
    return deckList;
};

const getAvailableKingCards = (pCards: any[], oCards: any[], isStart = false) => {
    const activeIds = [...pCards, ...oCards].map(c => c.id);
    let forbiddenIds = [...activeIds];
    if (!isStart) forbiddenIds.push('k_big', 'k_son', 'k_hoard', 'k_ind', 'k_bunk');
    return KING_CARDS_DB.filter(c => !forbiddenIds.includes(c.id));
};

const shuffleKingDeck = (deckToShuffle: CardType[]) => {
    const newDeck = [...deckToShuffle];
    for (let i = newDeck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]]; }
    return newDeck;
};

const assignUniqueCpuKing = (playerCards: any[], opponentCards: any[]) => {
    const pool = getAvailableKingCards(playerCards, opponentCards);
    if (pool.length === 0) return [];
    return [pool[Math.floor(Math.random() * pool.length)]];
};

const usePrevious = (value: any) => {
    const ref = useRef<any>(null);
    useEffect(() => { ref.current = value; });
    return ref.current;
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const initialGameStats: GameStats = { 
    p1: { built: 0, dmg: 0, taken: 0, cardsUsed: 0, cardsDiscarded: 0, totalCost: 0 }, 
    p2: { built: 0, dmg: 0, taken: 0, cardsUsed: 0, cardsDiscarded: 0, totalCost: 0 },
    startTime: Date.now()
};

const Game = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    
    // --- GAME MODE STATE ---
    const [isMultiplayer, setIsMultiplayer] = useState(searchParams.get('mode') === '2player');
    const [isTowerMode, setIsTowerMode] = useState(searchParams.get('mode') === 'tower');
    const [isEndlessMode, setIsEndlessMode] = useState(searchParams.get('mode') === 'endless');

    const [gameState, setGameState] = useState<any>('PLAYING');
    const [endGameReason, setEndGameReason] = useState("");
    const [log, setLog] = useState<{text: string, type: string, isRawHtml?: boolean}[]>([{text: Logger.system("CARDSTELS v1.8.5 SYSTEM READY. PROTECT THE KING!"), type: 'INFO', isRawHtml: true}]);
    const [player, setPlayer] = useState<PlayerStats>({ tower: START_TOWER, wall: START_WALL, king: START_KING, bricks: START_RESOURCE, prodBricks: START_PROD, crystals: START_RESOURCE, prodCrystals: START_PROD, weapons: START_RESOURCE, prodWeapons: START_PROD, burn: 0, shield: 0 });
    const [opponent, setOpponent] = useState<PlayerStats>({ tower: START_TOWER, wall: START_WALL, king: START_KING, bricks: START_RESOURCE, prodBricks: START_PROD, crystals: START_RESOURCE, prodCrystals: START_PROD, weapons: START_RESOURCE, prodWeapons: START_PROD, burn: 0, shield: 0 });
    const prevPlayer = usePrevious(player);
    const prevOpponent = usePrevious(opponent);
    const [deck, setDeck] = useState<CardType[]>([]);
    const [hand, setHand] = useState<CardType[]>([]);
    const [aiHand, setAiHand] = useState<CardType[]>([]);
    const [playerTurn, setPlayerTurn] = useState(true);
    const [floatingTexts, setFloatingTexts] = useState<any[]>([]);
    const [showCards, setShowCards] = useState(false);
    const [kingSelectionState, setKingSelectionState] = useState({ phase: 'IDLE', deck: [] as CardType[], drawn: [] as CardType[], shufflesLeft: 1 });
    const [playerKingCards, setPlayerKingCards] = useState<CardType[]>([]);
    const [opponentKingCards, setOpponentKingCards] = useState<CardType[]>([]);
    const [lootState, setLootState] = useState<any>({ active: false, card: null, phase: 'CHOICE', currentDeck: [] });
    const gameRef = useRef<HTMLDivElement>(null);
    const [cardPlayedInTurn, setCardPlayedInTurn] = useState(0);
    const [isInitialDealing, setIsInitialDealing] = useState(true);
    const [towerStage, setTowerStage] = useState(1);
    const [endlessStage, setEndlessStage] = useState(1);
    const [turnCounts, setTurnCounts] = useState({ p: 1, c: 0 });
    const [activeCard, setActiveCard] = useState<any>(null);
    const [screenShake, setScreenShake] = useState(false);
    const [damageFlash, setDamageFlash] = useState(false);
    const [particles, setParticles] = useState<any[]>([]);
    const [isSfxOn, setIsSfxOn] = useState(true);
    const [isMusicOn, setIsMusicOn] = useState(true);
    const [audioReady, setAudioReady] = useState(false);
    const [activeAnimations, setActiveAnimations] = useState<any[]>([]);
    const [isProcessingTurn, setIsProcessingTurn] = useState(false);
    const [isCardAnimating, setIsCardAnimating] = useState(false);
    const [dealingCards, setDealingCards] = useState<any[]>([]);
    const [isInsertingKingPowers, setIsInsertingKingPowers] = useState(false);
    const [lastDiscardedCard, setLastDiscardedCard] = useState<any>(null);
    const [destructionState, setDestructionState] = useState<string | null>(null);
    const [isKingDeckVisible, setIsKingDeckVisible] = useState(false);
    const [kingDeckDrawingState, setKingDeckDrawingState] = useState('IDLE');
    const [gameStats, setGameStats] = useState<GameStats>(initialGameStats);
    const [endlessCpuColor, setEndlessCpuColor] = useState<any>(null);
    const [levelIntroActive, setLevelIntroActive] = useState(false);
    const [saveStatus, setSaveStatus] = useState<any>({});
    const [overwriteSlot, setOverwriteSlot] = useState<number | null>(null);
    const [registryData, setRegistryData] = useState<any>({});
    const [menuView, setMenuView] = useState('NONE');
    const [hoveredKingCard, setHoveredKingCard] = useState<CardType | null>(null);
    const [discardInspectMode, setDiscardInspectMode] = useState(false);
    
    // --- PLAYER COLORS ---
    const [p1Color, setP1Color] = useState<PlayerColorProfile>(PLAYER_COLORS[0]); 
    const [p2Color, setP2Color] = useState<PlayerColorProfile>(PLAYER_COLORS[1]); 

    // --- GAME READY FLAG ---
    const [isGameReady, setIsGameReady] = useState(false);
    const [runTimeDisplay, setRunTimeDisplay] = useState("00:00");
    
    // Track last saved turn to prevent redundant saves
    const lastSavedTurnRef = useRef({ p: 0, c: 0 });
    const startTimeRef = useRef<number>(Date.now());

    const initRef = useRef(false);
    const dealingInProgressRef = useRef(false);
    const logEndRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const debrisRef = useRef<any[]>([]);

    const P1_LABEL = isMultiplayer ? "PLAYER 1" : "PLAYER";
    const P2_LABEL = isMultiplayer ? "PLAYER 2" : "CPU";

    // Dynamic classes based on P2 color
    const currentStageColor = p2Color;
    const cpuTurnTextClass = p2Color.text;
    const cpuPanelClass = p2Color.text;
    const cpuGlowClass = p2Color.glow || 'shadow-red-500/50';
    const cpuBgClass = p2Color.bg;

    // --- DYNAMIC MUSIC BPM ---
    useEffect(() => {
        if (gameState === 'PLAYING') {
            updateMusicTempoByHP(player, opponent);
        }
    }, [player, opponent, gameState]);

    const handleUserInteraction = useCallback(() => { resumeAudioContext(setAudioReady); }, []);

    // --- GAME SCALER ---
    const handleResize = useCallback(() => {
        if (!gameRef.current) return;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const scale = Math.min(windowWidth / BASE_WIDTH, windowHeight / BASE_HEIGHT);
        gameRef.current.style.transform = `scale(${scale})`;
        gameRef.current.style.left = `${(windowWidth - BASE_WIDTH * scale) / 2}px`;
        gameRef.current.style.top = `${((windowHeight - BASE_HEIGHT * scale) / 2) < 0 ? 0 : (windowHeight - BASE_HEIGHT * scale) / 2}px`;
    }, []);

    useEffect(() => {
        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleResize);
        handleResize();
        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleResize);
        };
    }, [handleResize]);

    const addLog = (msg: string, type = 'INFO', isRawHtml = false) => {
        let finalMsg = msg;
        if (msg.startsWith(`${P1_LABEL}:`)) {
            finalMsg = msg.replace(`${P1_LABEL}:`, `<span class="${p1Color.text} font-black drop-shadow-sm">${P1_LABEL}</span>:`);
        } else if (msg.startsWith(`${P2_LABEL}:`)) {
            finalMsg = msg.replace(`${P2_LABEL}:`, `<span class="${p2Color.text} font-black drop-shadow-sm">${P2_LABEL}</span>:`);
        }
        setLog(prev => [...prev, { text: finalMsg, type, isRawHtml }]);
    };

    useEffect(() => { 
        if (logEndRef.current && logEndRef.current.parentElement) {
            logEndRef.current.parentElement.scrollTop = logEndRef.current.parentElement.scrollHeight;
        }
    }, [log]);

    useEffect(() => {
        if (menuView === 'SAVE') {
            setRegistryData(getSaveRegistry());
        }
    }, [menuView]);

    const addFloatingText = (x: number, y: number, val: number, type: string, key: string | null = null, isDown = false) => {
        const id = Date.now().toString() + Math.random();
        setFloatingTexts(prev => [...prev, { id, x: x + (Math.random() - 0.5) * 80, y: y + (Math.random() - 0.5) * 50, val, type, key, variant: Math.floor(Math.random() * 3) + 1, isDown }]);
        setTimeout(() => setFloatingTexts(prev => prev.filter(t => t.id !== id)), 2500);
    };

    const updateGameStats = useCallback((playerKey: string, category: string, amount: number) => {
        if (amount <= 0) return;
        setGameStats((prev: any) => { const next = { ...prev }; next[playerKey][category] += amount; return next; });
    }, []);

    const showPlayedCard = (card: CardType, who: string) => { setActiveCard({ card, playedBy: who, isKing: card.isKing }); playSFX('play_card'); if (who === 'player' || isMultiplayer) setTimeout(() => setActiveCard(null), 1000); };
    const triggerAnimation = (type: string, direction: string) => { const id = Date.now(); setActiveAnimations(prev => [...prev, { id, type, direction }]); setTimeout(() => setActiveAnimations(prev => prev.filter(a => a.id !== id)), type === 'PROJECTILE' ? 600 : 1000); };
    
    // UPDATED PARTICLE SPAWNER WITH PHYSICS FOR GLASS
    const spawnParticles = (x: number, y: number, scale: number, type: string) => {
        if (type === 'GLASS') {
            if (debrisRef.current) {
                for(let i=0; i<40; i++) {
                    debrisRef.current.push({
                        x: x + (Math.random() - 0.5) * 20,
                        y: y + (Math.random() - 0.5) * 20,
                        vx: (Math.random() - 0.5) * 25,
                        vy: (Math.random() * -20) - 5,
                        grav: 0.8,
                        size: Math.random() * 8 + 4,
                        color: `rgba(34, 211, 238, ${Math.random() * 0.5 + 0.5})`,
                        life: 1.5,
                        rot: Math.random() * 360,
                        rotSpeed: (Math.random() - 0.5) * 20,
                        type: 'SHARD'
                    });
                }
            }
            return;
        }

        const idBase = Date.now().toString() + Math.random().toString();
        const count = 10;
        const newPs: any[] = [];
        for(let i=0; i<count; i++) {
            newPs.push({
                id: idBase + i,
                x: x + (Math.random() - 0.5) * 40, 
                y: y + (Math.random() - 0.5) * 40,
                type: type,
                color: type === 'SPARK' ? '#fbbf24' : '#ffffff',
                tx: `${(Math.random() - 0.5) * 200}px`,
                ty: `${(Math.random() * 200) + 100}px`, 
                rot: `${Math.random() * 360}deg` 
            });
        }
        setParticles(prev => [...prev, ...newPs]);
        setTimeout(() => setParticles(prev => prev.filter(p => !p.id.startsWith(idBase))), 800);
    };

    const spawnSmoke = (x: number, y: number, scale: number) => {
        const id = Date.now().toString() + Math.random().toString();
        setParticles(prev => [...prev, {
            id,
            x: x + (Math.random() * 40 - 20),
            y: y + (Math.random() * 40 - 20),
            type: 'SMOKE'
        }]);
        setTimeout(() => setParticles(prev => prev.filter(p => p.id !== id)), 800);
    };

    const handleDealAnimationEnd = useCallback((uniqueId: string) => { setDealingCards(prev => prev.filter(c => c.card.uniqueId !== uniqueId)); }, []);
    const returnCardToBottom = (card: CardType, isPlayer = true, action = 'PLAY') => { setLastDiscardedCard({ card, action }); if (action === 'DISCARD') playSFX('play_card'); setDeck(prevDeck => [...prevDeck, { ...card, uniqueId: Math.random().toString() }]); };
    const playDamageSoundIfAny = (prevStats: PlayerStats, newStats: PlayerStats) => { if (newStats.king < prevStats.king) playSFX('hit_king'); else if (newStats.tower < prevStats.tower) playSFX('hit_tower'); else if (newStats.wall < prevStats.wall) playSFX('hit_wall'); }

    useEffect(() => {
        if (initRef.current) return; 
        initRef.current = true;

        const performInit = async () => {
            const isLoadMode = searchParams.get('mode') === 'load';
            const isNewGameTrigger = sessionStorage.getItem('cardstels_new_game') === 'true';
            sessionStorage.removeItem('cardstels_new_game'); 

            const p1Id = parseInt(searchParams.get('p1') || '0');
            const p2Id = parseInt(searchParams.get('p2') || '-1');

            if (p1Id >= 0 && p1Id < PLAYER_COLORS.length) setP1Color(PLAYER_COLORS[p1Id]);

            if (isMultiplayer && p2Id >= 0 && p2Id < PLAYER_COLORS.length) {
                setP2Color(PLAYER_COLORS[p2Id]);
            } else if (isTowerMode) {
                setP2Color(TOWER_STAGES[0].color);
            } else {
                let randomId = Math.floor(Math.random() * PLAYER_COLORS.length);
                while (randomId === p1Id) randomId = Math.floor(Math.random() * PLAYER_COLORS.length);
                setP2Color(PLAYER_COLORS[randomId]);
            }

            let restoreState: SaveState | null = null;

            if (isLoadMode) {
                const slotId = localStorage.getItem('cardstels_active_load_slot');
                if (slotId) restoreState = loadGameFromSlot(slotId);
            } 
            else if (!isNewGameTrigger) {
                restoreState = loadGameFromSlot('autosave');
            }

            if (restoreState) {
                setPlayer(restoreState.player); setOpponent(restoreState.opponent); setDeck(restoreState.deck); 
                setHand(restoreState.hand); setAiHand(restoreState.aiHand);
                setTurnCounts(restoreState.turnCounts); setPlayerTurn(restoreState.playerTurn); 
                setCardPlayedInTurn(restoreState.cardPlayedInTurn); setTowerStage(restoreState.towerStage); 
                setEndlessStage(restoreState.endlessStage); 
                
                // RESTORE STATS & TIME
                setGameStats(restoreState.gameStats || initialGameStats); 
                if (restoreState.gameStats && restoreState.gameStats.startTime) {
                    startTimeRef.current = restoreState.gameStats.startTime;
                } else {
                    startTimeRef.current = Date.now();
                }

                setEndlessCpuColor(restoreState.endlessCpuColor);
                if (restoreState.lastDiscardedCard) setLastDiscardedCard(restoreState.lastDiscardedCard);
                setPlayerKingCards(restoreState.playerKingCards || []); setOpponentKingCards(restoreState.opponentKingCards || []);
                
                if (restoreState.p1Color) setP1Color(restoreState.p1Color);
                if (restoreState.p2Color) setP2Color(restoreState.p2Color);

                if (restoreState.isTowerMode !== undefined) setIsTowerMode(restoreState.isTowerMode);
                if (restoreState.isEndlessMode !== undefined) setIsEndlessMode(restoreState.isEndlessMode);
                if (restoreState.isMultiplayer !== undefined) setIsMultiplayer(restoreState.isMultiplayer);

                const savedKingState = restoreState.kingSelectionState || { phase: 'IDLE', deck: [], drawn: [], shufflesLeft: 0 };
                if (restoreState.gameState === 'PLAYING') {
                    setKingSelectionState({ ...savedKingState, phase: 'IDLE' });
                } else {
                    setKingSelectionState(savedKingState);
                }

                if (restoreState.lootState) setLootState(restoreState.lootState);
                
                setIsInitialDealing(restoreState.isInitialDealing || false); 
                setLevelIntroActive(restoreState.levelIntroActive || false); 
                setDestructionState(restoreState.destructionState || null);
                setGameState(restoreState.gameState || 'PLAYING'); 
                
                lastSavedTurnRef.current = restoreState.turnCounts;

                setIsGameReady(true); 
                
                addLog(Logger.system(isLoadMode ? "GAME LOADED." : "GAME RESTORED (AUTOSAVE)."), "INFO", true);
                
                if (isLoadMode) localStorage.removeItem('cardstels_active_load_slot'); 
                setRegistryData(getSaveRegistry());
            } else {
                localStorage.removeItem('cardstels_v180_slot_autosave');
                setIsGameReady(false); 
                startTimeRef.current = Date.now();
                setGameStats(prev => ({...prev, startTime: Date.now()}));
                
                const initialDeck = generateDeck(); 
                setDeck(initialDeck); 
                
                await runKingSelectionSequence();
                setRegistryData(getSaveRegistry()); 
            }
        };

        performInit();
    }, []);

    const persistAutosave = useCallback(() => {
        if (!isGameReady) return; 

        const currentState: SaveState = { 
            player, opponent, deck, hand, aiHand, turnCounts, playerTurn, cardPlayedInTurn, gameState, 
            isTowerMode, isEndlessMode, isMultiplayer, towerStage, endlessStage, gameStats, endlessCpuColor, 
            lastDiscardedCard, playerKingCards, opponentKingCards, 
            timestamp: Date.now(),
            kingSelectionState, isInitialDealing, levelIntroActive, destructionState, lootState,
            p1Color, p2Color
        };
        saveGameToSlot('autosave', currentState);
    }, [player, opponent, deck, hand, aiHand, turnCounts, playerTurn, cardPlayedInTurn, gameState, isTowerMode, isEndlessMode, isMultiplayer, towerStage, endlessStage, gameStats, endlessCpuColor, lastDiscardedCard, playerKingCards, opponentKingCards, kingSelectionState, isInitialDealing, levelIntroActive, destructionState, lootState, isGameReady, p1Color, p2Color]);

    useEffect(() => {
        if (!isGameReady || gameState !== 'PLAYING') return;
        const turnChanged = turnCounts.p !== lastSavedTurnRef.current.p || turnCounts.c !== lastSavedTurnRef.current.c;
        if (turnChanged && !isProcessingTurn && !isCardAnimating && !isInitialDealing && !levelIntroActive) {
            persistAutosave();
            lastSavedTurnRef.current = turnCounts;
        }
    }, [turnCounts, isProcessingTurn, isCardAnimating, isInitialDealing, levelIntroActive, gameState, isGameReady, persistAutosave]);

    // --- GAME LOGIC ---

    const runKingSelectionSequence = async () => { if (!isEndlessMode && !isTowerMode) { setPlayerKingCards([]); setOpponentKingCards([]); } else if ((isEndlessMode && endlessStage === 1) || (isTowerMode && towerStage === 1)) { setPlayerKingCards([]); setOpponentKingCards([]); } if (playerKingCards.length === 0) { const availableCards = getAvailableKingCards([], [], true); const initialDeck = shuffleKingDeck(availableCards); setKingSelectionState({ phase: 'SHUFFLING_P1', deck: initialDeck, drawn: [], shufflesLeft: 1 }); playSFX('button_click'); await delay(1500); setKingSelectionState(prev => ({ ...prev, phase: 'P1_CHOICE' })); } else { setKingSelectionState({ phase: 'IDLE', deck: [], drawn: [], shufflesLeft: 0 }); } };
    const handleKingShuffle = async () => { if (kingSelectionState.shufflesLeft <= 0) return; playSFX('button_click'); const shufflePhase = kingSelectionState.phase === 'P1_CHOICE' ? 'SHUFFLING_P1' : 'SHUFFLING_P2'; setKingSelectionState(prev => ({ ...prev, phase: shufflePhase, shufflesLeft: prev.shufflesLeft - 1 })); await delay(1000); const newDeck = shuffleKingDeck(kingSelectionState.deck); setKingSelectionState(prev => ({ ...prev, deck: newDeck, phase: prev.phase === 'SHUFFLING_P1' ? 'P1_CHOICE' : 'P2_CHOICE' })); };
    const handleKingDraw = () => { playSFX('play_card'); const drawCount = 3; if (kingSelectionState.deck.length < drawCount) return; const drawnCards = kingSelectionState.deck.slice(0, drawCount); const remainingDeck = kingSelectionState.deck.slice(drawCount); const nextPhase = kingSelectionState.phase === 'P1_CHOICE' ? 'P1_VIEW' : 'P2_VIEW'; setKingSelectionState(prev => ({ ...prev, deck: remainingDeck, drawn: drawnCards, phase: nextPhase })); };
    const handleKingSelect = async (card: CardType) => { 
        if (isProcessingTurn) return; 
        setIsProcessingTurn(true); 
        
        if (kingSelectionState.phase === 'P1_VIEW') { 
            setPlayerKingCards([card]); 
            const unselected = kingSelectionState.drawn.filter(c => c.id !== card.id); 
            const deckRest = [...kingSelectionState.deck, ...unselected]; 
            setKingSelectionState(prev => ({ ...prev, drawn: [] })); 
            showPlayedCard({ ...card, isKing: true }, 'player'); 
            await delay(1200); 
            setActiveCard(null); 
            
            if (isMultiplayer) { 
                const shuffledForP2 = shuffleKingDeck(deckRest); 
                setKingSelectionState({ phase: 'P2_CHOICE', deck: shuffledForP2, drawn: [], shufflesLeft: 1 }); 
                setIsProcessingTurn(false); 
            } else { 
                setKingSelectionState(prev => ({ ...prev, phase: 'P2_CHOICE' })); 
                await delay(2000); 
                const cpuCard = assignUniqueCpuKing([card], []); 
                setOpponentKingCards(cpuCard);
    
                setIsKingDeckVisible(true);
                setKingDeckDrawingState('DRAWING_P2');
                await delay(700);
                setKingDeckDrawingState('IDLE');
                setIsKingDeckVisible(false);
    
                showPlayedCard({ ...cpuCard[0], isKing: true }, 'opponent'); 
                await delay(1200); 
                setActiveCard(null); 
                setDealingCards([]); 
                setKingSelectionState({ phase: 'IDLE', deck: [], drawn: [], shufflesLeft: 1 }); 
                setIsProcessingTurn(false); 
            } 
        } else if (kingSelectionState.phase === 'P2_VIEW') { 
            setOpponentKingCards([card]); 
            setKingSelectionState(prev => ({ ...prev, drawn: [] })); 
            showPlayedCard({ ...card, isKing: true }, 'opponent'); 
            await delay(1200); 
            setActiveCard(null); 
            setDealingCards([]); 
            setKingSelectionState({ phase: 'IDLE', deck: [], drawn: [], shufflesLeft: 1 }); 
            setIsProcessingTurn(false); 
            dealingInProgressRef.current = false; 
        } 
    };
    
    const animateTowerStageIntro = useCallback(async (stageIdx: number, isEndless = false, forcedOTarget: any = null, forcedPTarget: any = null) => {
        setLevelIntroActive(true); setIsProcessingTurn(true);
        const steps = 25;
        for (let i = 0; i <= steps; i++) {
            const ratio = i / steps;
            setPlayer(prev => ({ ...prev, wall: Math.max(1, Math.floor(forcedPTarget.wall * ratio)), tower: Math.max(1, Math.floor(forcedPTarget.tower * ratio)), king: Math.max(1, Math.floor(forcedPTarget.king * ratio)) }));
            setOpponent(prev => ({ ...prev, wall: Math.max(1, Math.floor(forcedOTarget.wall * ratio)), tower: Math.max(1, Math.floor(forcedOTarget.tower * ratio)), king: Math.max(1, Math.floor(forcedOTarget.king * ratio)) }));
            await delay(25);
        }
        setPlayer(prev => ({ ...prev, ...forcedPTarget })); setOpponent(prev => ({ ...prev, ...forcedOTarget }));
        await delay(400); setLevelIntroActive(false); setIsProcessingTurn(false);
    }, []);

    const dealInitialHand = useCallback(async (initialDeck: CardType[]) => { 
        if (isGameReady) return; 
        const dealCount = MAX_HAND_SIZE; 
        let remainingDeck = [...initialDeck]; 
        const newPlayerHand: CardType[] = []; 
        const newAiHand: CardType[] = []; 
        const cardsToAnimate = []; 
        
        await delay(500); 
        for (let i = 0; i < dealCount; i++) { 
            if (remainingDeck.length === 0) break; 
            const pCard = remainingDeck.shift() as CardType;
            newPlayerHand.push(pCard); 
            cardsToAnimate.push({ card: pCard, player: 'player', delay: i * 300 }); 
            if (remainingDeck.length === 0) break; 
            const aCard = remainingDeck.shift() as CardType;
            newAiHand.push(aCard); 
            cardsToAnimate.push({ card: aCard, player: 'opponent', delay: i * 300 + 150 }); 
        } 
        
        setDealingCards(cardsToAnimate); 
        playSFX('bow'); 
        const lastDelay = cardsToAnimate.length > 0 ? cardsToAnimate[cardsToAnimate.length - 1].delay : 0; 
        
        await delay(lastDelay + 600); 
        setHand(newPlayerHand as any); 
        setAiHand(newAiHand as any); 
        setDealingCards([]); 
        
        setIsInsertingKingPowers(true); 
        playSFX('magic'); 
        
        let kingPowerDef = CARDS_DB_BASE.find(c => c.id === 42); 
        if (!kingPowerDef) kingPowerDef = { id: 42, name: "KING POWER", type: 2, costB: 0, costW: 0, costC: 0, desc: "UNLOCK A PASSIVE BONUS", img: "👑", count: 1 }; 
        for(let k=0; k<4; k++) remainingDeck.push({ ...kingPowerDef, uniqueId: Math.random().toString(36).substr(2, 9) }); 
        
        await delay(1500); 
        playSFX('button_click'); 
        for (let i = remainingDeck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [remainingDeck[i], remainingDeck[j]] = [remainingDeck[j], remainingDeck[i]]; } 
        
        await delay(2500); 
        setDeck(remainingDeck); 
        setIsInsertingKingPowers(false); 
        
        setIsInitialDealing(false); 
        
        lastSavedTurnRef.current = { p: 1, c: 0 };
        setIsGameReady(true); 

        setPlayer(p => { 
            setOpponent(o => {
                saveGameToSlot('autosave', {
                    player: p, opponent: o, deck: remainingDeck, hand: newPlayerHand, aiHand: newAiHand,
                    turnCounts: { p: 1, c: 0 }, playerTurn: true, cardPlayedInTurn: 0, gameState: 'PLAYING',
                    isTowerMode, isEndlessMode, isMultiplayer, towerStage, endlessStage, gameStats: initialGameStats,
                    endlessCpuColor: null, lastDiscardedCard: null, playerKingCards, opponentKingCards,
                    timestamp: Date.now(), kingSelectionState: { phase: 'IDLE', deck: [], drawn: [], shufflesLeft: 0 },
                    isInitialDealing: false, levelIntroActive: false, destructionState: null, lootState: { active: false, card: null, phase: 'CHOICE', currentDeck: [] },
                    p1Color, p2Color
                });
                return o;
            });
            return p;
        });

        addLog(Logger.kingPowerFound("GAME START"), "INFO", true); 
        addLog(Logger.turnStart(P1_LABEL, 1), "INFO", true); 
    }, [P1_LABEL, isTowerMode, isEndlessMode, endlessStage, opponentKingCards, playerKingCards, isGameReady, p1Color, p2Color]);

    const handleLootAccept = () => { setLootState({ active: false, card: null, phase: 'IDLE', currentDeck: [] }); if (playerKingCards.length < MAX_ENDLESS_KINGS) { setPlayerKingCards(prev => [...prev, lootState.card]); proceedNextStage(); } else { setLootState({ active: true, card: lootState.card, phase: 'REPLACE', currentDeck: playerKingCards }); } };
    const handleLootDecline = () => { setLootState({ active: false, card: null, phase: 'IDLE', currentDeck: [] }); proceedNextStage(); };
    const handleLootReplace = (cardToDiscard: any) => { setPlayerKingCards(prev => [...prev.filter(c => c.id !== cardToDiscard.id), lootState.card]); setLootState({ active: false, card: null, phase: 'IDLE', currentDeck: [] }); proceedNextStage(); };
    const handleBackToPick = () => { playSFX('button_click'); setLootState((prev: any) => ({ ...prev, phase: 'PICK_ENEMY' })); };
    const handleLootTargetSelect = (selectedCard: any) => { if (playerKingCards.length < MAX_ENDLESS_KINGS) { setPlayerKingCards(prev => [...prev, selectedCard]); setLootState({ active: false, card: null, phase: 'IDLE', currentDeck: [] }); proceedNextStage(); } else { setLootState((prev: any) => ({ ...prev, card: selectedCard, phase: 'REPLACE', currentDeck: playerKingCards })); playSFX('button_click'); } };
    
    const proceedNextStage = () => { 
        setGameState('TRANSITION'); 
        setLootState({ active: false, card: null, phase: 'IDLE', currentDeck: [] }); 
        const currentStageNum = isTowerMode ? towerStage : endlessStage; 
        const nextStageNum = currentStageNum + 1; 
        
        setTimeout(() => { 
            if (isEndlessMode) { 
                setEndlessStage(prev => prev + 1); 
                const randColor = PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]; 
                setP2Color(randColor); 
                let startRes = START_RESOURCE; 
                if (activeKingBuff(playerKingCards, 'k_hoard')) startRes += 30; 
                const nextPlayer = { ...player, bricks: startRes, weapons: startRes, crystals: startRes, burn: 0, shield: 0 }; 
                const prevCpu = opponent; 
                let baseWall = prevCpu.wall < 50 ? Math.min(50, prevCpu.wall + 5) : prevCpu.wall; 
                let baseTower = prevCpu.tower < 50 ? Math.min(50, prevCpu.tower + 2) : prevCpu.tower; 
                let baseKing = prevCpu.king < 50 ? Math.min(50, prevCpu.king + 1) : prevCpu.king; 
                let extraWall = baseWall + (3 * nextStageNum); 
                let extraTower = baseTower + (2 * nextStageNum); 
                const calcProd = (pVal: number) => Math.max(3, Math.floor(pVal * (0.8 + Math.random() * 0.4))); 
                setOpponent({ ...prevCpu, wall: Math.min(150, extraWall), tower: Math.min(100, extraTower), king: Math.min(60, baseKing), bricks: START_RESOURCE, weapons: START_RESOURCE, crystals: START_RESOURCE, prodBricks: calcProd(player.prodBricks), prodWeapons: calcProd(player.prodWeapons), prodCrystals: calcProd(player.prodCrystals), burn: 0, shield: 0 }); 
                setPlayer(nextPlayer); 
                addLog(Logger.stageStart(nextStageNum, true), "INFO", true); 
            } else if (isTowerMode) { 
                setTowerStage(prev => prev + 1); 
                const stageIdx = Math.min(TOWER_STAGES.length - 1, nextStageNum - 1); 
                const stageData = TOWER_STAGES[stageIdx]; 
                setP2Color(stageData.color); 
                let pStart = { tower: START_TOWER, wall: START_WALL, king: START_KING, bricks: START_RESOURCE, prodBricks: START_PROD, crystals: START_RESOURCE, prodCrystals: START_PROD, weapons: START_RESOURCE, prodWeapons: START_PROD, burn: 0, shield: 0 }; 
                if (playerKingCards.length > 0) { playerKingCards.forEach(c => { if (c.id === 'k_big') pStart.king = 60; if (c.id === 'k_son') { pStart.wall = 40; pStart.tower = 40; pStart.king = 20; } if (c.id === 'k_bunk') { pStart.wall = 60; pStart.tower = 10; pStart.king = 1; } if (c.id === 'k_hoard') { pStart.bricks += 30; pStart.weapons += 30; pStart.crystals += 30; } if (c.id === 'k_ind') { pStart.bricks = 10; pStart.weapons = 10; pStart.crystals = 10; pStart.prodBricks += 1; pStart.prodWeapons += 1; pStart.prodCrystals += 1; } }); } 
                setPlayer(pStart); 
                setOpponent({ ...stageData, bricks: START_RESOURCE, prodBricks: START_PROD, crystals: START_RESOURCE, prodCrystals: START_PROD, weapons: START_RESOURCE, prodWeapons: START_PROD, burn: 0, shield: 0 }); 
                addLog(Logger.stageStart(nextStageNum, false), "INFO", true); 
            } 
            setLastDiscardedCard(null); 
            setCardPlayedInTurn(0); 
            setTurnCounts({p:1, c:0}); 
            setPlayerTurn(true); 
            setHand([]); 
            setAiHand([]); 
            const newDeck = generateDeck(); 
            setDeck(newDeck); 
            setGameState('PLAYING'); 
            setIsInitialDealing(true);
            setIsGameReady(false); 
            setDealingCards([]); 
            setKingSelectionState({ phase: 'IDLE', deck: [], drawn: [], shufflesLeft: 0 }); 
            setOpponentKingCards([]); 
            const newCpuCard = assignUniqueCpuKing(playerKingCards, []); 
            setOpponentKingCards(newCpuCard); 
            dealInitialHand(newDeck); 
        }, 2000); 
    };

    useEffect(() => {
        if (isGameReady) return;
        if (kingSelectionState.phase === 'IDLE' && playerKingCards.length > 0 && isInitialDealing && gameState === 'PLAYING') {
            if (dealingInProgressRef.current) return; 
            dealingInProgressRef.current = true;
            const run = async () => {
                let pTarget = { ...player, wall: START_WALL, tower: START_TOWER, king: START_KING };
                let oTarget = { ...opponent };
                
                // ROGUE TOWER LOGIC
                if (isEndlessMode) { 
                    oTarget.wall = Math.min(150, 25 + endlessStage * 3); 
                    oTarget.tower = Math.min(100, 10 + endlessStage * 2); 
                    oTarget.king = Math.min(60, 5 + Math.floor(endlessStage * 1.5)); 
                } else if (isTowerMode) { 
                    const s = TOWER_STAGES[towerStage - 1]; 
                    oTarget.wall = s.wall; oTarget.tower = s.tower; oTarget.king = s.king; 
                    
                    // --- ROGUE TOWER PROTECTION SHIELD (STAGE 5+) ---
                    if (towerStage >= 5) {
                        oTarget.shield = MAX_SHIELD;
                        addLog(Logger.special(P2_LABEL, "HAS ACTIVATED SHIELD PROTECTION!"), "WARNING", true);
                    }
                } else { 
                    oTarget.wall = 25; oTarget.tower = 10; oTarget.king = 5; 
                }

                const applyBonus = (kings: any[], target: any) => { kings.forEach(k => { if (k.id === 'k_son') { target.wall = 40; target.tower = 40; target.king = 20; } if (k.id === 'k_big') { target.king = 60; } if (k.id === 'k_bunk') { target.wall = 60; target.tower = 10; target.king = 1; } if (k.id === 'k_hoard') { target.bricks += 30; target.weapons += 30; target.crystals += 30; } if (k.id === 'k_ind') { target.prodBricks += 1; target.prodWeapons += 1; target.prodCrystals += 1; target.bricks = 10; target.weapons = 10; target.crystals = 10; } }); };
                applyBonus(playerKingCards, pTarget); if (!isEndlessMode) applyBonus(opponentKingCards, oTarget);
                await animateTowerStageIntro(towerStage, isEndlessMode, oTarget, pTarget); await delay(200);
                setOpponent(prev => ({ ...prev, king: oTarget.king, tower: oTarget.tower, wall: oTarget.wall, shield: oTarget.shield })); 
                setPlayer(prev => ({ ...prev, king: pTarget.king, tower: pTarget.tower, wall: pTarget.wall }));
                let currentDeck = (deck && deck.length > 0) ? deck : generateDeck(); await dealInitialHand(currentDeck); dealingInProgressRef.current = false;
            }; run();
        }
    }, [kingSelectionState.phase, playerKingCards, opponentKingCards, isInitialDealing, gameState, isGameReady]);

    useEffect(() => { 
        if (gameState !== 'PLAYING') return; 
        let win = false; let lose = false; let reason = ""; 
        if (player.king >= 100) { win = true; reason = `${P1_LABEL} KING HAS REACHED MAXIMUM POWER!`; } else if (player.tower >= 150) { win = true; reason = `${P1_LABEL} TOWER REACHED MAXIMUM HEIGHT!`; } else if (player.wall >= 200) { win = true; reason = `${P1_LABEL} WALL PIERCES THE HEAVENS!`; } else if (opponent.king <= 0) { win = true; reason = `THE ${P2_LABEL} KING HAS BEEN DESTROYED!`; } if (opponent.king >= 100) { lose = true; reason = `THE ${P2_LABEL} KING HAS REACHED MAXIMUM POWER!`; } else if (opponent.tower >= 150) { lose = true; reason = `THE ${P2_LABEL} TOWER REACHED MAXIMUM HEIGHT!`; } else if (opponent.wall >= 200) { lose = true; reason = `THE ${P2_LABEL} WALL PIERCES THE HEAVENS!`; } else if (player.king <= 0) { lose = true; reason = `${P1_LABEL} KING HAS FALLEN!`; } 
        
        if (win || lose) {
            // STOP EVERYTHING
            setIsProcessingTurn(false);
            setIsCardAnimating(false);
            setDealingCards([]);
            
            const endTime = Date.now();
            const elapsed = endTime - startTimeRef.current;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            setRunTimeDisplay(timeStr);
        }

        if (win) { 
            if (isTowerMode && towerStage >= 8) { 
                setGameState('WON'); setEndGameReason("YOU HAVE CONQUERED THE ROGUE TOWER!"); playSFX('victory'); setDestructionState('opponent'); return; 
            } 
            if (isEndlessMode || (isTowerMode && towerStage < 8)) { 
                if (opponentKingCards.length > 0) { if (opponentKingCards.length > 1) setLootState({ active: true, card: null, enemyCards: opponentKingCards, phase: 'PICK_ENEMY', currentDeck: [] }); else setLootState({ active: true, card: opponentKingCards[0], phase: 'CHOICE', currentDeck: [] }); playSFX('victory'); setGameState('LOOTING'); } else { proceedNextStage(); } return; 
            } 
            setGameState('ENDING'); setEndGameReason(reason); playSFX('victory'); setDestructionState('opponent'); setTimeout(() => setGameState('WON'), 3000); 
        } else if (lose) { 
            setGameState('ENDING'); let loseMsg = reason; if (isTowerMode) loseMsg = `GAME OVER AT STAGE ${towerStage}`; if (isEndlessMode) loseMsg = `GAME OVER AT ENDLESS STAGE ${endlessStage}`; setEndGameReason(loseMsg); playSFX('defeat'); setDestructionState('player'); setTimeout(() => setGameState('LOST'), 3000); 
        } 
    }, [player, opponent, gameState, P1_LABEL, P2_LABEL, isTowerMode, towerStage, dealInitialHand, animateTowerStageIntro, isEndlessMode, endlessStage, opponentKingCards]);
    
    const manualDrawCard = async (isPlayer: boolean) => { 
        if (gameState !== 'PLAYING') return;
        const currentDeck = [...deck]; if (currentDeck.length === 0) return; let topCard = currentDeck[0]; 
        while (topCard && topCard.id === 42) { 
            if (gameState !== 'PLAYING') return; // Break if game ends during loop
            currentDeck.shift(); setDeck([...currentDeck]); playSFX('magic'); 
            showPlayedCard({...topCard, isKing: true}, isPlayer ? 'player' : 'opponent'); 
            addLog(Logger.kingPowerFound(isPlayer ? P1_LABEL : P2_LABEL), 'INFO', true); 
            await delay(1500); setActiveCard(null); await triggerKingPowerSequence(isPlayer); 
            if (currentDeck.length === 0) { topCard = null as any; break; } topCard = currentDeck[0]; 
        } 
        if (!topCard) return; const activeHand = isPlayer ? hand : aiHand; if (activeHand.length >= MAX_HAND_SIZE) return; const cardForHand = { ...topCard, uniqueId: Math.random().toString(36).substr(2, 9) }; const stats = isPlayer ? player : opponent; const setStats = isPlayer ? setPlayer : setOpponent; 
        if (stats.madnessActive) { if (cardForHand.type !== 4) { cardForHand.isMadness = true; setStats(prev => ({ ...prev, madnessActive: false })); } } 
        setDealingCards(prev => [...prev, { card: cardForHand, player: isPlayer ? 'player' : 'opponent', isReturning: false, delay: 0 }]); playSFX('play_card'); await delay(500); currentDeck.shift(); setDeck(currentDeck); if (isPlayer) setHand(prev => [...prev, cardForHand]); else setAiHand(prev => [...prev, cardForHand]); 
    };
    
    const triggerKingPowerSequence = async (isPlayer: boolean) => { 
        if (gameState !== 'PLAYING') return;
        const activeLabel = isPlayer ? P1_LABEL : P2_LABEL; 
        const opponentLabel = isPlayer ? P2_LABEL : P1_LABEL; 
        const logType = isPlayer ? 'PLAYER' : 'OPPONENT'; 
        
        const availablePool = getAvailableKingCards(playerKingCards, opponentKingCards, false); 
        for (let i = availablePool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [availablePool[i], availablePool[j]] = [availablePool[j], availablePool[i]]; } 
        if (availablePool.length < 2) { addLog(Logger.warning("NO MORE KING CARDS AVAILABLE! POWER FIZZLES."), "WARNING", true); return; } 
        const cardForActive = availablePool[0]; 
        const cardForOther = availablePool[1]; 
        
        setIsKingDeckVisible(true); 
        setKingDeckDrawingState('IDLE'); 
        await delay(600); 
        
        setKingDeckDrawingState(isPlayer ? 'DRAWING_P1' : 'DRAWING_P2'); 
        playSFX('play_card'); 
        await delay(800); 
        setKingDeckDrawingState('IDLE'); 
        
        playSFX('buff'); 
        showPlayedCard({ ...cardForActive, isKing: true }, isPlayer ? 'player' : 'opponent'); 
        addLog(Logger.kingPowerDraw(activeLabel, cardForActive.name), logType, true); 
        if (isPlayer) setPlayerKingCards(prev => [...prev, cardForActive]); else setOpponentKingCards(prev => [...prev, cardForActive]); 
        
        await delay(2500); 
        setActiveCard(null); 
        await delay(300); 
        
        setKingDeckDrawingState(isPlayer ? 'DRAWING_P2' : 'DRAWING_P1'); 
        playSFX('play_card'); 
        await delay(800); 
        setKingDeckDrawingState('IDLE'); 
        
        setIsKingDeckVisible(false); 
        
        playSFX('buff'); 
        showPlayedCard({ ...cardForOther, isKing: true }, isPlayer ? 'opponent' : 'player'); 
        addLog(Logger.kingPowerDraw(opponentLabel, cardForOther.name), isPlayer ? 'OPPONENT' : 'PLAYER', true); 
        if (isPlayer) setOpponentKingCards(prev => [...prev, cardForOther]); else setPlayerKingCards(prev => [...prev, cardForOther]); 
        
        await delay(2500); 
        setActiveCard(null); 
        await delay(300); 
    };

    const triggerArcherDamage = async (source: PlayerStats, target: PlayerStats, direction: string, setTargetStats: any, addLogFunc: any, kingCards: any[]) => {
         if (source.wall < 50) return;
         let damage = Math.min(5, Math.floor((source.wall - 40) / 10));
         if (kingCards && activeKingBuff(kingCards, 'k_wsnip')) damage = 5;

         playSFX('bow');
         triggerAnimation('ARROW_LOB', direction);
         await delay(800);

         const updateStats = (prev: PlayerStats) => {
             // FIX: Shield fully blocks wall archer
             if (prev.shield > 0) {
                 playSFX('hit_wall'); // Hit sound but block
                 const targetName = direction === 'RIGHT' ? P2_LABEL : P1_LABEL;
                 const logType = direction === 'RIGHT' ? 'OPPONENT' : 'PLAYER';
                 addLogFunc(Logger.special(targetName, "SHIELD BLOCKED ARCHER!"), logType, true);
                 return prev;
             }

             const hadShield = prev.shield > 0;
             let newStats = calculateDamage(prev, damage);
             const hasShield = newStats.shield > 0;

             if (hadShield && !hasShield) {
                 spawnParticles(direction === 'RIGHT' ? window.innerWidth * 0.8 : window.innerWidth * 0.2, window.innerHeight * 0.5, 1, 'GLASS');
                 playSFX('hit_wall'); 
                 addLogFunc(Logger.special(direction === 'RIGHT' ? P2_LABEL : P1_LABEL, "SHIELD SHATTERED!"), "WARNING", true);
             }

             playDamageSoundIfAny(prev, newStats);
             
             const diffLog = Logger.diff(prev, newStats, direction === 'LEFT'); 
             const targetName = direction === 'RIGHT' ? P2_LABEL : P1_LABEL;
             const logType = direction === 'RIGHT' ? 'OPPONENT' : 'PLAYER';
             
             if (diffLog) addLogFunc(`${targetName}: ${diffLog}`, logType, true);
             
             let dealt = 0;
             if (newStats.king < prev.king) dealt += (prev.king - newStats.king);
             if (newStats.tower < prev.tower) dealt += (prev.tower - newStats.tower);
             if (newStats.wall < prev.wall) dealt += (prev.wall - newStats.wall);
             
             if (dealt > 0) {
                 if (direction === 'RIGHT') { updateGameStats('p1', 'dmg', dealt); updateGameStats('p2', 'taken', dealt); }
                 else { updateGameStats('p2', 'dmg', dealt); updateGameStats('p1', 'taken', dealt); }
             }
             
             return { ...newStats, wall: Math.min(MAX_WALL, newStats.wall), tower: Math.min(WIN_TOWER, newStats.tower), king: Math.min(WIN_KING_MAX, newStats.king) };
         };
         
         if (direction === 'RIGHT') setTargetStats(updateStats); else setPlayer(updateStats);
         await delay(200);
    };

    const handleCardPlay = async (card: CardType) => {
        handleUserInteraction();
        if (isProcessingTurn || isCardAnimating || levelIntroActive || kingSelectionState.phase !== 'IDLE' || gameState !== 'PLAYING') return;
        if (!isMultiplayer && !playerTurn) return; 

        const isP1 = playerTurn;
        const activeKingCards = isP1 ? playerKingCards : opponentKingCards;
        if (!canAfford(card, isP1 ? player : opponent, activeKingCards)) return;

        setIsCardAnimating(true); 
        setCardPlayedInTurn(1); 
        setShowCards(false);

        const context: GameContext = {
            me: isP1 ? player : opponent,
            opponent: isP1 ? opponent : player,
            setMe: isP1 ? setPlayer : setOpponent,
            setOpponent: isP1 ? setOpponent : setPlayer,
            myHand: isP1 ? hand : aiHand,
            setMyHand: isP1 ? setHand : setAiHand,
            myKingCards: isP1 ? playerKingCards : opponentKingCards,
            opponentKingCards: isP1 ? opponentKingCards : playerKingCards,
            addLog,
            playSFX,
            triggerAnimation,
            spawnParticles,
            updateStats: updateGameStats,
            triggerKingPowerSequence,
            returnCardToBottom,
            isP1,
            labels: { p1: P1_LABEL, p2: P2_LABEL },
            setDeck 
        };

        showPlayedCard(card, isP1 ? 'player' : 'opponent');
        await delay(1200);
        setActiveCard(null);

        const { costB, costW, costC } = getEffectiveCardCost(card, activeKingCards);
        const costPaidStats = { ...context.me, bricks: context.me.bricks - costB, weapons: context.me.weapons - costW, crystals: context.me.crystals - costC };
        const costStr = Logger.formatCost(context.me, costPaidStats);
        addLog(Logger.cardPlayed(isP1 ? P1_LABEL : P2_LABEL, card, costStr), isP1 ? 'PLAYER' : 'OPPONENT', true);

        // Stats Update
        updateGameStats(isP1 ? 'p1' : 'p2', 'cardsUsed', 1);
        const totalPaid = costB + costW + costC;
        updateGameStats(isP1 ? 'p1' : 'p2', 'totalCost', totalPaid);

        await playCardAction(card, context);

        setLastDiscardedCard({ card, action: 'PLAY' });
        setIsCardAnimating(false);
    };

    const handleCardDiscard = (card: CardType) => {
        handleUserInteraction();
        if (isProcessingTurn || isCardAnimating || levelIntroActive || kingSelectionState.phase !== 'IDLE' || gameState !== 'PLAYING') return;
        if (!isMultiplayer && !playerTurn) return;

        const isP1 = playerTurn;
        const activeHandSetter = isP1 ? setHand : setAiHand;
        const playerLabel = isP1 ? P1_LABEL : P2_LABEL;
        const logType = isP1 ? 'PLAYER' : 'OPPONENT';
        const activeKingCards = isP1 ? playerKingCards : opponentKingCards;
        const setTarget = isP1 ? setOpponent : setPlayer;
        const targetStatKey = isP1 ? 'p2' : 'p1';

        // Stats Update
        updateGameStats(isP1 ? 'p1' : 'p2', 'cardsDiscarded', 1);

        if (activeKingCards && activeKingBuff(activeKingCards, 'k_necro') && Math.random() < 0.25) {
            playSFX('magic');
            setTarget(prev => {
                 const dmg = 3; let t = { ...prev }; let actualDmg = 0; let hitType = "KING"; 
                 if (t.wall > 0) { const take = Math.min(t.wall, dmg); t.wall -= take; actualDmg += take; hitType = "WALL"; } else if (t.tower > 0) { const take = Math.min(t.tower, dmg); t.tower -= take; actualDmg += take; hitType = "TOWER"; } else { t.king = Math.max(0, t.king - dmg); actualDmg = dmg; }
                 const targetName = isP1 ? 'OPPONENT' : 'PLAYER'; addLog(Logger.passive(playerLabel, `HAUNT DRAINED ${actualDmg} ${hitType} FROM ${targetName}!`, true), logType, true);
                 updateGameStats(targetStatKey, 'taken', dmg);
                 return t;
            });
        }

        activeHandSetter(prevHand => { 
            const newHand = prevHand.filter(c => c.uniqueId !== card.uniqueId); 
            addLog(Logger.cardDiscarded(playerLabel, card), logType, true); 
            return newHand; 
        });

        if (card.id === 42) {
            addLog(Logger.kingPowerLost(playerLabel), logType, true);
            setLastDiscardedCard({ card, action: 'DISCARD' });
        } else {
            returnCardToBottom(card, true, 'DISCARD');
        }
        setCardPlayedInTurn(1); 
        setShowCards(false);
    };
    
    const aiPlay = useCallback(async () => {
        if (gameState !== 'PLAYING') return;
        if (isProcessingTurn) return;
        setIsProcessingTurn(true);
        setShowCards(false); setDealingCards([]); await delay(800);

        await executeAiTurn({
            opponent, setOpponent,
            player, setPlayer,
            aiHand, setAiHand,
            deck, setDeck,
            opponentKingCards, playerKingCards,
            addLog, playSFX,
            showPlayedCard, setActiveCard, setDealingCards, returnCardToBottom,
            triggerAnimation, spawnParticles, updateGameStats,
            triggerKingPowerSequence, triggerArcherDamage,
            setIsProcessingTurn, setPlayerTurn, setTurnCounts,
            playDamageSoundIfAny,
            P1_LABEL, P2_LABEL
        });

    }, [aiHand, opponent, opponentKingCards, gameState, playerTurn, canAfford]);
    
    useEffect(() => {
        if (!playerTurn && !isMultiplayer && gameState === 'PLAYING' && !isProcessingTurn && !isInitialDealing && kingSelectionState.phase === 'IDLE' && !levelIntroActive) {
             const timer = setTimeout(aiPlay, 500);
             return () => clearTimeout(timer);
        }
    }, [playerTurn, isMultiplayer, gameState, isProcessingTurn, isInitialDealing, kingSelectionState.phase, levelIntroActive, aiPlay]);

    const handleEndTurn = useCallback(async () => {
        handleUserInteraction();
        if (isProcessingTurn || isCardAnimating || levelIntroActive || kingSelectionState.phase !== 'IDLE' || gameState !== 'PLAYING') return;
        
        if (!isMultiplayer && !playerTurn) return;

        setIsProcessingTurn(true); 
        playSFX('button_click');

        const isP1 = playerTurn;
        const playerLabel = isP1 ? P1_LABEL : P2_LABEL;
        const logType = isP1 ? 'PLAYER' : 'OPPONENT';
        const activeStats = isP1 ? player : opponent;
        const setActive = isP1 ? setPlayer : setOpponent;
        const activeKingCards = isP1 ? playerKingCards : opponentKingCards;
        const targetStats = isP1 ? opponent : player;
        const setTarget = isP1 ? setOpponent : setPlayer;
        const currentHand = isP1 ? hand : aiHand;
        const statKey = isP1 ? 'p1' : 'p2';

        if (cardPlayedInTurn === 0) {
            addLog(`${playerLabel}: FARMING RESOURCES...`, logType, true);
        }

        const drawPromise = (currentHand.length < MAX_HAND_SIZE) ? manualDrawCard(isP1) : delay(500);

        let towerBonus = getTowerProductionBonus(activeStats.tower, activeKingCards);
        if (activeKingBuff(activeKingCards, 'k_labor') && activeStats.tower >= 50) {
            towerBonus = 5; 
        }

        const totalB = activeStats.prodBricks + towerBonus; 
        const totalW = activeStats.prodWeapons + towerBonus; 
        const totalC = activeStats.prodCrystals + towerBonus;

        setActive(prev => {
            let next = { 
                ...prev, 
                bricks: prev.bricks + totalB, 
                crystals: prev.crystals + totalC, 
                weapons: prev.weapons + totalW 
            };
            
            if (activeKingBuff(activeKingCards, 'k_mine')) {
                const r = Math.random();
                if (r < 0.33) next.bricks += 2;
                else if (r < 0.66) next.weapons += 2;
                else next.crystals += 2;
            }

            if (activeKingBuff(activeKingCards, 'k_bob')) {
                 if (next.wall < MAX_WALL) {
                     next.wall = Math.min(MAX_WALL, next.wall + 2);
                 }
            }

            if (prev.burn > 0) {
                let dmg = 0;
                if (next.king > 0) { next.king = Math.max(0, next.king - 3); dmg += Math.min(3, prev.king); }
                if (next.wall > 0) { next.wall = Math.max(0, next.wall - 6); dmg += Math.min(6, prev.wall); }
                if (next.tower > 0) { next.tower = Math.max(0, next.tower - 6); dmg += Math.min(6, prev.tower); }
                
                const burnReduc = activeKingBuff(activeKingCards, 'k_fire') ? 3 : 1;
                next.burn = Math.max(0, prev.burn - burnReduc);
                
                if (dmg > 0) updateGameStats(statKey, 'taken', dmg);
            }
            
            return next;
        });

        if (activeKingBuff(activeKingCards, 'k_ban') && Math.random() < 0.20) {
            setTarget(prevTarget => {
                 const stealAmount = 5; 
                 const r = Math.random();
                 let stolen = {b:0, w:0, c:0};
                 
                 if (r < 0.33) { stolen.b = Math.min(prevTarget.bricks, stealAmount); }
                 else if (r < 0.66) { stolen.w = Math.min(prevTarget.weapons, stealAmount); }
                 else { stolen.c = Math.min(prevTarget.crystals, stealAmount); }
                 
                 if (stolen.b + stolen.w + stolen.c > 0) {
                     const newTarget = { 
                         ...prevTarget, 
                         bricks: prevTarget.bricks - stolen.b, 
                         weapons: prevTarget.weapons - stolen.w, 
                         crystals: prevTarget.crystals - stolen.c 
                     };
                     
                     setActive(me => ({ 
                         ...me, 
                         bricks: me.bricks + stolen.b, 
                         weapons: me.weapons + stolen.w, 
                         crystals: me.crystals + stolen.c 
                     }));
                     
                     let stStr = [];
                     if (stolen.b > 0) stStr.push(`${Logger.formatLabel('bricks')} ${stolen.b}`);
                     if (stolen.w > 0) stStr.push(`${Logger.formatLabel('weapons')} ${stolen.w}`);
                     if (stolen.c > 0) stStr.push(`${Logger.formatLabel('crystals')} ${stolen.c}`);
                     
                     addLog(Logger.passive(playerLabel, `BANDIT STOLE ${stStr.join(' ')}`), logType, true);
                     return newTarget;
                 }
                 return prevTarget;
            });
        }

        if (activeStats.burn > 0) addLog(Logger.passive(playerLabel, "SUFFERS FROM INFERNO!", true), logType, true);
        if (activeKingBuff(activeKingCards, 'k_bob')) addLog(Logger.passive(playerLabel, `BOB BUILDS ${Logger.formatLabel('wall')} +2`), logType, true);
        if (activeKingBuff(activeKingCards, 'k_mine')) addLog(Logger.passive(playerLabel, "MINER FOUND RESOURCES"), "INFO", true);
        if (activeKingBuff(activeKingCards, 'k_labor') && activeStats.tower >= 50) addLog(Logger.passive(playerLabel, "LABOR GIVES +5 ALL PROD (MAX)"), "INFO", true);

        addLog(Logger.production(playerLabel, totalB, totalW, totalC, isP1), logType, true);
        
        const predictedStats = { ...activeStats, bricks: activeStats.bricks + totalB, crystals: activeStats.crystals + totalC, weapons: activeStats.weapons + totalW };

        await drawPromise;
        const newHandSize = isP1 ? hand.length : aiHand.length; 
        if (newHandSize >= MAX_HAND_SIZE) { 
            await delay(500); 
        }
        setDealingCards([]);

        await triggerArcherDamage(predictedStats, targetStats, isP1 ? 'RIGHT' : 'LEFT', setTarget, addLog, activeKingCards);

        await delay(200);
        setCardPlayedInTurn(0);
        await delay(700);

        let nextTurnNum = 0;
        if (isP1) {
            nextTurnNum = turnCounts.c + 1;
            setTurnCounts(prev => ({ ...prev, c: nextTurnNum }));
            setPlayerTurn(false);
            addLog(Logger.turnStart(P2_LABEL, nextTurnNum), "OPPONENT", true);
        } else {
            nextTurnNum = turnCounts.p + 1;
            setTurnCounts(prev => ({ ...prev, p: nextTurnNum }));
            setPlayerTurn(true);
            addLog(Logger.turnStart(P1_LABEL, nextTurnNum), "PLAYER", true);
        }
        
        setIsProcessingTurn(false);
    }, [deck, hand, aiHand, player, opponent, playerTurn, isProcessingTurn, MAX_HAND_SIZE, P1_LABEL, P2_LABEL, activeCard]);

    const saveGame = (slotId: number) => {
        const saveData: SaveState = { 
            player, opponent, deck, hand, aiHand, turnCounts, playerTurn, cardPlayedInTurn, gameState, 
            isTowerMode, isEndlessMode, isMultiplayer, towerStage, endlessStage, gameStats, endlessCpuColor, 
            lastDiscardedCard, playerKingCards, opponentKingCards, 
            timestamp: Date.now(),
            kingSelectionState,
            isInitialDealing,
            levelIntroActive,
            destructionState,
            lootState,
            p1Color, p2Color
        };
        
        if (saveGameToSlot(slotId, saveData)) {
            setRegistryData(getSaveRegistry()); 
            addLog(Logger.system(`GAME SAVED TO SLOT ${slotId}`), "INFO", true); 
            playSFX('build_grow'); 
            setSaveStatus((prev: any) => ({ ...prev, [slotId]: 'SAVED!' })); 
            setTimeout(() => setSaveStatus((prev: any) => ({ ...prev, [slotId]: null })), 2000);
        } else {
            addLog(Logger.warning("FAILED TO SAVE GAME."), "WARNING", true);
        }
    };

    const confirmOverwrite = () => { if (overwriteSlot) { saveGame(overwriteSlot); setOverwriteSlot(null); } };
    const goToMenu = () => { navigate('/'); };
    const toggleCards = () => { if ((isMultiplayer || playerTurn) && !isInitialDealing && !isProcessingTurn && !levelIntroActive && kingSelectionState.phase === 'IDLE') { playSFX('button_click'); setShowCards(prev => !prev); } };
    const restart = async () => { playSFX('button_click'); setGameState('TRANSITION'); setEndGameReason(""); setDestructionState(null); setDealingCards([]); setShowCards(false); setCardPlayedInTurn(0); setPlayer({ tower: START_TOWER, wall: START_WALL, king: START_KING, bricks: START_RESOURCE, prodBricks: START_PROD, crystals: START_RESOURCE, prodCrystals: START_PROD, weapons: START_RESOURCE, prodWeapons: START_PROD, burn: 0, shield: 0 }); setOpponent({ tower: START_TOWER, wall: START_WALL, king: START_KING, bricks: START_RESOURCE, prodBricks: START_PROD, crystals: START_RESOURCE, prodCrystals: START_PROD, weapons: START_RESOURCE, prodWeapons: START_PROD, burn: 0, shield: 0 }); setGameStats(initialGameStats); setTurnCounts({p:1, c:0}); setLastDiscardedCard(null); setLog([{text: Logger.system("SYSTEM REBOOT..."), type: 'INFO', isRawHtml: true}]); setTowerStage(1); setEndlessStage(1); setEndlessCpuColor(null); setHand([]); setAiHand([]); setPlayerKingCards([]); setOpponentKingCards([]); setIsInitialDealing(true); initRef.current = false; dealingInProgressRef.current = false; setPlayerTurn(true); setIsGameReady(false); startTimeRef.current = Date.now(); await delay(300); const newDeck = generateDeck(); setDeck(newDeck); const availableCards = getAvailableKingCards([], [], true); const initialKingDeck = shuffleKingDeck(availableCards); setKingSelectionState({ phase: 'SHUFFLING_P1', deck: initialKingDeck, drawn: [], shufflesLeft: 1 }); setGameState('PLAYING'); playSFX('button_click'); await delay(1500); setKingSelectionState(prev => ({ ...prev, phase: 'P1_CHOICE' })); };

    useEffect(() => { if (!prevPlayer || !prevOpponent) return; const playerKingDamaged = player.king < prevPlayer.king; const cpuKingDamaged = opponent.king < prevOpponent.king; if (playerKingDamaged || cpuKingDamaged) { setDamageFlash(true); setTimeout(() => setDamageFlash(false), 300); setScreenShake(true); setTimeout(() => setScreenShake(false), 600); } }, [player, opponent]);

    useEffect(() => {
        let animId: number;
        const updateDebris = () => {
            const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const debris = debrisRef.current;
            for (let i = debris.length - 1; i >= 0; i--) {
                const p = debris[i]; p.x += p.vx; p.y += p.vy; p.vy += p.grav; p.life -= 0.015; p.rot += p.rotSpeed;
                if (p.life <= 0 || p.y > 800) { debris.splice(i, 1); continue; }
                
                ctx.save(); 
                ctx.translate(p.x, p.y); 
                ctx.rotate(p.rot * Math.PI / 180); 
                
                if (p.type === 'SHARD') {
                    ctx.globalAlpha = p.life;
                    ctx.beginPath();
                    ctx.moveTo(0, -p.size/2);
                    ctx.lineTo(p.size/2, p.size/2);
                    ctx.lineTo(-p.size/2, p.size/2);
                    ctx.closePath();
                    ctx.fillStyle = p.color;
                    ctx.fill();
                    ctx.strokeStyle = "rgba(255,255,255,0.6)";
                    ctx.lineWidth = 1;
                    ctx.stroke();
                } else {
                    ctx.fillStyle = p.color; 
                    ctx.globalAlpha = p.life; 
                    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); 
                }
                ctx.restore();
            }
            animId = requestAnimationFrame(updateDebris);
        };
        animId = requestAnimationFrame(updateDebris);
        return () => cancelAnimationFrame(animId);
    }, []);

    useEffect(() => {
        if (!prevPlayer || !prevOpponent || !gameRef.current || levelIntroActive) return;
        const checkDiff = (curr: any, prev: any, prefix: string, isPlayer: boolean) => {
            const props = [{ key: 'tower', sel: `${prefix}-tower`, type: 'TOWER' }, { key: 'wall', sel: `${prefix}-wall`, type: 'WALL' }, { key: 'king', sel: `${prefix}-king`, type: 'KING' }, { key: 'bricks', sel: `${prefix}-res-bricks`, type: 'RES' }, { key: 'weapons', sel: `${prefix}-res-weapons`, type: 'RES' }, { key: 'crystals', sel: `${prefix}-res-crystals`, type: 'RES' }, { key: 'prodBricks', sel: `${prefix}-res-bricks`, type: 'PROD' }, { key: 'prodWeapons', l: 'prodWeapons', sel: `${prefix}-res-weapons`, type: 'PROD' }, { key: 'prodCrystals', sel: `${prefix}-res-crystals`, type: 'PROD' }];
            props.forEach(p => {
                const diff = curr[p.key] - prev[p.key];
                if (diff !== 0) {
                    const el = document.getElementById(p.sel);
                    if (el && gameRef.current) {
                        const refRect = el.getBoundingClientRect(); const gameRect = gameRef.current.getBoundingClientRect(); const scale = gameRect.width / BASE_WIDTH;
                        const internalX = (refRect.left - gameRect.left + refRect.width / 2); let internalY = (refRect.top - gameRect.top + refRect.height / 2);
                        if (p.type === 'TOWER' || p.type === 'WALL') { const maxVal = p.type === 'TOWER' ? 150 : 200; const ratio = Math.max(0, Math.min(1, curr[p.key] / maxVal)); const topOfBar = (refRect.bottom - gameRect.top) - (refRect.height * ratio); internalY = topOfBar - 10; }
                        if (p.type === 'KING') { internalY = (refRect.bottom - gameRect.top) - 50; }
                        if (p.type === 'RES') { const iconEl = el.querySelector('div:first-child'); if (iconEl) { const iconRect = iconEl.getBoundingClientRect(); internalY = (iconRect.top - gameRect.top + iconRect.height / 2); } }
                        addFloatingText(internalX / scale, internalY / scale, diff, p.type, p.key, !isPlayer);
                        if (diff < 0) {
                            if (['TOWER', 'WALL', 'KING'].includes(p.type)) for(let i=0; i<10; i++) spawnSmoke(internalX / scale, internalY / scale, scale);
                            let debrisColor = '#57534e'; if (p.type === 'WALL') debrisColor = '#ef4444'; if (p.type === 'TOWER') debrisColor = '#06b6d4'; if (p.type === 'KING') debrisColor = '#eab308';
                            if (['TOWER', 'WALL', 'KING'].includes(p.type)) {
                                if (debrisRef.current) { for (let i = 0; i < Math.abs(diff) * 3; i++) { debrisRef.current.push({ x: internalX / scale, y: internalY / scale, vx: (Math.random() - 0.5) * 12, vy: (Math.random() * -10) - 5, grav: 0.5, size: Math.random() * 6 + 3, color: debrisColor, life: 1.0, rot: Math.random() * 360, rotSpeed: (Math.random() - 0.5) * 15 }); } }
                            }
                        }
                    }
                }
            });
        };
        checkDiff(player, prevPlayer, 'p', true); checkDiff(opponent, prevOpponent, 'o', false);
    }, [player, opponent, levelIntroActive]);

    const getButtonContent = () => {
        const activeHandSize = playerTurn ? hand.length : aiHand.length;
        const drawText = activeHandSize < MAX_HAND_SIZE ? 'DRAW 1 & END' : 'END TURN';
        if (cardPlayedInTurn > 0) return { text: drawText + ' (ACTION TAKEN)', icon: '➡️' };
        return { text: drawText + ' (PASS)', icon: '➡️' };
    };
    const isActionAvailable = (playerTurn || isMultiplayer) && !isInitialDealing && !isProcessingTurn && !isCardAnimating && !levelIntroActive && kingSelectionState.phase === 'IDLE';

    return (
        <div id="game-scaler" ref={gameRef} className={`bg-stone-950 shadow-2xl overflow-hidden relative select-none`} onClick={() => resumeAudioContext(setAudioReady)} style={{ width: BASE_WIDTH, height: BASE_HEIGHT, position: 'absolute', transformOrigin: '0 0' }}>
            <div className="scanlines-overlay"></div>
            <div id="game-stage" className={`w-full h-full flex flex-col ${screenShake ? 'shake-screen' : ''}`}>
                <canvas ref={canvasRef} width={1280} height={720} className="absolute inset-0 pointer-events-none z-[60]" />
                <div className={`absolute inset-0 bg-red-500/20 pointer-events-none z-[100] transition-opacity duration-300 ${damageFlash ? 'opacity-100' : 'opacity-0'}`}></div>
                
                {gameState === 'TRANSITION' && (
                    <div className="absolute inset-0 z-[9999] bg-black/60 backdrop-blur-md flex flex-col items-center justify-center animate-fade-in pointer-events-auto">
                        <div className="text-4xl font-black text-white tracking-widest uppercase animate-pulse drop-shadow-[0_0_15px_white]">LOADING NEXT LEVEL...</div>
                        <div className="mt-4 loading-spinner border-white"></div>
                    </div>
                )}

                <KingSelectionOverlay state={kingSelectionState} onShuffle={handleKingShuffle} onDraw={handleKingDraw} onSelect={handleKingSelect} isMultiplayer={isMultiplayer} />
                <KingLootOverlay lootState={lootState} onAccept={handleLootAccept} onDecline={handleLootDecline} onReplace={handleLootReplace} onPickEnemy={handleLootTargetSelect} onBackToPick={handleBackToPick} />
                {isInsertingKingPowers && <KingPowerShuffleVisual onAnimationEnd={() => {}} />}
                {floatingTexts.map(ft => <FloatingText key={ft.id} text={ft} />)}
                {particles.map(p => (<div key={p.id} className={p.type === 'SMOKE' ? 'damage-smoke' : (p.type === 'GLASS' ? 'particle-shard' : 'particle')} style={{ left: p.x, top: p.y, ...(p.type !== 'SMOKE' ? { backgroundColor: p.color, '--tx': p.tx, '--ty': p.ty, '--rot': p.rot } : {}) }} />))}
                <AnimationOverlay animations={activeAnimations} />
                <KingDeckOverlay visible={isKingDeckVisible} drawingState={kingDeckDrawingState} />
                <PlayedCardShowcase activeCard={activeCard} isMultiplayer={isMultiplayer} activeKingBuff={activeCard ? getKingBuffs(activeCard.card, activeCard.playedBy === 'player' ? playerKingCards : opponentKingCards, activeCard.playedBy === 'player' ? player : opponent, activeCard.playedBy === 'player' ? opponent : player) : null} onClose={() => setActiveCard(null)} />
                <GameOverPanel 
                    gameState={gameState} 
                    endGameReason={endGameReason} 
                    stats={gameStats} 
                    onRestart={restart} 
                    onMenu={goToMenu}
                    winner={gameState === 'WON' ? 'p1' : 'p2'} 
                    p1Profile={p1Color}
                    p2Profile={p2Color}
                    runTime={runTimeDisplay}
                    isTowerMode={isTowerMode}
                    isEndlessMode={isEndlessMode}
                    stageNumber={isTowerMode ? towerStage : endlessStage}
                />

                <div className="flex bg-stone-950/90 border-b border-white/10 h-14 shadow-xl z-400 relative items-center justify-between px-6 shrink-0 w-full mt-0 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <button onClick={() => toggleSfx(setIsSfxOn)} className={`w-8 h-8 rounded flex items-center justify-center transition-all ${isSfxOn ? 'text-stone-200 bg-white/10 border border-white/20' : 'text-stone-600 border border-stone-800'}`} title="SFX">{isSfxOn ? "🔊" : "🔇"}</button>
                        <button onClick={() => toggleMusic(setIsMusicOn)} className={`w-8 h-8 rounded flex items-center justify-center transition-all ${isMusicOn ? 'text-stone-200 bg-white/10 border border-white/20' : 'text-stone-600 border border-stone-800'}`} title="MUSIC">{isMusicOn ? "🎵" : "❌"}</button>
                        <button onClick={() => { playSFX('button_click'); setMenuView('MAIN'); }} className="px-4 h-8 rounded text-[10px] font-bold uppercase tracking-[0.2em] border border-white/10 hover:border-white/40 hover:bg-white/5 transition-all text-stone-400 hover:text-white ml-2" title="MENU">MENU</button>
                        <div className="ml-4 flex items-baseline gap-2 select-none opacity-80 hover:opacity-100 transition-opacity">
                            <h1 className="text-2xl font-black font-chivo tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-stone-200 via-stone-400 to-stone-600 uppercase drop-shadow-sm">Cardstels</h1> <span className="text-xs font-bold text-grey tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-stone-400 via-stone-500 to-stone-600 drop-shadow-sm">by Mracek</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <h1 className={`text-[20px] font-extrabold tracking-[0.2em] uppercase ${cpuTurnTextClass}`}>{P2_LABEL} RESOURCES:</h1>
                        <div className="flex gap-2 transform scale-90 origin-right">
                            <ResourceIndicator id="o-res-bricks" label="BRICKS" value={opponent.bricks} production={opponent.prodBricks} icon="🧱" />
                            <ResourceIndicator id="o-res-weapons" label="WEAPONS" value={opponent.weapons} production={opponent.prodWeapons} icon="⚔️" />
                            <ResourceIndicator id="o-res-crystals" label="CRYSTALS" value={opponent.crystals} production={opponent.prodCrystals} icon="💎" />
                        </div>
                    </div>
                </div>

                <div className="flex-1 flex items-end justify-center bg-black relative">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_var(--tw-gradient-stops))] from-stone-900 via-black to-black opacity-100 z-0"></div>
                    <div className="overlay-checker-texture"></div>
                    <div className="absolute inset-0 pattern-grid-fading origin-bottom"></div>
                    {levelIntroActive && (<div className="absolute inset-0 z-[90] flex items-center justify-center pointer-events-none"><h1 className={`text-9xl font-black font-chivo uppercase tracking-tighter drop-shadow-[0_0_25px_rgba(0,0,0,0.8)] animate-pulse ${currentStageColor ? currentStageColor.text : 'text-white'}`}>LEVEL {isEndlessMode ? endlessStage : towerStage}</h1></div>)}
                    
                    <div className={`absolute top-4 left-6 z-30 transition-all duration-500 transform ${playerTurn ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
                        <div className="flex items-center gap-3"><div className="relative"><div className={`w-4 h-4 rounded-full animate-pulse z-10 relative ${p1Color.bg} ${p1Color.glow}`}></div><div className={`absolute inset-0 rounded-full animate-ping opacity-75 ${p1Color.bg}`}></div></div><span className={`text-2xl font-black italic tracking-widest font-chivo uppercase ${p1Color.text} drop-shadow-md`}>{P1_LABEL} TURN</span></div>
                    </div>

                    <div className="absolute bottom-6 left-10 z-30 flex flex-col items-center pointer-events-auto transition-all duration-500">
                        <div className={`flex flex-col-reverse gap-3 p-2.5 bg-black/80 backdrop-blur-xl rounded-2xl border-2 ${p1Color.border} ${p1Color.glow} relative overflow-hidden transition-all hover:scale-105`}>
                            <div className={`absolute inset-0 ${p1Color.bg} opacity-10  pointer-events-none`}></div>
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="relative w-14 h-14 z-10">
                                    {playerKingCards[i] ? (<div className="w-full h-full rounded-xl bg-gradient-to-br from-yellow-900 via-amber-700 to-yellow-950 border-2 border-yellow-400 text-yellow-300 shadow-[0_0_15px_rgba(234,179,8,0.5)] flex items-center justify-center text-3xl cursor-help group hover:scale-110 hover:-translate-y-1 transition-all z-10 hover:z-50 hover:border-white hover:shadow-[0_0_25px_gold]" onMouseEnter={() => setHoveredKingCard(playerKingCards[i])} onMouseLeave={() => setHoveredKingCard(null)} onClick={(e) => { e.stopPropagation(); setHoveredKingCard(hoveredKingCard === playerKingCards[i] ? null : playerKingCards[i]); }}><span className="filter drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] transform group-hover:scale-110 transition-transform">{playerKingCards[i].img || "👑"}</span><div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-transparent via-white/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div></div>) : (<div className={`w-full h-full rounded-xl border-2 border-dashed flex items-center justify-center opacity-30 ${p1Color.border}`}><div className={`w-2 h-2 rounded-full ${p1Color.bg}`}></div></div>)}
                                </div>
                            ))}
                        </div>
                        <div className={`text-[9px] font-black uppercase tracking-widest mt-3 text-center leading-tight max-w-[80px] ${p1Color.text}`}>ACTIVE KING POWERS</div>
                    </div>

                    <div className="absolute bottom-6 right-10 z-30 flex flex-col items-center pointer-events-auto transition-all duration-500">
                        <div className={`flex flex-col-reverse gap-3 p-2.5 bg-black/80 backdrop-blur-xl rounded-2xl border-2 relative overflow-hidden transition-all hover:scale-105 ${p2Color.border} ${cpuGlowClass}`}>
                            <div className={`absolute inset-0 pointer-events-none ${cpuBgClass} opacity-10 `}></div>
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="relative w-14 h-14 z-10">
                                    {opponentKingCards[i] ? (<div className="w-full h-full rounded-xl bg-gradient-to-br from-yellow-900 via-amber-700 to-yellow-950 border-2 border-yellow-400 text-yellow-300 shadow-[0_0_15px_rgba(234,179,8,0.5)] flex items-center justify-center text-3xl cursor-help group hover:scale-110 hover:-translate-y-1 transition-all z-10 hover:z-50 hover:border-white hover:shadow-[0_0_25px_gold]" onMouseEnter={() => setHoveredKingCard(opponentKingCards[i])} onMouseLeave={() => setHoveredKingCard(null)} onClick={(e) => { e.stopPropagation(); setHoveredKingCard(hoveredKingCard === opponentKingCards[i] ? null : opponentKingCards[i]); }}><span className="filter drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] transform group-hover:scale-110 transition-transform">{opponentKingCards[i].img || "👑"}</span></div>) : (<div className={`w-full h-full rounded-xl border-2 border-dashed flex items-center justify-center opacity-30 ${p2Color.border}`}><div className={`w-2 h-2 rounded-full ${p2Color.bg}`}></div></div>)}
                                </div>
                            ))}
                        </div>
                        <div className={`text-[9px] font-black uppercase tracking-widest mt-3 text-center leading-tight max-w-[80px] ${cpuPanelClass}`}>ACTIVE KING POWERS</div>
                    </div>

                    {hoveredKingCard && (<div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in pointer-events-none"><div className="pointer-events-auto transform scale-150 drop-shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-pop-in relative"><div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-black/90 text-white px-6 py-2 rounded-full border border-white/20 text-xs font-bold uppercase tracking-[0.2em] whitespace-nowrap shadow-xl z-50 pointer-events-none">Active Passive Effect</div><Card card={hoveredKingCard} isKingCard={true} canAfford={false} bigMode={false} isVisual={true} enable3D={true} forceDiscard={false} /></div></div>)}

                    <div className={`absolute top-4 right-6 z-30 transition-all duration-500 transform ${!playerTurn ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
                        <div className="flex items-center gap-3 flex-row-reverse">
                            <div className="relative">
                                <div className={`w-4 h-4 rounded-full animate-pulse z-10 relative ${p2Color.bg} ${cpuGlowClass}`}></div>
                                <div className={`absolute inset-0 rounded-full animate-ping opacity-75 ${p2Color.bg}`}></div>
                            </div>
                            <span className={`text-2xl font-black italic tracking-widest font-chivo uppercase drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] ${cpuTurnTextClass.includes('text-transparent') ? 'text-red-600' : cpuTurnTextClass}`}>{P2_LABEL} TURN</span>
                        </div>
                    </div>

                    <div className="flex w-full max-w-7xl justify-between items-end z-10 px-6 pb-0 h-full relative">
                        {destructionState === 'player' && (<div className="absolute left-20 bottom-0 w-64 h-full pointer-events-none z-30">{[...Array(20)].map((_, i) => (<div key={i} className="smoke-particle" style={{ width: Math.random() * 50 + 20 + 'px', height: Math.random() * 50 + 20 + 'px', left: Math.random() * 100 + '%', bottom: Math.random() * 50 + '%', animationDelay: Math.random() * 2 + 's' }}></div>))}</div>)}
                        <TowerDisplay height={player.tower} wall={player.wall} king={player.king} shield={player.shield} isPlayer={true} idPrefix="p" isDestroyed={destructionState === 'player'} label={`${P1_LABEL} CASTLE`} isBurning={player.burn > 0} colorProfile={p1Color} />

                        <div className="flex flex-col items-center justify-end w-1/3 max-w-md h-full mb-4 relative z-40">
                            <div className="flex items-end justify-between w-full max-w-[380px] mb-6">
                                <div className="relative transform hover:scale-105 transition-transform" title={`DECK: ${deck.length} CARDS LEFT`}><div className="absolute inset-0 rounded-xl bg-black border-2 border-stone-800 translate-x-1 translate-y-1 z-0"></div><div className="absolute inset-0 rounded-xl bg-black border-2 border-stone-800 translate-x-2 translate-y-2 z-[-1]"></div><div className={`card-size card-back-pattern rounded-xl shadow-xl flex items-center justify-center relative overflow-hidden z-10 bg-stone-950`}><CardBackContent /></div></div>
                                <div className="relative transform hover:scale-105 transition-transform" title="Last Played / Discarded Card">
                                    {lastDiscardedCard ? (
                                        <div onClick={() => { playSFX('play_card'); setDiscardInspectMode(true); }}>
                                            <Card card={lastDiscardedCard.card || lastDiscardedCard} canAfford={false} onPlay={() => {}} onDiscard={() => {}} cardPlayedInTurn={1} forceDiscard={lastDiscardedCard.action === 'DISCARD'} isVisual={true} bigMode={false} enable3D={true} />
                                        </div>
                                    ) : (<div className="card-size rounded-xl border-4 border-stone-800 bg-stone-900 flex items-center justify-center shadow-inner text-center p-2"><div className="text-stone-700 font-black text-sm uppercase tracking-widest leading-relaxed">DISCARD<br/>PILE</div></div>)}
                                </div>
                            </div>
                            <div className="w-full mb-4 flex justify-center">
                                {(() => {
                                    const buttonContent = getButtonContent();
                                    const buttonDisabled = (!playerTurn && !isMultiplayer) || isInitialDealing || isProcessingTurn || isCardAnimating || levelIntroActive || kingSelectionState.phase !== 'IDLE';
                                    const isP1 = playerTurn;
                                    const activeColor = isP1 ? p1Color : p2Color;
                                    
                                    let activeClass = '';
                                    if (!buttonDisabled) {
                                        activeClass = cardPlayedInTurn === 0 
                                            ? `bg-gradient-to-r ${activeColor.bar} border-2 ${activeColor.border} animate-pulse shadow-[0_0_15px_rgba(255,255,255,0.3)]` 
                                            : `bg-gradient-to-r ${activeColor.bar} border-2 ${activeColor.border}`;
                                    } else { 
                                        activeClass = `bg-transparent border-2 ${activeColor.border} opacity-40 cursor-not-allowed grayscale`; 
                                    }
                                    
                                    return (<button onClick={handleEndTurn} disabled={buttonDisabled} className={`text-white font-black text-sm px-6 py-2 rounded-xl transition-all shadow-xl uppercase tracking-widest transform hover:scale-105 flex items-center gap-2 w-full justify-center whitespace-nowrap hover:brightness-125 text-outline-black ${activeClass}`}>{buttonContent.text}<span className="text-xl">{buttonContent.icon}</span></button>);
                                })()}
                            </div>
                            <div className="w-full h-40 bg-black/90 rounded-2xl p-0.5 backdrop-blur-md border border-stone-800 flex flex-col shadow-2xl relative overflow-hidden pointer-events-auto">
                                <div className="flex-1 flex flex-col justify-start w-full px-3 py-1 overflow-y-auto overflow-x-hidden custom-scrollbar relative min-h-full touch-pan-y"><div className="flex flex-col justify-start items-start w-full space-y-1 mt-auto">{log.map((l, i) => (<div key={i} className={`text-xs py-0.5 font-mono leading-tight ${l.type === 'PLAYER' ? 'text-stone-300' : l.type === 'OPPONENT' ? 'text-yellow-600' : 'text-stone-500'}`}>{l.isRawHtml ? <span dangerouslySetInnerHTML={{ __html: l.text }}></span> : l.text}</div>))}</div><div ref={logEndRef} className="shrink-0" /></div>
                            </div>
                        </div>

                        {destructionState === 'opponent' && (<div className="absolute right-20 bottom-0 w-64 h-full pointer-events-none z-30">{[...Array(20)].map((_, i) => (<div key={i} className="smoke-particle" style={{ width: Math.random() * 50 + 20 + 'px', height: Math.random() * 50 + 20 + 'px', left: Math.random() * 100 + '%', bottom: Math.random() * 50 + '%', animationDelay: Math.random() * 2 + 's' }}></div>))}</div>)}
                        <TowerDisplay height={opponent.tower} wall={opponent.wall} king={opponent.king} shield={opponent.shield} isPlayer={false} idPrefix="o" mirror={true} isDestroyed={destructionState === 'opponent'} label={`${P2_LABEL} CASTLE`} stageColor={currentStageColor} isBurning={opponent.burn > 0} colorProfile={p2Color} />
                    </div>
                </div>

                <div className="absolute bottom-5 right-5 z-[60] flex flex-col items-end pointer-events-none gap-1">
                    {isTowerMode && (<span className={`px-3 py-1 rounded text-sm font-black uppercase tracking-widest border-2 shadow-lg ${currentStageColor ? currentStageColor.border : 'border-purple-500'} ${currentStageColor ? currentStageColor.text : 'text-purple-400'} bg-black/80 backdrop-blur-md`}>STAGE {towerStage}/8</span>)}
                    {isEndlessMode && (<span className={`px-3 py-1 rounded text-sm font-black uppercase tracking-widest border-2 border-cyan-500 text-cyan-400 bg-black/80 shadow-lg backdrop-blur-md`}>ENDLESS STAGE {endlessStage}</span>)}
                </div>

                {(isInitialDealing || dealingCards.length > 0) && (
                    <div className="absolute inset-0 z-[80] flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
                        {isInitialDealing && (<div className="absolute top-24 text-2xl font-black text-white p-6 bg-slate-800 rounded-xl border-2 border-cyan-500 shadow-2xl z-[1050]">INITIAL DEALING...</div>)}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40"><div className={`card-size card-back-pattern rounded-xl shadow-xl flex items-center justify-center relative overflow-hidden bg-stone-950 ${isInitialDealing ? 'shuffling-deck' : ''}`}><CardBackContent /></div></div>
                        {dealingCards.map((deal, index) => (<DealingCardVisual key={deal.card.uniqueId || index} startPlayer={deal.player} card={deal.card} delayTime={deal.delay} isReturning={deal.isReturning} onAnimationEnd={handleDealAnimationEnd} />))}
                    </div>
                )}

               <div className="ui-panel-glass relative z-30 h-36 shrink-0 w-full flex px-6 py-2 items-center justify-between">
                    <div className="flex flex-col gap-2 min-w-[280px]">
                        <h1 className={`text-[20px] font-extrabold tracking-[0.2em] uppercase ml-1 flex items-center gap-2 ${p1Color.text}`}>{P1_LABEL} RESOURCES:</h1>
                        <div className="flex gap-3">
                            <ResourceIndicator id="p-res-bricks" label="BRICKS" value={player.bricks} production={player.prodBricks} icon="🧱" />
                            <ResourceIndicator id="p-res-weapons" label="WEAPONS" value={player.weapons} production={player.prodWeapons} icon="⚔️" />
                            <ResourceIndicator id="p-res-crystals" label="CRYSTALS" value={player.crystals} production={player.prodCrystals} icon="💎" />
                        </div>
                    </div>
                    <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
                        {(() => {
                            const isP1 = playerTurn;
                            const activeColor = isP1 ? p1Color : p2Color;
                            const buttonDisabled = (!playerTurn && !isMultiplayer) || isInitialDealing || levelIntroActive || kingSelectionState.phase !== 'IDLE';
                            
                            let btnClass = '';
                            if (!buttonDisabled) {
                                btnClass = `bg-gradient-to-r ${activeColor.bar} border-2 ${activeColor.border} shadow-[0_0_15px_rgba(255,255,255,0.2)] hover:scale-110`;
                            } else {
                                btnClass = `bg-transparent border-2 ${activeColor.border} opacity-40 cursor-not-allowed grayscale`;
                            }

                            return (
                                <button onClick={toggleCards} disabled={buttonDisabled} className={`text-white font-black text-base px-16 py-3 rounded-xl transition-all uppercase tracking-wider transform shadow-lg text-outline-black ${btnClass}`}>CARDS ({(playerTurn ? hand : aiHand).length}/{MAX_HAND_SIZE})</button>
                            );
                        })()}
                    </div>
                </div>

                {/* DISCARD INSPECT OVERLAY (FIXED) */}
                {discardInspectMode && lastDiscardedCard && (
                    <div className="absolute inset-0 z-[2000] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center animate-fade-in pointer-events-auto" onClick={() => setDiscardInspectMode(false)}>
                        <div className="transform scale-150 shadow-[0_0_60px_rgba(0,0,0,0.8)] animate-pop-in relative pointer-events-none">
                            <Card 
                                card={lastDiscardedCard.card || lastDiscardedCard} 
                                canAfford={false} 
                                bigMode={true} 
                                isVisual={true} 
                                enable3D={true} 
                                forceDiscard={lastDiscardedCard.action === 'DISCARD'} 
                            />
                        </div>
                        <div className="mt-20 text-stone-400 font-bold tracking-[0.5em] uppercase text-sm animate-pulse flex flex-col items-center gap-2">
                            <span>LAST {lastDiscardedCard.action === 'DISCARD' ? 'DISCARDED' : 'PLAYED'} CARD</span>
                            <span className="text-[10px] text-stone-600">( CLICK ANYWHERE TO CLOSE )</span>
                        </div>
                    </div>
                )}

                {menuView !== 'NONE' && (
                    <div className="absolute inset-0 z-[2000] bg-black/80 backdrop-blur-sm flex items-center justify-center animate-fade-in">
                        <div className="bg-slate-900 p-8 rounded-xl border-2 border-slate-700 text-center shadow-2xl max-w-sm w-full transform scale-100">
                            {menuView === 'MAIN' && (
                                <><div className="text-2xl font-black text-cyan-400 mb-6 uppercase tracking-widest drop-shadow-md">GAME MENU</div><div className="flex flex-col gap-4"><button onClick={() => setMenuView('NONE')} className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-black rounded border border-slate-500 uppercase tracking-widest transition-transform hover:scale-105">RESUME</button><button onClick={() => setMenuView('SAVE')} className="px-6 py-3 bg-blue-700 hover:bg-blue-600 text-white font-black rounded border border-blue-500 uppercase tracking-widest transition-transform hover:scale-105">SAVE GAME</button><button onClick={() => setMenuView('EXIT_CONFIRM')} className="px-6 py-3 bg-red-700 hover:bg-red-600 text-white font-black rounded border border-red-500 uppercase tracking-widest transition-transform hover:scale-105">EXIT TO MENU</button></div></>
                            )}
                            {menuView === 'SAVE' && (
                                <><div className="text-2xl font-black text-blue-400 mb-4 uppercase tracking-widest drop-shadow-md">SAVE GAME</div><div className="flex flex-col gap-3 mb-4">{[1, 2, 3, 4].map(slot => { const isConfirming = overwriteSlot === slot; const isOccupied = registryData[slot] && registryData[slot].occupied; if (isConfirming) { return (<div key={slot} className="bg-slate-800 rounded border border-yellow-500 p-2 animate-pulse"><div className="text-xs text-yellow-500 font-bold mb-2">Overwrite this save?</div><div className="flex gap-2 justify-center"><button onClick={confirmOverwrite} className="flex-1 bg-red-600 text-white font-bold py-1 rounded hover:bg-red-500">YES</button><button onClick={() => setOverwriteSlot(null)} className="flex-1 bg-slate-600 text-white font-bold py-1 rounded hover:bg-slate-500">NO</button></div></div>); } return (<button key={slot} onClick={() => isOccupied ? setOverwriteSlot(slot) : saveGame(slot)} className={`px-4 py-3 font-bold rounded border uppercase tracking-wide transition-all text-left flex justify-between items-center ${saveStatus[slot] ? 'bg-green-600 border-green-400 text-white' : 'bg-slate-800 hover:bg-slate-700 text-cyan-400 border-slate-600 hover:border-cyan-500'}`}><span>{saveStatus[slot] ? 'GAME SAVED!' : `SAVE SLOT ${slot}`}</span>{isOccupied && !saveStatus[slot] && <span className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded text-slate-400 border border-slate-700">FULL</span>}</button>); })}</div><button onClick={() => setMenuView('MAIN')} className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white font-black rounded border border-slate-500 uppercase tracking-widest transition-transform hover:scale-105 w-full">BACK</button></>
                            )}
                            {menuView === 'EXIT_CONFIRM' && (
                                <><div className="text-2xl font-black text-white mb-2 uppercase tracking-widest drop-shadow-md">EXIT GAME</div><div className="text-sm font-bold text-slate-400 mb-6 uppercase tracking-wider">ARE YOU SURE?</div><div className="flex gap-4 justify-center"><button onClick={goToMenu} className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white font-black rounded border border-red-400 uppercase tracking-widest transition-transform hover:scale-105">YES</button><button onClick={() => setMenuView('MAIN')} className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white font-black rounded border border-slate-500 uppercase tracking-widest transition-transform hover:scale-105">NO</button></div></>
                            )}
                        </div>
                    </div>
                )}
                
                <CardModal hand={playerTurn ? hand : aiHand} activePlayer={playerTurn ? player : opponent} p1Stats={player} p2Stats={opponent} onPlay={handleCardPlay} onDiscard={handleCardDiscard} showCards={showCards} onClose={toggleCards} canAffordFn={canAfford} cardPlayedInTurn={cardPlayedInTurn} isLocked={isProcessingTurn || isCardAnimating} p1Name={`${P1_LABEL} CASTLE`} p2Name={`${P2_LABEL} CASTLE`} kingCards={playerTurn ? playerKingCards : opponentKingCards} playSFX={playSFX} getKingBuffs={getKingBuffs} getEffectiveCardCost={getEffectiveCardCost} p1Color={p1Color} p2Color={p2Color} activeColor={playerTurn ? p1Color : p2Color} />
            </div>
        </div>
    );
};

export default Game;
