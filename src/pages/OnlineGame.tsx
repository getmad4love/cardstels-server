
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import Card, { CardBackContent } from '../components/Card';
import { ResourceIndicator, FloatingText, AnimationOverlay } from '../components/GameUI';
import { TowerDisplay } from '../components/TowerDisplay';
import { PlayedCardShowcase, CardModal, KingSelectionOverlay, KingPowerShuffleVisual, DealingCardVisual } from '../components/Overlays';
import { GameOverPanel } from '../components/GameOver';
import { CARDS_DB_BASE, KING_CARDS_DB, getEffectiveCardCost, canAfford, playCardAction, getKingBuffs, activeKingBuff, calculateDamage } from '../data/cards';
import { CardType, PlayerStats, LobbyState, GameContext, GameStats } from '../types';
import { 
    BASE_WIDTH, BASE_HEIGHT, MAX_HAND_SIZE, PLAYER_COLORS, 
    START_TOWER, START_WALL, START_KING, START_RESOURCE, START_PROD, getTowerProductionBonus,
    WIN_TOWER, MAX_WALL, WIN_KING_MAX
} from '../utils/constants';
import { playSFX, resumeAudioContext, toggleMusic, toggleSfx } from '../utils/audioManager';
import { Logger } from '../utils/Logger';

// FORCE ONLINE SERVER
const SERVER_URL = 'https://cardstels-server.onrender.com';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const initialGameStats: GameStats = { 
    p1: { built: 0, dmg: 0, taken: 0, cardsUsed: 0, cardsDiscarded: 0, totalCost: 0 }, 
    p2: { built: 0, dmg: 0, taken: 0, cardsUsed: 0, cardsDiscarded: 0, totalCost: 0 },
    startTime: Date.now()
};

// Hook to track previous state for floating text diffs
const usePrevious = (value: any) => {
    const ref = useRef<any>(null);
    useEffect(() => { ref.current = value; });
    return ref.current;
};

// Helper to re-hydrate card data from ID
const hydrateCard = (card: any): CardType => {
    if (!card) return card;
    const dbCard = CARDS_DB_BASE.find(c => c.id == card.id) || KING_CARDS_DB.find(c => c.id == card.id);
    if (!dbCard) return card;
    return { ...dbCard, ...card }; 
};

// --- SUB-COMPONENTS ---

const LobbyChat = ({ messages, myName, onSend }: any) => {
    const [input, setInput] = useState("");
    const emojis = ["💀", "😂", "😭", "😡", "😎", "🧱", "⚔️", "💎", "🏰", "👑"];
    const scrollRef = useRef<HTMLDivElement>(null);

    const send = (txt: string) => {
        if (!txt.trim()) return;
        onSend(txt);
        setInput("");
    };

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    return (
        <div className="w-full h-full flex flex-col font-chivo overflow-hidden">
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 bg-black/20 min-h-0" ref={scrollRef}>
                {messages.length === 0 && <div className="text-stone-500 text-center italic text-xs mt-4 uppercase tracking-widest">No messages yet.</div>}
                {messages.map((m: any, i: number) => {
                    const isMe = m.senderName === myName;
                    return (
                        <div key={i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            <div className="text-[10px] text-stone-500 font-bold uppercase tracking-wide mb-0.5 px-1">{m.senderName}</div>
                            <div className={`px-3 py-1.5 rounded-xl text-sm font-bold max-w-[95%] break-words shadow-lg border-2 ${isMe ? 'bg-stone-800 text-white rounded-tr-none border-stone-600' : 'bg-black/60 text-stone-200 rounded-tl-none border-stone-800'}`}>
                                {m.text}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="p-2 bg-black/60 border-t border-white/5 backdrop-blur-md shrink-0">
                <div className="flex gap-2 mb-2 justify-center overflow-x-auto pb-1 custom-scrollbar">
                    {emojis.map(e => (
                        <button key={e} onClick={() => send(e)} className="text-2xl hover:scale-125 transition-transform hover:bg-white/10 rounded w-8 h-8 flex items-center justify-center">{e}</button>
                    ))}
                </div>
                <div className="flex gap-2">
                    <input 
                        className="flex-1 bg-stone-900/90 border-2 border-stone-700 rounded-lg px-3 py-2 text-white font-bold text-xs placeholder-stone-600 focus:outline-none focus:border-yellow-500 focus:bg-black transition-colors uppercase tracking-wider select-text"
                        placeholder="MESSAGE..."
                        maxLength={32}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && send(input)}
                    />
                    <button onClick={() => send(input)} className="bg-stone-800 hover:bg-lime-600 hover:text-black hover:border-lime-400 text-stone-300 px-4 py-2 rounded-lg font-black text-xs uppercase transition-all border-2 border-stone-600 shadow-lg">SEND</button>
                </div>
            </div>
        </div>
    );
};

const InGameChat = ({ onSend }: any) => {
    const [input, setInput] = useState("");
    const [showEmojis, setShowEmojis] = useState(false);
    const emojis = ["💀", "😂", "😭", "😡", "😎", "🏰", "⚔️", "🧱", "💎", "👑"];

    const send = (txt: string) => {
        if (!txt.trim()) return;
        onSend(txt);
        setInput("");
        setShowEmojis(false);
    };

    return (
        <div className="absolute left-[calc(50%+160px)] top-1/2 transform -translate-y-1/2 flex items-center gap-2 z-[1000] pointer-events-auto">
            {showEmojis && (
                <div className="absolute bottom-14 left-0 bg-stone-900 border-2 border-stone-600 p-2 rounded-xl grid grid-cols-5 gap-2 shadow-2xl w-80 animate-fade-in z-[1050]">
                    {emojis.map(e => (
                        <button key={e} onClick={() => send(e)} className="text-3xl hover:scale-125 transition-transform p-2 bg-stone-800 rounded hover:bg-white/10">{e}</button>
                    ))}
                </div>
            )}
            <button onClick={() => { playSFX('button_click'); setShowEmojis(!showEmojis); }} className="w-12 h-12 bg-stone-800 border-2 border-stone-600 rounded-xl flex items-center justify-center text-2xl hover:bg-stone-700 shadow-lg transition-transform hover:scale-105 active:scale-95 hover:border-white">😃</button>
            <input 
                className="w-56 bg-stone-900/90 border-2 border-stone-600 rounded-xl px-4 py-3 text-white font-bold uppercase text-sm placeholder-stone-500 focus:outline-none focus:border-yellow-500 shadow-inner select-text"
                placeholder="CHAT..."
                maxLength={32}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send(input)}
            />
            <button onClick={() => send(input)} className="bg-slate-700 px-4 py-3 rounded-xl font-black text-xs uppercase hover:bg-slate-600 border-2 border-slate-500 shadow-lg transition-transform hover:scale-105 active:scale-95">SEND</button>
        </div>
    );
};

// --- MAIN COMPONENT ---

const OnlineGame = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const roleParam = searchParams.get('role');
    const roomIdParam = searchParams.get('room');

    const socketRef = useRef<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    const [lobbyState, setLobbyState] = useState<LobbyState>({ p1: null, p2: null, messages: [] });
    const [myRole, setMyRole] = useState<'p1'|'p2'|null>(null);
    const myRoleRef = useRef<'p1'|'p2'|null>(null); 

    useEffect(() => { myRoleRef.current = myRole; }, [myRole]);
    
    const [gamePhase, setGamePhase] = useState<'LOBBY'|'KING_SELECTION'|'DEALING'|'PLAYING'|'WON'|'LOST'>('LOBBY');
    
    // --- GAME STATE ---
    const [p1Stats, setP1Stats] = useState<PlayerStats>({ tower: START_TOWER, wall: START_WALL, king: START_KING, bricks: START_RESOURCE, prodBricks: START_PROD, crystals: START_RESOURCE, prodCrystals: START_PROD, weapons: START_RESOURCE, prodWeapons: START_PROD, burn: 0, shield: 0 });
    const [p2Stats, setP2Stats] = useState<PlayerStats>({ tower: START_TOWER, wall: START_WALL, king: START_KING, bricks: START_RESOURCE, prodBricks: START_PROD, crystals: START_RESOURCE, prodCrystals: START_PROD, weapons: START_RESOURCE, prodWeapons: START_PROD, burn: 0, shield: 0 });
    
    // Uses the same logic as Game.tsx for floating text detection
    const prevP1 = usePrevious(p1Stats);
    const prevP2 = usePrevious(p2Stats);

    const [myHand, setMyHand] = useState<CardType[]>([]);
    const [deckCount, setDeckCount] = useState(0);
    
    const [kingSelectionState, setKingSelectionState] = useState<any>({ phase: 'IDLE', deck: [], drawn: [], shufflesLeft: 0 });
    const [p1KingCards, setP1KingCards] = useState<CardType[]>([]);
    const [p2KingCards, setP2KingCards] = useState<CardType[]>([]);

    const [turn, setTurn] = useState<'p1'|'p2'>('p1');
    const [log, setLog] = useState<{text: string, type: string, isRawHtml?: boolean}[]>([]);
    const [showCards, setShowCards] = useState(false);
    const [activeCard, setActiveCard] = useState<any>(null);
    const [activeAnimations, setActiveAnimations] = useState<any[]>([]);
    const [particles, setParticles] = useState<any[]>([]);
    const [floatingTexts, setFloatingTexts] = useState<any[]>([]);
    const [isSfxOn, setIsSfxOn] = useState(true);
    const [isMusicOn, setIsMusicOn] = useState(true);
    const [audioReady, setAudioReady] = useState(false);
    const [endGameReason, setEndGameReason] = useState("");
    const [screenShake, setScreenShake] = useState(false);
    const [damageFlash, setDamageFlash] = useState(false);
    const [winner, setWinner] = useState<'p1'|'p2'|null>(null);
    const [cardPlayedInTurn, setCardPlayedInTurn] = useState(0);
    const [isProcessingTurn, setIsProcessingTurn] = useState(false);
    const [lastDiscardedCard, setLastDiscardedCard] = useState<any>(null);
    const [menuView, setMenuView] = useState('NONE');
    const [discardInspectMode, setDiscardInspectMode] = useState(false);
    const [hoveredKingCard, setHoveredKingCard] = useState<CardType | null>(null);
    const [dealingCards, setDealingCards] = useState<any[]>([]);
    const [gameStats, setGameStats] = useState<GameStats>(initialGameStats);
    const [isInsertingKingPowers, setIsInsertingKingPowers] = useState(false);

    const [myNickname, setMyNickname] = useState("");
    const [myColorId, setMyColorId] = useState(0);
    const nickTimeoutRef = useRef<any>(null);
    const [lobbyMessages, setLobbyMessages] = useState<any[]>([]);

    const gameRef = useRef<HTMLDivElement>(null);
    const logEndRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const p1Profile = PLAYER_COLORS.find(c => c.id === (lobbyState.p1?.colorId ?? 0)) || PLAYER_COLORS[0];
    const p2Profile = PLAYER_COLORS.find(c => c.id === (lobbyState.p2?.colorId ?? 1)) || PLAYER_COLORS[1];
    
    const P1_LABEL = lobbyState.p1?.nickname || "PLAYER 1";
    const P2_LABEL = lobbyState.p2?.nickname || "PLAYER 2";
    
    const isMyTurn = turn === myRole;
    const myProfile = myRole === 'p1' ? p1Profile : p2Profile;

    const addLog = useCallback((msg: string, type = 'INFO', isRawHtml = false) => {
        let finalMsg = msg;
        if (msg.includes('PLAYER 1')) finalMsg = msg.replace(/PLAYER 1/g, `<span class="${p1Profile.text} font-black drop-shadow-sm">${P1_LABEL}</span>`);
        if (msg.includes('PLAYER 2')) finalMsg = msg.replace(/PLAYER 2/g, `<span class="${p2Profile.text} font-black drop-shadow-sm">${P2_LABEL}</span>`);
        
        setLog(prev => [...prev, { text: finalMsg, type, isRawHtml }]);
    }, [P1_LABEL, P2_LABEL, p1Profile, p2Profile]);

    const addFloatingText = useCallback((x: number, y: number, val: number, type: string, key: string | null = null, isDown = false) => {
        const id = Date.now().toString() + Math.random();
        setFloatingTexts(prev => [...prev, { id, x: x + (Math.random() - 0.5) * 80, y: y + (Math.random() - 0.5) * 50, val, type, key, variant: Math.floor(Math.random() * 3) + 1, isDown }]);
        setTimeout(() => setFloatingTexts(prev => prev.filter(t => t.id !== id)), 2500);
    }, []);

    // FIX: Auto-scroll console
    useEffect(() => {
        if (logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [log]);

    // --- SOCKET INIT ---
    useEffect(() => {
        if (socketRef.current) return;

        console.log("Connecting to:", SERVER_URL);
        const newSocket = io(SERVER_URL, {
            transports: ['websocket', 'polling'], 
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
        });
        socketRef.current = newSocket;

        newSocket.on('connect', () => {
            console.log("Connected to server with ID:", newSocket.id);
            setIsConnected(true);
            if (roleParam === 'host') {
                newSocket.emit('create_room', { roomId: roomIdParam, nickname: 'PLAYER 1', colorId: 0 });
                setMyRole('p1');
                setMyNickname('PLAYER 1');
                setMyColorId(0);
            } else {
                newSocket.emit('join_room', { roomId: roomIdParam, nickname: 'PLAYER 2', colorId: 1 });
                setMyRole('p2');
                setMyNickname('PLAYER 2');
                setMyColorId(1);
            }
        });

        newSocket.on('lobby_update', (room) => {
            setLobbyState(prev => ({ ...prev, p1: room.p1, p2: room.p2 }));
        });

        newSocket.on('chat_message', (msg) => {
            setLobbyMessages(prev => [...prev, msg]); 
            const profile = PLAYER_COLORS.find(c => c.id === msg.colorId);
            const colorClass = profile ? profile.text : 'text-gray-400';
            setLog(prev => [...prev, { text: `<span class="${colorClass} font-black uppercase tracking-wide">${msg.senderName}:</span> <span class="text-white font-bold ml-2">${msg.text}</span>`, type: 'CHAT', isRawHtml: true }]);
            playSFX('discard_click');
        });

        newSocket.on('king_selection_update', (data) => {
            setGamePhase('KING_SELECTION');
            const { phase, options, lastSelected, p1Kings, p2Kings } = data;
            
            // Handle last selected visual
            if (lastSelected) {
                const hydrated = hydrateCard(lastSelected.card);
                playSFX('play_card');
                let visualWho = 'opponent';
                if (myRoleRef.current === lastSelected.player) visualWho = 'player';
                setActiveCard({ card: { ...hydrated, isKing: true }, playedBy: visualWho, isKing: true });
                setTimeout(() => setActiveCard(null), 1500);
            }

            const currentRole = myRoleRef.current;

            if (phase === 'P1_CHOOSING') {
                if (currentRole === 'p1') {
                    setKingSelectionState({ phase: 'P1_CHOICE', deck: [], drawn: options.map(hydrateCard), shufflesLeft: 0 });
                } else {
                    // P2 sees P1 thinking - Pass dummy cards for visual "Card Backs"
                    setKingSelectionState({ phase: 'P1_WAITING', deck: [], drawn: [1,2,3], shufflesLeft: 0 });
                }
            } else if (phase === 'P2_CHOOSING') {
                if (currentRole === 'p2') {
                    setKingSelectionState({ phase: 'P2_CHOICE', deck: [], drawn: options.map(hydrateCard), shufflesLeft: 0 });
                } else {
                    // P1 sees P2 thinking
                    setKingSelectionState({ phase: 'P2_WAITING', deck: [], drawn: [1,2,3], shufflesLeft: 0 });
                }
            } else {
                setKingSelectionState({ phase: 'IDLE', deck: [], drawn: [], shufflesLeft: 0 });
            }
        });

        newSocket.on('start_dealing_sequence', async (data) => {
            setGamePhase('DEALING');
            setKingSelectionState({ phase: 'IDLE', deck: [], drawn: [], shufflesLeft: 0 });
            
            // Sync King Cards from Server (Critical Fix)
            if (data.p1Kings) setP1KingCards(data.p1Kings.map(hydrateCard));
            if (data.p2Kings) setP2KingCards(data.p2Kings.map(hydrateCard));

            const currentRole = myRoleRef.current;

            const cardsToAnimate: any[] = [];
            for(let i=0; i<6; i++) {
                cardsToAnimate.push({ card: {id:'back', type:-1, name:''}, player: currentRole === 'p1' ? 'player' : 'opponent', delay: i * 300 });
                cardsToAnimate.push({ card: {id:'back', type:-1, name:''}, player: currentRole === 'p2' ? 'player' : 'opponent', delay: i * 300 + 150 });
            }
            setDealingCards(cardsToAnimate);
            playSFX('bow');
            
            await delay(3000);
            setDealingCards([]);
            
            if (currentRole === 'p1') setMyHand(data.p1Hand.map(hydrateCard));
            else setMyHand(data.p2Hand.map(hydrateCard));
            
            setIsInsertingKingPowers(true);
            playSFX('magic');
            await delay(3500); 
            setIsInsertingKingPowers(false);
            
            // Only set to playing AFTER delays are done
            setGamePhase('PLAYING');
            setP1Stats(data.p1Stats);
            setP2Stats(data.p2Stats);
            setTurn('p1');
            setDeckCount(data.deckCount);
            
            playSFX('victory');
            addLog(Logger.system("ONLINE MATCH STARTED. GLHF!"), "INFO", true);
            addLog(Logger.turnStart(data.p1Nickname || "PLAYER 1", 1), "INFO", true);
        });

        newSocket.on('card_drawn', ({ card }) => {
            playSFX('play_card');
            const h = hydrateCard(card);
            setDealingCards([{ card: h, player: 'player', delay: 0 }]);
            setTimeout(() => {
                setMyHand(prev => [...prev, h]);
                setDealingCards([]);
            }, 600);
        });
        
        newSocket.on('opponent_drew_card', () => {
             playSFX('play_card');
             setDealingCards([{ card: {id:'back'}, player: 'opponent', delay: 0 }]);
             setTimeout(() => setDealingCards([]), 600);
        });
        
        newSocket.on('deck_count_update', (cnt) => {
            setDeckCount(cnt);
        });

        newSocket.on('state_sync', (data) => {
            // SYNC STATS
            setP1Stats(data.p1Stats);
            setP2Stats(data.p2Stats);
            setTurn(data.turn);
            if (data.deckCount !== undefined) setDeckCount(data.deckCount);
            
            const currentRole = myRoleRef.current;

            if (data.event) {
                if (data.event.type === 'PLAY_CARD') {
                    const card = CARDS_DB_BASE.find(c => c.id === data.event.cardId);
                    if (card) {
                        playSFX('play_card');
                        const p1Played = data.event.player === 'p1';
                        const visualWho = (currentRole === 'p1' && p1Played) || (currentRole === 'p2' && !p1Played) ? 'player' : 'opponent';
                        
                        setActiveCard({ card: { ...card, isKing: false }, playedBy: visualWho });
                        setTimeout(() => setActiveCard(null), 1200);
                        setLastDiscardedCard({ card, action: 'PLAY' });

                        if (card.desc.includes("ATTACK") || card.type === 1) {
                            triggerAnimation('PROJECTILE', visualWho === 'player' ? 'RIGHT' : 'LEFT');
                            setTimeout(() => {
                                playSFX('hit_wall');
                                spawnParticles(visualWho === 'player' ? window.innerWidth * 0.8 : window.innerWidth * 0.2, window.innerHeight * 0.6, 1, 'SPARK');
                            }, 600);
                        } else if (card.type === 0) {
                            playSFX('build_grow');
                        } else {
                            playSFX('magic');
                        }
                    }
                }
                if (data.event.type === 'DISCARD_CARD') {
                    const card = CARDS_DB_BASE.find(c => c.id === data.event.cardId);
                    if (card) {
                        setLastDiscardedCard({ card, action: 'DISCARD' });
                    }
                }
                if (data.event.type === 'END_TURN') {
                    // Only reset card played if it was MY turn ending, or if just syncing generally
                    // But if it was opponent ending turn, this enables my button.
                    setCardPlayedInTurn(0);
                }
            }

            // Sync Logs
            if (data.logs && Array.isArray(data.logs)) {
                data.logs.forEach((logItem: any) => {
                    const eventPlayer = data.event ? data.event.player : null;
                    // Prevent duplicate local logs if we already added them optimistically
                    if (eventPlayer && eventPlayer !== currentRole) {
                         addLog(logItem.text, logItem.type, logItem.isRawHtml);
                    }
                });
            }
        });

        newSocket.on('opponent_disconnected', () => {
            setEndGameReason("OPPONENT DISCONNECTED");
            const currentRole = myRoleRef.current;
            setWinner(currentRole); 
            setGamePhase('WON'); 
        });

        newSocket.on('host_left', () => {
            alert("Host left the lobby.");
            navigate('/');
        });

        return () => { 
            if (socketRef.current) {
                socketRef.current.disconnect(); 
                socketRef.current = null;
            }
        };
    }, []);

    // --- GAMEPLAY ACTIONS (CLIENT-AUTHORITATIVE LOGIC FOR 1:1 PARITY) ---

    const updateGameStats = useCallback((playerKey: string, category: string, amount: number) => {
        if (amount <= 0) return;
        setGameStats((prev: any) => { const next = { ...prev }; next[playerKey][category] += amount; return next; });
    }, []);

    const handleCardPlay = async (card: CardType) => {
        // FIX: Ensure phase is PLAYING to prevent premature moves
        if (!isMyTurn || isProcessingTurn || gamePhase !== 'PLAYING') return;
        setIsProcessingTurn(true);
        setShowCards(false);

        const isP1 = myRole === 'p1';
        
        // 1. Setup Context for Logic (Using current state)
        let localMe = isP1 ? { ...p1Stats } : { ...p2Stats };
        let localOp = isP1 ? { ...p2Stats } : { ...p1Stats };
        const myKingCards = isP1 ? p1KingCards : p2KingCards;
        const opKingCards = isP1 ? p2KingCards : p1KingCards;

        // 2. Prepare Cost String for Log (Before deduction)
        // FIX: Removed manual subtraction here! playCardAction handles deduction internally.
        const { costB, costW, costC } = getEffectiveCardCost(card, myKingCards);
        const costPaidStats = { ...localMe, bricks: localMe.bricks - costB, weapons: localMe.weapons - costW, crystals: localMe.crystals - costC };
        const costStr = Logger.formatCost(localMe, costPaidStats);

        const generatedLogs: any[] = [];
        
        // 3. Helper to update state during logic execution
        const setMe = (cb: any) => { localMe = typeof cb === 'function' ? cb(localMe) : cb; };
        const setOpponent = (cb: any) => { localOp = typeof cb === 'function' ? cb(localOp) : cb; };

        // 4. Update Hand Helper
        const mockContext: GameContext = {
            me: localMe,
            opponent: localOp,
            setMe,
            setOpponent,
            myHand: myHand, 
            setMyHand: setMyHand,
            myKingCards,
            opponentKingCards: opKingCards,
            addLog: (msg, type, isHtml) => {
                addLog(msg, type || (isP1 ? 'PLAYER' : 'OPPONENT'), isHtml);
                generatedLogs.push({ text: msg, type: type || (isP1 ? 'PLAYER' : 'OPPONENT'), isRawHtml: isHtml });
            },
            playSFX: () => {}, // Visuals handled by event emission
            triggerAnimation: () => {},
            spawnParticles: () => {},
            updateStats: (pk, cat, amt) => updateGameStats(pk, cat, amt),
            triggerKingPowerSequence: async () => {}, // TODO: Online King Power
            returnCardToBottom: () => {}, // Server handles deck
            isP1: isP1,
            labels: { p1: P1_LABEL, p2: P2_LABEL }
        };

        // 5. Generate Main Log & Add Locally
        const playLog = { 
            text: Logger.cardPlayed(isP1 ? P1_LABEL : P2_LABEL, card, costStr), 
            type: isP1 ? 'PLAYER' : 'OPPONENT',
            isRawHtml: true
        };
        addLog(playLog.text, playLog.type, playLog.isRawHtml);

        // 6. Run Logic (Same as Local Game)
        await playCardAction(card, mockContext);

        // 7. Visuals
        playSFX('play_card');
        setActiveCard({ card: { ...card, isKing: false }, playedBy: 'player' });
        setTimeout(() => setActiveCard(null), 1200);
        
        if (card.desc.includes("ATTACK") || card.type === 1) {
            triggerAnimation('PROJECTILE', 'RIGHT');
            setTimeout(() => {
                playSFX('hit_wall');
                spawnParticles(window.innerWidth * 0.8, window.innerHeight * 0.6, 1, 'SPARK');
            }, 600);
        } else if (card.type === 0) {
            playSFX('build_grow');
        } else {
            playSFX('magic');
        }

        // 8. Emit Result to Server (Source of Truth)
        if (socketRef.current) {
            socketRef.current.emit('game_action', {
                roomId: roomIdParam,
                action: 'PLAY_CARD',
                payload: {
                    card,
                    newP1Stats: isP1 ? localMe : localOp,
                    newP2Stats: isP1 ? localOp : localMe,
                    logs: [playLog, ...generatedLogs]
                }
            });
        }
        
        setCardPlayedInTurn(1);
        setIsProcessingTurn(false);
    };

    const handleCardDiscard = (card: CardType) => {
        // FIX: Ensure phase is PLAYING
        if (!isMyTurn || isProcessingTurn || gamePhase !== 'PLAYING') return;
        setIsProcessingTurn(true);
        setShowCards(false);

        const isP1 = myRole === 'p1';
        
        // Remove from hand
        const nextHand = myHand.filter(c => c.uniqueId !== card.uniqueId);
        setMyHand(nextHand);

        const discardLog = {
            text: Logger.cardDiscarded(isP1 ? P1_LABEL : P2_LABEL, card),
            type: isP1 ? 'PLAYER' : 'OPPONENT',
            isRawHtml: true
        };
        
        // Optimistic Log
        addLog(discardLog.text, discardLog.type, discardLog.isRawHtml);

        playSFX('play_card');
        setLastDiscardedCard({ card, action: 'DISCARD' });

        if (socketRef.current) {
            socketRef.current.emit('game_action', {
                roomId: roomIdParam,
                action: 'DISCARD_CARD',
                payload: {
                    card,
                    newP1Stats: p1Stats, 
                    newP2Stats: p2Stats,
                    logs: [discardLog]
                }
            });
        }

        setCardPlayedInTurn(1);
        setIsProcessingTurn(false);
    };

    const handleEndTurn = async () => {
        // FIX: Ensure phase is PLAYING and it's definitely my turn
        if (!isMyTurn || isProcessingTurn || gamePhase !== 'PLAYING') return;
        setIsProcessingTurn(true);

        const isP1 = myRole === 'p1';
        let localMe = isP1 ? { ...p1Stats } : { ...p2Stats };
        let localOp = isP1 ? { ...p2Stats } : { ...p1Stats };
        const myKings = isP1 ? p1KingCards : p2KingCards;
        
        const logs: any[] = [];

        // 1. Production Logic
        const towerBonus = getTowerProductionBonus(localMe.tower);
        const totalB = localMe.prodBricks + towerBonus;
        const totalW = localMe.prodWeapons + towerBonus;
        const totalC = localMe.prodCrystals + towerBonus;

        localMe.bricks += totalB;
        localMe.weapons += totalW;
        localMe.crystals += totalC;

        const prodLog = { 
            text: Logger.production(isP1 ? P1_LABEL : P2_LABEL, totalB, totalW, totalC, true),
            type: isP1 ? 'PLAYER' : 'OPPONENT',
            isRawHtml: true 
        };
        logs.push(prodLog);
        addLog(prodLog.text, prodLog.type, prodLog.isRawHtml);

        // 2. Archer Logic (End of Turn)
        if (localMe.wall >= 50) {
            const dmg = Math.min(5, Math.floor((localMe.wall - 40) / 10));
            triggerAnimation('ARROW_LOB', 'RIGHT'); // Always visual right for me
            await delay(800);
            
            // Calculate damage on opponent locally
            if (localOp.shield > 0) {
                playSFX('hit_wall');
                const blkLog = { text: Logger.special(isP1 ? P2_LABEL : P1_LABEL, "SHIELD BLOCKED ARCHER!"), type: 'WARNING', isRawHtml: true };
                logs.push(blkLog);
                addLog(blkLog.text, blkLog.type, blkLog.isRawHtml);
            } else {
                const oldOp = { ...localOp };
                localOp = calculateDamage(localOp, dmg);
                const diffLog = Logger.diff(oldOp, localOp, false);
                if (diffLog) {
                    const dLog = { text: `${isP1 ? P2_LABEL : P1_LABEL}: ${diffLog}`, type: 'OPPONENT', isRawHtml: true };
                    logs.push(dLog);
                    addLog(dLog.text, dLog.type, dLog.isRawHtml);
                }
            }
        }

        if (socketRef.current) {
            socketRef.current.emit('game_action', {
                roomId: roomIdParam,
                action: 'END_TURN',
                payload: {
                    newP1Stats: isP1 ? localMe : localOp,
                    newP2Stats: isP1 ? localOp : localMe,
                    logs
                }
            });
        }
        
        setIsProcessingTurn(false);
        setCardPlayedInTurn(0);
    };

    // --- VISUAL EFFECTS ---
    
    // Trigger effects on stat changes (Syncs floating text for both players)
    useEffect(() => {
        if (!prevP1 || !prevP2 || !gameRef.current) return;
        const checkDiff = (curr: any, prev: any, prefix: string, isPlayerStats: boolean) => {
            const props = [{ key: 'tower', sel: `${prefix}-tower`, type: 'TOWER' }, { key: 'wall', sel: `${prefix}-wall`, type: 'WALL' }, { key: 'king', sel: `${prefix}-king`, type: 'KING' }, { key: 'bricks', sel: `${prefix}-res-bricks`, type: 'RES' }, { key: 'weapons', sel: `${prefix}-res-weapons`, type: 'RES' }, { key: 'crystals', sel: `${prefix}-res-crystals`, type: 'RES' }];
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
                        
                        // Visually flip if it's the opponent
                        const isDown = !isPlayerStats; 
                        addFloatingText(internalX / scale, internalY / scale, diff, p.type, p.key, isDown);
                        
                        if (diff < 0) { if (['TOWER', 'WALL', 'KING'].includes(p.type)) for(let i=0; i<10; i++) spawnSmoke(internalX / scale, internalY / scale, scale); }
                    }
                }
            });
        };
        // P1 Stats (Player 1 is left for P1, Right for P2 - Visual mapping needed?)
        // Actually, OnlineGame component renders: P1 Left, P2 Right always.
        // So checking P1 stats always maps to 'p' prefix elements, P2 to 'o' prefix.
        checkDiff(p1Stats, prevP1, 'p', true); 
        checkDiff(p2Stats, prevP2, 'o', false);
    }, [p1Stats, p2Stats, prevP1, prevP2]);

    // Standard Animation Helpers
    const triggerAnimation = (type: string, direction: string) => { const id = Date.now(); setActiveAnimations(prev => [...prev, { id, type, direction }]); setTimeout(() => setActiveAnimations(prev => prev.filter(a => a.id !== id)), type === 'PROJECTILE' ? 600 : 1000); };
    const spawnParticles = (x: number, y: number, scale: number, type: string) => { const idBase = Date.now().toString() + Math.random().toString(); const newPs = Array.from({length: 10}).map((_, i) => ({ id: idBase + i, x: x + (Math.random() - 0.5) * 40, y: y + (Math.random() - 0.5) * 40, type: type, color: type === 'SPARK' ? '#fbbf24' : '#ffffff', tx: `${(Math.random() - 0.5) * 200}px`, ty: `${(Math.random() * 200) + 100}px`, rot: `${Math.random() * 360}deg` })); setParticles(prev => [...prev, ...newPs]); setTimeout(() => setParticles(prev => prev.filter(p => !p.id.startsWith(idBase))), 800); };
    const spawnSmoke = (x: number, y: number, scale: number) => { const id = Date.now().toString() + Math.random().toString(); setParticles(prev => [...prev, { id, x: x + (Math.random() * 40 - 20), y: y + (Math.random() * 40 - 20), type: 'SMOKE' }]); setTimeout(() => setParticles(prev => prev.filter(p => p.id !== id)), 800); };
    const handleDealAnimationEnd = useCallback((uniqueId: string) => { setDealingCards(prev => prev.filter(c => c.card.uniqueId !== uniqueId)); }, []);
    
    // --- LOBBY HANDLERS ---
    const handleNickChange = (e: any) => { const val = e.target.value.toUpperCase(); setMyNickname(val); if (nickTimeoutRef.current) clearTimeout(nickTimeoutRef.current); nickTimeoutRef.current = setTimeout(() => { if (socketRef.current) { socketRef.current.emit('update_lobby_settings', { roomId: roomIdParam, nickname: val }); } }, 500); };
    const handleColorChange = (id: number) => { setMyColorId(id); if (socketRef.current) { socketRef.current.emit('update_lobby_settings', { roomId: roomIdParam, colorId: id }); } };
    const toggleReady = () => { playSFX('button_click'); const amReady = myRole === 'p1' ? lobbyState.p1?.isReady : lobbyState.p2?.isReady; if (socketRef.current) { socketRef.current.emit('toggle_ready', { roomId: roomIdParam, isReady: !amReady }); } };
    const sendLobbyChat = (text: string) => { if (socketRef.current) { socketRef.current.emit('lobby_chat', { roomId: roomIdParam, message: text }); } };
    const initGame = () => { const deckList: CardType[] = []; CARDS_DB_BASE.forEach(card => { if (card.id === 42) return; const count = card.count || 1; for (let i = 0; i < count; i++) deckList.push({ ...card, uniqueId: Math.random().toString(36).substr(2, 9) }); }); const initialStats = { tower: START_TOWER, wall: START_WALL, king: START_KING, bricks: START_RESOURCE, prodBricks: START_PROD, crystals: START_RESOURCE, prodCrystals: START_PROD, weapons: START_RESOURCE, prodWeapons: START_PROD, burn: 0, shield: 0 }; if (socketRef.current) { console.log("Emitting Init Game Setup..."); socketRef.current.emit('init_game_setup', { roomId: roomIdParam, kingDeck: KING_CARDS_DB.filter(c => !['k_big', 'k_son', 'k_hoard', 'k_ind', 'k_bunk'].includes(c.id as string)), mainDeck: deckList, initialStats }); } };
    const handleKingSelect = (card: CardType) => { if (socketRef.current) { socketRef.current.emit('select_king_card', { roomId: roomIdParam, card }); } };
    const handleKingDraw = () => { if (kingSelectionState.phase === 'P1_CHOICE' && myRole !== 'p1') return; if (kingSelectionState.phase === 'P2_CHOICE' && myRole !== 'p2') return; playSFX('play_card'); const currentPhase = kingSelectionState.phase; if (currentPhase === 'P1_CHOICE') { setKingSelectionState(prev => ({ ...prev, phase: 'P1_VIEW' })); } else if (currentPhase === 'P2_CHOOSING' || currentPhase === 'P2_CHOICE') { setKingSelectionState(prev => ({ ...prev, phase: 'P2_VIEW' })); } };
    const handleResize = useCallback(() => { if (!gameRef.current) return; const windowWidth = window.innerWidth; const windowHeight = window.innerHeight; const scale = Math.min(windowWidth / BASE_WIDTH, windowHeight / BASE_HEIGHT); gameRef.current.style.transform = `scale(${scale})`; gameRef.current.style.left = `${(windowWidth - BASE_WIDTH * scale) / 2}px`; gameRef.current.style.top = `${((windowHeight - BASE_HEIGHT * scale) / 2) < 0 ? 0 : (windowHeight - BASE_HEIGHT * scale) / 2}px`; }, []);
    useEffect(() => { window.addEventListener('resize', handleResize); window.addEventListener('orientationchange', handleResize); handleResize(); return () => { window.removeEventListener('resize', handleResize); window.removeEventListener('orientationchange', handleResize); }; }, [handleResize]);

    // Check Win/Loss
    useEffect(() => { if (gamePhase !== 'PLAYING') return; let p1Wins = false; let p2Wins = false; let reason = ""; if (p1Stats.king >= 100) { p1Wins = true; reason = `${P1_LABEL} KING REACHED MAX POWER!`; } else if (p1Stats.tower >= 150) { p1Wins = true; reason = `${P1_LABEL} TOWER REACHED MAX HEIGHT!`; } else if (p1Stats.wall >= 200) { p1Wins = true; reason = `${P1_LABEL} WALL UNBREAKABLE!`; } else if (p2Stats.king <= 0) { p1Wins = true; reason = `${P2_LABEL} KING DESTROYED!`; } if (p2Stats.king >= 100) { p2Wins = true; reason = `${P2_LABEL} KING REACHED MAX POWER!`; } else if (p2Stats.tower >= 150) { p2Wins = true; reason = `${P2_LABEL} TOWER REACHED MAX HEIGHT!`; } else if (p2Stats.wall >= 200) { p2Wins = true; reason = `${P2_LABEL} WALL UNBREAKABLE!`; } else if (p1Stats.king <= 0) { p2Wins = true; reason = `${P1_LABEL} KING DESTROYED!`; } if (p1Wins) { setWinner('p1'); setEndGameReason(reason); setGamePhase('WON'); playSFX('victory'); } else if (p2Wins) { setWinner('p2'); setEndGameReason(reason); setGamePhase('WON'); playSFX('victory'); } }, [p1Stats, p2Stats, gamePhase, P1_LABEL, P2_LABEL]);

    return (
        <div id="game-scaler" ref={gameRef} className="bg-stone-950 shadow-2xl overflow-hidden relative select-none" onClick={() => resumeAudioContext(setAudioReady)} style={{ width: BASE_WIDTH, height: BASE_HEIGHT, position: 'absolute', transformOrigin: '0 0' }}>
            <div className="scanlines-overlay"></div>
            
            {gamePhase === 'LOBBY' ? (
                <div className="w-full h-full relative overflow-hidden flex flex-col items-center justify-center">
                    <div className="lava-lamp-bg absolute inset-0 z-0"><div className="lava-blob blob-1"></div><div className="lava-blob blob-2"></div><div className="lava-blob blob-3"></div><div className="lava-blob blob-4"></div><div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"></div></div>
                    <div className="z-10 w-[95%] h-[90%] bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden animate-fade-in relative">
                        <div className="absolute inset-0 pattern-luxury opacity-30 pointer-events-none"></div>
                        <div className="w-full py-3 bg-black/40 border-b border-white/10 flex items-center justify-between px-8 shrink-0 relative z-20">
                            <div className="flex items-center gap-4"><h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-stone-200 to-stone-500 tracking-widest uppercase drop-shadow-lg">ONLINE LOBBY</h1><div className="flex items-center gap-2 text-stone-400 font-bold tracking-widest text-xs uppercase bg-black/50 px-3 py-1 rounded border border-white/10"><span>ROOM CODE:</span><span className="text-xl text-lime-400 font-mono select-all select-text">{roomIdParam}</span></div></div>
                            <button onClick={() => navigate('/')} className="text-stone-500 hover:text-red-500 font-bold tracking-widest text-xs border border-stone-700 hover:border-red-500 px-4 py-2 rounded transition-all">LEAVE ROOM</button>
                        </div>
                        <div className="flex-1 grid grid-cols-[300px_1fr_300px] gap-0 overflow-hidden relative z-20">
                            <div className="flex flex-col border-r border-white/10 bg-black/20 relative">
                                {lobbyState.p1 ? (
                                    <div className="flex flex-col h-full p-4 items-center">
                                        <div className="w-full text-center border-b border-white/5 pb-2 mb-4"><h2 className="text-sm font-black text-stone-500 uppercase tracking-[0.2em]">PLAYER 1 (HOST)</h2></div>
                                        <div className={`w-24 h-24 rounded-full border-4 shadow-xl mb-4 relative flex items-center justify-center bg-stone-900 ${lobbyState.p1.isReady ? 'border-lime-500 shadow-lime-500/20' : 'border-stone-700'}`}><div className={`w-16 h-16 rounded-full ${PLAYER_COLORS[lobbyState.p1.colorId]?.bg}`}></div>{lobbyState.p1.isReady && <div className="absolute -bottom-1 -right-1 bg-lime-500 text-black w-8 h-8 rounded-full flex items-center justify-center font-bold text-lg border-2 border-white">✓</div>}</div>
                                        {myRole === 'p1' ? (<input className="w-full bg-black/40 border border-stone-600 rounded px-3 py-2 text-white font-black text-lg text-center uppercase focus:border-lime-500 transition-all outline-none mb-4" value={myNickname} maxLength={12} onChange={handleNickChange} placeholder="ENTER NAME" />) : (<div className="text-2xl font-black text-white uppercase tracking-wider mb-4">{lobbyState.p1.nickname}</div>)}
                                        {myRole === 'p1' && (<div className="grid grid-cols-4 gap-2 mb-6 w-full px-2">{PLAYER_COLORS.map(c => (<button key={c.id} onClick={() => handleColorChange(c.id as number)} disabled={lobbyState.p2?.colorId === c.id} className={`aspect-square rounded border-2 flex items-center justify-center ${myColorId === c.id ? 'border-white scale-110 z-10 shadow-lg' : (lobbyState.p2?.colorId === c.id ? 'border-stone-800 opacity-20 grayscale' : 'border-transparent bg-stone-800/50 hover:bg-stone-700')}`}><div className={`w-3 h-3 rounded-full ${c.bg}`}></div></button>))}</div>)}
                                        <div className="mt-auto w-full">{myRole === 'p1' ? (<button onClick={toggleReady} className={`w-full py-3 rounded-lg font-black text-base uppercase tracking-[0.2em] transition-all border shadow-lg ${lobbyState.p1.isReady ? 'bg-red-600 border-red-400 text-white hover:bg-red-500' : 'bg-lime-600 border-lime-400 text-black hover:bg-lime-500'}`}>{lobbyState.p1.isReady ? 'CANCEL' : 'READY UP'}</button>) : (<div className={`w-full py-2 text-center font-bold text-xs uppercase tracking-widest rounded border ${lobbyState.p1.isReady ? 'bg-lime-500/10 text-lime-400 border-lime-500/30' : 'bg-stone-800 text-stone-500 border-stone-700'}`}>{lobbyState.p1.isReady ? 'READY' : 'NOT READY'}</div>)}</div>
                                    </div>
                                ) : (<div className="flex-1 flex flex-col items-center justify-center text-stone-600 font-bold uppercase tracking-widest text-xs">Waiting...</div>)}
                            </div>
                            <div className="flex flex-col h-full bg-black/10 overflow-hidden">
                                <div className="flex-1 flex flex-col overflow-hidden relative"><div className="absolute top-0 left-0 w-full h-8 bg-gradient-to-b from-black/20 to-transparent z-10 pointer-events-none"></div><LobbyChat messages={lobbyMessages} myName={myNickname} onSend={sendLobbyChat} /></div>
                                <div className="p-4 border-t border-white/5 bg-stone-900/40 shrink-0">{myRole === 'p1' ? (<button onClick={initGame} disabled={!lobbyState.p1?.isReady || !lobbyState.p2?.isReady} className={`w-full py-4 rounded-xl font-black text-2xl uppercase tracking-[0.3em] transition-all shadow-xl border-2 ${(!lobbyState.p1?.isReady || !lobbyState.p2?.isReady) ? 'bg-stone-800 border-stone-700 text-stone-600 cursor-not-allowed opacity-50' : 'bg-gradient-to-r from-yellow-400 to-amber-500 border-yellow-300 text-black hover:scale-105 hover:shadow-[0_0_30px_gold] animate-pulse'}`}>START MATCH</button>) : (<div className="w-full py-4 text-center text-stone-500 font-bold text-xs uppercase tracking-widest border border-white/5 rounded-xl bg-black/20">WAITING FOR HOST TO START</div>)}</div>
                            </div>
                            <div className="flex flex-col border-l border-white/10 bg-black/20 relative">
                                {lobbyState.p2 ? (
                                    <div className="flex flex-col h-full p-4 items-center">
                                        <div className="w-full text-center border-b border-white/5 pb-2 mb-4"><h2 className="text-sm font-black text-stone-500 uppercase tracking-[0.2em]">PLAYER 2</h2></div>
                                        <div className={`w-24 h-24 rounded-full border-4 shadow-xl mb-4 relative flex items-center justify-center bg-stone-900 ${lobbyState.p2.isReady ? 'border-lime-500 shadow-lime-500/20' : 'border-stone-700'}`}><div className={`w-16 h-16 rounded-full ${PLAYER_COLORS[lobbyState.p2.colorId]?.bg}`}></div>{lobbyState.p2.isReady && <div className="absolute -bottom-1 -right-1 bg-lime-500 text-black w-8 h-8 rounded-full flex items-center justify-center font-bold text-lg border-2 border-white">✓</div>}</div>
                                        {myRole === 'p2' ? (<input className="w-full bg-black/40 border border-stone-600 rounded px-3 py-2 text-white font-black text-lg text-center uppercase focus:border-lime-500 transition-all outline-none mb-4" value={myNickname} maxLength={12} onChange={handleNickChange} placeholder="ENTER NAME" />) : (<div className="text-2xl font-black text-white uppercase tracking-wider mb-4">{lobbyState.p2.nickname}</div>)}
                                        {myRole === 'p2' && (<div className="grid grid-cols-4 gap-2 mb-6 w-full px-2">{PLAYER_COLORS.map(c => (<button key={c.id} onClick={() => handleColorChange(c.id as number)} disabled={lobbyState.p1?.colorId === c.id} className={`aspect-square rounded border-2 flex items-center justify-center ${myColorId === c.id ? 'border-white scale-110 z-10 shadow-lg' : (lobbyState.p1?.colorId === c.id ? 'border-stone-800 opacity-20 grayscale' : 'border-transparent bg-stone-800/50 hover:bg-stone-700')}`}><div className={`w-3 h-3 rounded-full ${c.bg}`}></div></button>))}</div>)}
                                        <div className="mt-auto w-full">{myRole === 'p2' ? (<button onClick={toggleReady} className={`w-full py-3 rounded-lg font-black text-base uppercase tracking-[0.2em] transition-all border shadow-lg ${lobbyState.p2.isReady ? 'bg-red-600 border-red-400 text-white hover:bg-red-500' : 'bg-lime-600 border-lime-400 text-black hover:bg-lime-500'}`}>{lobbyState.p2.isReady ? 'CANCEL' : 'READY UP'}</button>) : (<div className={`w-full py-2 text-center font-bold text-xs uppercase tracking-widest rounded border ${lobbyState.p2.isReady ? 'bg-lime-500/10 text-lime-400 border-lime-500/30' : 'bg-stone-800 text-stone-500 border-stone-700'}`}>{lobbyState.p2.isReady ? 'READY' : 'NOT READY'}</div>)}</div>
                                    </div>
                                ) : (<div className="flex-1 flex flex-col items-center justify-center opacity-50"><div className="w-16 h-16 rounded-full border-4 border-stone-700 border-dashed mb-4 flex items-center justify-center text-2xl text-stone-700">?</div><div className="text-stone-600 font-bold uppercase tracking-widest text-xs">WAITING FOR P2...</div></div>)}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div id="game-stage" className={`w-full h-full flex flex-col ${screenShake ? 'shake-screen' : ''}`}>
                    <canvas ref={canvasRef} width={1280} height={720} className="absolute inset-0 pointer-events-none z-[60]" />
                    <div className={`absolute inset-0 bg-red-500/20 pointer-events-none z-[100] transition-opacity duration-300 ${damageFlash ? 'opacity-100' : 'opacity-0'}`}></div>
                    
                    {gamePhase === 'KING_SELECTION' && (
                        <KingSelectionOverlay 
                            state={kingSelectionState} 
                            onSelect={handleKingSelect} 
                            isMultiplayer={true} 
                            onShuffle={() => {}} 
                            onDraw={handleKingDraw}
                        />
                    )}

                    {isInsertingKingPowers && <KingPowerShuffleVisual onAnimationEnd={() => {}} />}

                    {floatingTexts.map(ft => <FloatingText key={ft.id} text={ft} />)}
                    {particles.map(p => (<div key={p.id} className={p.type === 'SMOKE' ? 'damage-smoke' : (p.type === 'GLASS' ? 'particle-shard' : 'particle')} style={{ left: p.x, top: p.y, ...(p.type !== 'SMOKE' ? { backgroundColor: p.color, '--tx': p.tx, '--ty': p.ty, '--rot': p.rot } : {}) }} />))}
                    <AnimationOverlay animations={activeAnimations} />
                    <PlayedCardShowcase activeCard={activeCard} isMultiplayer={true} activeKingBuff={activeCard ? getKingBuffs(activeCard.card, activeCard.playedBy === 'player' ? p1KingCards : p2KingCards, activeCard.playedBy === 'player' ? p1Stats : p2Stats, activeCard.playedBy === 'player' ? p2Stats : p1Stats) : null} onClose={() => setActiveCard(null)} />
                    {winner && <GameOverPanel gameState={winner === myRole ? 'WON' : 'LOST'} endGameReason={endGameReason} stats={gameStats} onRestart={() => navigate('/')} onMenu={() => navigate('/')} winner={winner} p1Profile={p1Profile} p2Profile={p2Profile} runTime="00:00" isTowerMode={false} isEndlessMode={false} stageNumber={1} />}

                    {dealingCards.length > 0 && (
                        <div className="absolute inset-0 z-[80] flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40"><div className={`card-size card-back-pattern rounded-xl shadow-xl flex items-center justify-center relative overflow-hidden bg-stone-950`}><CardBackContent /></div></div>
                            {dealingCards.map((deal, index) => (<DealingCardVisual key={index} startPlayer={deal.player} card={deal.card} delayTime={deal.delay} isReturning={false} onAnimationEnd={handleDealAnimationEnd} />))}
                        </div>
                    )}

                    {menuView !== 'NONE' && (
                        <div className="absolute inset-0 z-[2000] bg-black/80 backdrop-blur-sm flex items-center justify-center animate-fade-in">
                            <div className="bg-slate-900 p-8 rounded-xl border-2 border-slate-700 text-center shadow-2xl max-w-sm w-full transform scale-100">
                                {menuView === 'MAIN' && (
                                    <><div className="text-2xl font-black text-cyan-400 mb-6 uppercase tracking-widest drop-shadow-md">GAME MENU</div><div className="flex flex-col gap-4"><button onClick={() => setMenuView('NONE')} className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-black rounded border border-slate-500 uppercase tracking-widest transition-transform hover:scale-105">RESUME</button><button onClick={() => setMenuView('EXIT_CONFIRM')} className="px-6 py-3 bg-red-700 hover:bg-red-600 text-white font-black rounded border border-red-500 uppercase tracking-widest transition-transform hover:scale-105">EXIT TO MENU</button></div></>
                                )}
                                {menuView === 'EXIT_CONFIRM' && (
                                    <><div className="text-2xl font-black text-white mb-2 uppercase tracking-widest drop-shadow-md">EXIT GAME</div><div className="text-sm font-bold text-slate-400 mb-6 uppercase tracking-wider">ARE YOU SURE?</div><div className="flex gap-4 justify-center"><button onClick={() => navigate('/')} className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white font-black rounded border border-red-400 uppercase tracking-widest transition-transform hover:scale-105">YES</button><button onClick={() => setMenuView('MAIN')} className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white font-black rounded border border-slate-500 uppercase tracking-widest transition-transform hover:scale-105">NO</button></div></>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="flex bg-stone-950/90 border-b border-white/10 h-14 shadow-xl z-400 relative items-center justify-between px-6 shrink-0 w-full mt-0 backdrop-blur-md">
                        <div className="flex items-center gap-4">
                            <button onClick={() => toggleSfx(setIsSfxOn)} className={`w-8 h-8 rounded flex items-center justify-center transition-all ${isSfxOn ? 'text-stone-200 bg-white/10 border border-white/20' : 'text-stone-600 border border-stone-800'}`}>{isSfxOn ? "🔊" : "🔇"}</button>
                            <button onClick={() => toggleMusic(setIsMusicOn)} className={`w-8 h-8 rounded flex items-center justify-center transition-all ${isMusicOn ? 'text-stone-200 bg-white/10 border border-white/20' : 'text-stone-600 border border-stone-800'}`}>{isMusicOn ? "🎵" : "❌"}</button>
                            <button onClick={() => { playSFX('button_click'); setMenuView('MAIN'); }} className="px-4 h-8 rounded text-[10px] font-bold uppercase tracking-[0.2em] border border-white/10 hover:border-white/40 hover:bg-white/5 transition-all text-stone-400 hover:text-white ml-2" title="MENU">MENU</button>
                            <div className="ml-4 flex items-baseline gap-2 select-none opacity-80"><h1 className="text-2xl font-black font-chivo tracking-widest text-stone-400 uppercase">Cardstels</h1> <span className="text-xs font-bold text-stone-600 uppercase tracking-wide">ONLINE</span></div>
                        </div>
                        <div className="flex items-center gap-4">
                            <h1 className={`text-[20px] font-extrabold tracking-[0.2em] uppercase ${p2Profile.text}`}>{P2_LABEL} RESOURCES:</h1>
                            <div className="flex gap-2 transform scale-90 origin-right">
                                <ResourceIndicator id="o-res-bricks" label="BRICKS" value={p2Stats.bricks} production={p2Stats.prodBricks} icon="🧱" />
                                <ResourceIndicator id="o-res-weapons" label="WEAPONS" value={p2Stats.weapons} production={p2Stats.prodWeapons} icon="⚔️" />
                                <ResourceIndicator id="o-res-crystals" label="CRYSTALS" value={p2Stats.crystals} production={p2Stats.prodCrystals} icon="💎" />
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 flex items-end justify-center bg-black relative">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_var(--tw-gradient-stops))] from-stone-900 via-black to-black opacity-100 z-0"></div>
                        <div className="overlay-checker-texture"></div>
                        <div className="absolute inset-0 pattern-grid-fading origin-bottom"></div>

                        {turn === 'p1' ? (
                            <div className="absolute top-4 left-6 z-30 transition-all duration-500"><div className="flex items-center gap-3"><div className="relative"><div className={`w-4 h-4 rounded-full animate-pulse z-10 relative ${p1Profile.bg}`}></div><div className={`absolute inset-0 rounded-full animate-ping opacity-75 ${p1Profile.bg}`}></div></div><span className={`text-2xl font-black italic tracking-widest font-chivo uppercase ${p1Profile.text} drop-shadow-md`}>{P1_LABEL} TURN</span></div></div>
                        ) : (
                            <div className="absolute top-4 right-6 z-30 transition-all duration-500"><div className="flex items-center gap-3 flex-row-reverse"><div className="relative"><div className={`w-4 h-4 rounded-full animate-pulse z-10 relative ${p2Profile.bg}`}></div><div className={`absolute inset-0 rounded-full animate-ping opacity-75 ${p2Profile.bg}`}></div></div><span className={`text-2xl font-black italic tracking-widest font-chivo uppercase ${p2Profile.text} drop-shadow-md`}>{P2_LABEL} TURN</span></div></div>
                        )}

                        <div className="absolute bottom-6 left-10 z-30 flex flex-col items-center pointer-events-auto transition-all duration-500">
                            <div className={`flex flex-col-reverse gap-3 p-2.5 bg-black/80 backdrop-blur-xl rounded-2xl border-2 ${p1Profile.border} relative overflow-hidden transition-all hover:scale-105`}>
                                <div className={`absolute inset-0 ${p1Profile.bg} opacity-10 pointer-events-none`}></div>
                                {[...Array(5)].map((_, i) => (
                                    <div key={i} className="relative w-14 h-14 z-10">
                                        {p1KingCards[i] ? (<div className="w-full h-full rounded-xl bg-gradient-to-br from-yellow-900 via-amber-700 to-yellow-950 border-2 border-yellow-400 text-yellow-300 shadow-[0_0_15px_rgba(234,179,8,0.5)] flex items-center justify-center text-3xl cursor-help group" onMouseEnter={() => setHoveredKingCard(p1KingCards[i])} onMouseLeave={() => setHoveredKingCard(null)}><span className="filter drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">{p1KingCards[i].img || "👑"}</span></div>) : (<div className={`w-full h-full rounded-xl border-2 border-dashed flex items-center justify-center opacity-30 ${p1Profile.border}`}></div>)}
                                    </div>
                                ))}
                            </div>
                            <div className={`text-[9px] font-black uppercase tracking-widest mt-3 text-center leading-tight max-w-[80px] ${p1Profile.text}`}>ACTIVE POWERS</div>
                        </div>

                        <div className="absolute bottom-6 right-10 z-30 flex flex-col items-center pointer-events-auto transition-all duration-500">
                            <div className={`flex flex-col-reverse gap-3 p-2.5 bg-black/80 backdrop-blur-xl rounded-2xl border-2 ${p2Profile.border} relative overflow-hidden transition-all hover:scale-105`}>
                                <div className={`absolute inset-0 ${p2Profile.bg} opacity-10 pointer-events-none`}></div>
                                {[...Array(5)].map((_, i) => (
                                    <div key={i} className="relative w-14 h-14 z-10">
                                        {p2KingCards[i] ? (<div className="w-full h-full rounded-xl bg-gradient-to-br from-yellow-900 via-amber-700 to-yellow-950 border-2 border-yellow-400 text-yellow-300 shadow-[0_0_15px_rgba(234,179,8,0.5)] flex items-center justify-center text-3xl cursor-help group" onMouseEnter={() => setHoveredKingCard(p2KingCards[i])} onMouseLeave={() => setHoveredKingCard(null)}><span className="filter drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">{p2KingCards[i].img || "👑"}</span></div>) : (<div className={`w-full h-full rounded-xl border-2 border-dashed flex items-center justify-center opacity-30 ${p2Profile.border}`}></div>)}
                                    </div>
                                ))}
                            </div>
                            <div className={`text-[9px] font-black uppercase tracking-widest mt-3 text-center leading-tight max-w-[80px] ${p2Profile.text}`}>ACTIVE POWERS</div>
                        </div>

                        {hoveredKingCard && (<div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in pointer-events-none"><div className="pointer-events-auto transform scale-150 drop-shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-pop-in relative"><div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-black/90 text-white px-6 py-2 rounded-full border border-white/20 text-xs font-bold uppercase tracking-[0.2em] whitespace-nowrap shadow-xl z-50 pointer-events-none">Active Passive Effect</div><Card card={hoveredKingCard} isKingCard={true} canAfford={false} bigMode={false} isVisual={true} enable3D={true} forceDiscard={false} /></div></div>)}

                        <div className="flex w-full max-w-7xl justify-between items-end z-10 px-6 pb-0 h-full relative">
                            <TowerDisplay height={p1Stats.tower} wall={p1Stats.wall} king={p1Stats.king} shield={p1Stats.shield} isPlayer={true} idPrefix="p" label={`${P1_LABEL} CASTLE`} isBurning={p1Stats.burn > 0} colorProfile={p1Profile} />

                            <div className="flex flex-col items-center justify-end w-1/3 max-w-md h-full mb-4 relative z-40">
                                <div className="flex items-end justify-between w-full max-w-[380px] mb-6">
                                    <div className="relative transform hover:scale-105 transition-transform" title={`DECK: ${deckCount} CARDS LEFT`}><div className="absolute inset-0 rounded-xl bg-black border-2 border-stone-800 translate-x-1 translate-y-1 z-0"></div><div className="absolute inset-0 rounded-xl bg-black border-2 border-stone-800 translate-x-2 translate-y-2 z-[-1]"></div><div className={`card-size card-back-pattern rounded-xl shadow-xl flex items-center justify-center relative overflow-hidden z-10 bg-stone-950`}><CardBackContent /></div></div>
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
                                        const activeColor = myProfile; 
                                        const btnClass = isMyTurn ? `bg-gradient-to-r ${activeColor.bar} border-2 ${activeColor.border} shadow-[0_0_15px_rgba(255,255,255,0.3)] animate-pulse` : `bg-transparent border-2 ${activeColor.border} opacity-40 cursor-not-allowed grayscale`;
                                        return (
                                            <button onClick={handleEndTurn} disabled={!isMyTurn || isProcessingTurn} className={`text-white font-black text-sm px-6 py-2 rounded-xl transition-all shadow-xl uppercase tracking-widest transform hover:scale-105 flex items-center gap-2 w-full justify-center whitespace-nowrap hover:brightness-125 text-outline-black ${btnClass}`}>
                                                {isMyTurn ? (cardPlayedInTurn > 0 ? "END TURN" : "PASS") : "OPPONENT TURN"} <span className="text-xl">➡️</span>
                                            </button>
                                        );
                                    })()}
                                </div>
                                <div className="w-full h-40 bg-black/90 rounded-2xl p-0.5 backdrop-blur-md border border-stone-800 flex flex-col shadow-2xl relative overflow-hidden pointer-events-auto">
                                    <div className="flex-1 flex flex-col justify-start w-full px-3 py-1 overflow-y-auto overflow-x-hidden custom-scrollbar relative min-h-full touch-pan-y"><div className="flex flex-col justify-start items-start w-full space-y-1 mt-auto">{log.map((l, i) => (<div key={i} className={`text-xs py-0.5 font-mono leading-tight ${l.type === 'PLAYER' ? 'text-stone-300' : l.type === 'OPPONENT' ? 'text-yellow-600' : (l.type === 'CHAT' ? '' : 'text-stone-500')}`}>{l.isRawHtml ? <span dangerouslySetInnerHTML={{ __html: l.text }}></span> : l.text}</div>))}</div><div ref={logEndRef} className="shrink-0" /></div>
                                </div>
                            </div>

                            <TowerDisplay height={p2Stats.tower} wall={p2Stats.wall} king={p2Stats.king} shield={p2Stats.shield} isPlayer={false} idPrefix="o" mirror={true} label={`${P2_LABEL} CASTLE`} isBurning={p2Stats.burn > 0} colorProfile={p2Profile} />
                        </div>
                    </div>

                    <div className="ui-panel-glass relative z-30 h-36 shrink-0 w-full flex px-6 py-2 items-center justify-between pointer-events-auto">
                        <div className="flex flex-col gap-2 min-w-[280px]">
                            <h1 className={`text-[20px] font-extrabold tracking-[0.2em] uppercase ml-1 flex items-center gap-2 ${p1Profile.text}`}>{P1_LABEL} RESOURCES:</h1>
                            <div className="flex gap-3">
                                <ResourceIndicator id="p-res-bricks" label="BRICKS" value={p1Stats.bricks} production={p1Stats.prodBricks} icon="🧱" />
                                <ResourceIndicator id="p-res-weapons" label="WEAPONS" value={p1Stats.weapons} production={p1Stats.prodWeapons} icon="⚔️" />
                                <ResourceIndicator id="p-res-crystals" label="CRYSTALS" value={p1Stats.crystals} production={p1Stats.prodCrystals} icon="💎" />
                            </div>
                        </div>

                        <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
                            {(() => {
                                const activeColor = myProfile;
                                const btnClass = isMyTurn ? `bg-gradient-to-r ${activeColor.bar} border-2 ${activeColor.border} shadow-[0_0_15px_rgba(255,255,255,0.2)] hover:scale-110` : `bg-transparent border-2 ${activeColor.border} opacity-40 cursor-not-allowed grayscale`;
                                return (
                                    <button onClick={() => isMyTurn && setShowCards(!showCards)} disabled={!isMyTurn || isProcessingTurn} className={`text-white font-black text-base px-16 py-3 rounded-xl transition-all uppercase tracking-wider transform shadow-lg text-outline-black ${btnClass}`}>CARDS ({myHand.length}/{MAX_HAND_SIZE})</button>
                                );
                            })()}
                        </div>

                        <InGameChat onSend={(text: string) => socketRef.current?.emit('lobby_chat', { roomId: roomIdParam, message: text })} />

                        <div className="flex items-center gap-2 relative min-w-[320px] justify-end"></div>
                    </div>

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

                    <CardModal 
                        hand={myHand} 
                        activePlayer={myRole === 'p1' ? p1Stats : p2Stats} 
                        p1Stats={p1Stats} 
                        p2Stats={p2Stats} 
                        onPlay={handleCardPlay} 
                        onDiscard={handleCardDiscard} 
                        showCards={showCards} 
                        onClose={() => setShowCards(false)} 
                        canAffordFn={canAfford} 
                        cardPlayedInTurn={cardPlayedInTurn} 
                        isLocked={!isMyTurn || isProcessingTurn || gamePhase !== 'PLAYING'} 
                        p1Name={`${P1_LABEL} CASTLE`} 
                        p2Name={`${P2_LABEL} CASTLE`} 
                        kingCards={myRole === 'p1' ? p1KingCards : p2KingCards} 
                        playSFX={playSFX} 
                        getKingBuffs={getKingBuffs} 
                        getEffectiveCardCost={getEffectiveCardCost} 
                        p1Color={p1Profile} 
                        p2Color={p2Profile} 
                        activeColor={myProfile}
                    />
                </div>
            )}
        </div>
    );
};

export default OnlineGame;
