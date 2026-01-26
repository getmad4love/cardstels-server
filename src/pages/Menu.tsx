
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import { CARDS_DB_BASE, KING_CARDS_DB } from '../data/cards';
import { CardType } from '../types';
import { BASE_WIDTH, BASE_HEIGHT, PLAYER_COLORS } from '../utils/constants';
import { playSFX, resumeAudioContext } from '../utils/audioManager';

// ... (Keep DeckViewer exactly as is)
const DeckViewer = ({ onClose }: { onClose: () => void }) => {
    const [zoomedCard, setZoomedCard] = useState<CardType | null>(null);

    const sortedGroups = useMemo(() => {
        // Initialize groups including Type 4 (Specials)
        const groups: { [key: number]: CardType[] } = { 0: [], 1: [], 2: [], 4: [] };

        CARDS_DB_BASE.forEach(card => {
            if (groups[card.type]) groups[card.type].push(card);
            else groups[card.type] = [card];
        });

        const result: any[] = [];
        const typeNames = { 0: 'CONSTRUCTION (RED)', 1: 'MILITARY (GREEN)', 2: 'MAGIC (BLUE)', 4: 'SPECIALS' };
        const typeColors = { 
            0: 'text-red-500', 
            1: 'text-green-500', 
            2: 'text-blue-400',
            4: 'text-teal-400 drop-shadow-[0_0_5px_rgba(45,212,191,0.8)]' // Aqua glow for Specials
        };

        // 1. Process Standard Resources (0, 1, 2)
        [0, 1, 2].forEach((type: any) => {
            let cards = [...(groups[type] || [])];
            cards.sort((a, b) => {
                const countDiff = (b.count || 1) - (a.count || 1);
                if (countDiff !== 0) return countDiff;
                const costA = (a.costB || 0) + (a.costW || 0) + (a.costC || 0);
                const costB = (b.costB || 0) + (b.costW || 0) + (b.costC || 0);
                return costA - costB;
            });

            if (cards.length > 0) {
                result.push({
                    type,
                    title: typeNames[type as 0 | 1 | 2],
                    colorClass: typeColors[type as 0 | 1 | 2],
                    cards
                });
            }
        });

        // 2. Process Specials (Type 4) - Inserted before King Cards
        if (groups[4] && groups[4].length > 0) {
             result.push({
                type: 4,
                title: typeNames[4],
                colorClass: typeColors[4],
                cards: groups[4]
            });
        }

        // 3. Process King Cards
        const kingCards = KING_CARDS_DB || [];
        if (kingCards.length > 0) {
            result.push({
                type: 'king',
                title: 'KING CARDS (SPECIAL)',
                colorClass: 'text-yellow-400 drop-shadow-[0_0_5px_rgba(234,179,8,0.8)]',
                cards: kingCards
            });
        }

        return result;
    }, []);

    return (
        <div className="fixed inset-0 z-[100] bg-stone-950 flex flex-col animate-fade-in">
            <div className="flex items-center justify-between px-8 py-4 bg-stone-900 border-b border-stone-700 shadow-2xl z-10 shrink-0">
                <h2 className="text-3xl font-chivo font-black text-white tracking-widest uppercase flex items-center gap-3">
                    <span className="text-lime-400">Deck</span> Repository
                </h2>

                <div className="flex items-center gap-6">
                    <button onClick={() => { playSFX('button_click'); onClose(); }} className="ml-4 text-stone-400 hover:text-red-500 transition-colors text-3xl font-bold leading-none">&times;</button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden p-8 custom-scrollbar relative">
                <div className="max-w-7xl mx-auto space-y-12 pb-20">
                    {sortedGroups.map((group: any) => (
                        <div key={group.type} className="animate-fade-in-down">
                            <h3 className={`text-xl font-black ${group.colorClass} border-b border-stone-800 pb-2 mb-6 uppercase tracking-[0.2em] flex items-center gap-2`}>
                                {group.title} <span className="text-stone-600 text-sm">({group.cards.length})</span>
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-8 justify-items-center" style={{ perspective: '1000px' }}>
                                {group.cards.map((card: CardType) => (
                                    <div key={card.id} className="flex flex-col items-center group/card">
                                        <div className="cursor-zoom-in transform transition-transform hover:scale-110 hover:z-10" onClick={() => { playSFX('play_card'); setZoomedCard(card); }}>
                                            <div className="card-idle">
                                                <Card card={card} isVisual={true} isKingCard={group.type === 'king'} enable3D={true} />
                                            </div>
                                        </div>
                                        <div className="mt-3 text-center">
                                            {group.type !== 'king' ? (
                                                <>
                                                    <div className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-0.5">Count</div>
                                                    <div className="text-xl font-black text-white font-chivo">{card.count}</div>
                                                </>
                                            ) : (
                                                <div className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest mt-1">Unique</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {zoomedCard && (
                <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-8 animate-fade-in" onClick={() => setZoomedCard(null)}>
                    <div className="transform scale-150 pointer-events-auto">
                        <Card card={zoomedCard} isVisual={true} bigMode={false} isKingCard={zoomedCard.type === 3 || (!!zoomedCard.id && zoomedCard.id.toString().startsWith('k_'))} enable3D={true} />
                    </div>
                    <div className="absolute bottom-10 text-stone-400 font-bold tracking-widest uppercase animate-pulse">Click anywhere to close</div>
                </div>
            )}
        </div>
    );
};

const ColorSelection = ({ isMultiplayer, onSelect, forbiddenColorId }: { isMultiplayer: boolean, onSelect: (id: number) => void, forbiddenColorId?: number | null }) => {
    const title = isMultiplayer 
        ? (forbiddenColorId === null || forbiddenColorId === undefined ? "SELECT PLAYER 1 COLOR" : "SELECT PLAYER 2 COLOR") 
        : "SELECT YOUR COLOR";

    return (
        <div className="flex flex-col items-center animate-fade-in w-full max-w-4xl">
            <h2 className="text-3xl font-chivo font-black text-white tracking-widest uppercase mb-8 drop-shadow-md">{title}</h2>
            <div className="grid grid-cols-4 gap-6">
                {PLAYER_COLORS.map(color => {
                    const isForbidden = color.id === forbiddenColorId;
                    return (
                        <button 
                            key={color.id} 
                            onClick={() => !isForbidden && onSelect(color.id as number)}
                            disabled={isForbidden}
                            className={`w-32 h-32 rounded-xl flex flex-col items-center justify-center border-4 transition-all duration-300 group relative overflow-hidden ${isForbidden ? 'opacity-20 cursor-not-allowed border-stone-700 grayscale' : `${color.border} hover:scale-110 hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] bg-stone-900`}`}
                        >
                            <div className={`w-16 h-16 rounded-full ${color.bg} shadow-lg mb-2 group-hover:scale-125 transition-transform`}></div>
                            <span className={`font-bold text-sm tracking-widest ${color.text} uppercase`}>{color.name}</span>
                            {!isForbidden && <div className={`absolute inset-0 bg-gradient-to-t ${color.bar} opacity-0 group-hover:opacity-20 transition-opacity`}></div>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

const Button = ({ onClick, children, variant = 'primary' }: any) => {
    const baseClass = "w-80 py-4 rounded-lg font-chivo font-black text-2xl tracking-widest transition-all duration-200 transform hover:scale-105 hover:shadow-2xl flex items-center justify-center uppercase border-2 cursor-pointer select-none relative overflow-hidden group";

    const variants: any = {
        primary: "bg-gradient-to-r from-lime-400 via-yellow-300 to-lime-400 text-stone-900 border-lime-200 shadow-[0_0_25px_rgba(163,230,53,0.5)] hover:shadow-[0_0_40px_rgba(250,204,21,0.7)] hover:border-white",
        tower: "bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white border-fuchsia-400 shadow-[0_0_25px_rgba(236,72,153,0.5)] hover:shadow-[0_0_40px_rgba(236,72,153,0.7)] hover:border-white",
        endless: "bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-500 text-white border-cyan-300 shadow-[0_0_25px_rgba(6,182,212,0.5)] hover:shadow-[0_0_40px_rgba(6,182,212,0.7)] hover:border-white",
        info: "bg-gradient-to-r from-teal-500 to-emerald-600 text-white border-teal-400 shadow-[0_0_20px_rgba(20,184,166,0.4)] hover:shadow-[0_0_30px_rgba(20,184,166,0.6)] hover:border-white",
        outline: "bg-transparent border-slate-600 text-slate-400 hover:text-white hover:border-slate-300 hover:bg-white/5",
        deck: "bg-stone-800 text-stone-200 border-stone-600 shadow-[0_0_15px_rgba(0,0,0,0.8)] hover:bg-stone-700 hover:text-white hover:border-stone-400 hover:shadow-[0_0_25px_rgba(255,255,255,0.1)]",
        multi: "bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 text-white border-indigo-400 shadow-[0_0_25px_rgba(99,102,241,0.5)] hover:shadow-[0_0_40px_rgba(99,102,241,0.7)] hover:border-white",
    };

    const handleClick = (e: any) => {
        playSFX('button_click');
        if (onClick) onClick(e);
    };

    return (
        <button onClick={handleClick} className={`${baseClass} ${variants[variant] || variants.primary}`}>
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 pointer-events-none"></div>
            <span className="relative z-10 drop-shadow-md">{children}</span>
        </button>
    );
};

const Menu = () => {
    const navigate = useNavigate();
    const [view, setView] = useState('menu');
    const [p1Color, setP1Color] = useState<number | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [saveSlots, setSaveSlots] = useState<any[]>([]);
    const [joinCode, setJoinCode] = useState("");

    useEffect(() => {
        const handleResize = () => {
            if (!menuRef.current) return;
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            const scale = Math.min(windowWidth / BASE_WIDTH, windowHeight / BASE_HEIGHT);
            
            menuRef.current.style.transform = `scale(${scale})`;
            menuRef.current.style.left = `${(windowWidth - BASE_WIDTH * scale) / 2}px`;
            menuRef.current.style.top = `${((windowHeight - BASE_HEIGHT * scale) / 2) < 0 ? 0 : (windowHeight - BASE_HEIGHT * scale) / 2}px`;
        };
        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleResize);
        handleResize();
        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleResize);
        };
    }, []);

    useEffect(() => {
        let registry: any = {};
        try {
            registry = JSON.parse(localStorage.getItem('cardstels_save_registry') || '{}');
        } catch (e) {
            console.error("Registry corrupted", e);
            registry = {};
        }

        const slots = [];
        const autoSaveData = registry['autosave'];
        if (autoSaveData && autoSaveData.occupied) {
            slots.push({ id: 'autosave', empty: false, data: autoSaveData, isAuto: true });
        } else {
            slots.push({ id: 'autosave', empty: true, isAuto: true });
        }

        for (let i = 1; i <= 4; i++) {
            const slotData = registry[i];
            if (slotData && slotData.occupied) {
                slots.push({ id: i, empty: false, data: slotData, isAuto: false });
            } else {
                slots.push({ id: i, empty: true, isAuto: false });
            }
        }
        setSaveSlots(slots);
    }, [view]);

    const startGame = (mode: string, p1C?: number, p2C?: number) => {
        playSFX('button_click');
        sessionStorage.setItem('cardstels_new_game', 'true');

        let url = '/game?';
        
        if (mode === 'tower') url += 'mode=tower';
        else if (mode === 'endless') url += 'mode=endless';
        else if (mode === '2') url += 'mode=2player';
        else url += 'mode=1player';

        if (p1C !== undefined) url += `&p1=${p1C}`;
        if (p2C !== undefined) url += `&p2=${p2C}`;

        navigate(url);
    };

    const startMultiplayer = (role: 'host' | 'join', roomId?: string) => {
        playSFX('button_click');
        sessionStorage.setItem('cardstels_new_game', 'true');
        
        const finalRoomId = roomId || Math.floor(1000 + Math.random() * 9000).toString();
        
        // UPDATE: Redirect to new OnlineGame component route
        navigate(`/online?role=${role}&room=${finalRoomId}`);
    };

    const loadGame = (slotId: number | string) => {
        playSFX('button_click');
        localStorage.setItem('cardstels_active_load_slot', slotId.toString());
        navigate('/game?mode=load');
    };

    const handleColorSelect = (colorId: number) => {
        playSFX('button_click');
        if (view === 'color_select_1p') {
            setP1Color(colorId);
            setView('mode_select_1p');
        } else if (view === 'color_select_2p_p1') {
            setP1Color(colorId);
            setView('color_select_2p_p2');
        } else if (view === 'color_select_2p_p2') {
            startGame('2', p1Color!, colorId);
        }
    };

    const Background = () => (
        <div className="lava-lamp-bg absolute inset-0 z-0">
            <div className="lava-blob blob-1"></div>
            <div className="lava-blob blob-2"></div>
            <div className="lava-blob blob-3"></div>
            <div className="lava-blob blob-4"></div>
            <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px]"></div>
        </div>
    );

    const Logo = () => (
        <div className="text-center mb-8 shrink-0 z-20">
            <h1 className="font-chivo text-[9rem] leading-none font-black tracking-tighter text-lime-400 drop-shadow-[0_0_25px_rgba(132,204,22,0.6)] uppercase select-none relative">
                Cardstels
                <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-8 bg-yellow-400 blur-xl opacity-30 rounded-full"></span>
            </h1>
            <div className="h-1.5 w-48 bg-gradient-to-r from-lime-500 to-yellow-400 mx-auto rounded-full shadow-[0_0_15px_rgba(250,204,21,0.8)] mt-2"></div>
            <p className="mt-4 text-slate-400 text-xl uppercase tracking-[0.4em] font-bold text-shadow-sm">Master the cards. Build your castle. Protect the king.</p>
        </div>
    );

    const Footer = () => (
        <footer className="absolute bottom-6 w-full text-center z-20">
            <div className="text-slate-600 text-xs font-bold tracking-[0.2em] uppercase">
                Created by <span className="text-slate-400 hover:text-lime-400 transition-colors cursor-default">Miroslav Mracek</span>
            </div>
        </footer>
    );

    const handleInteraction = () => {
        resumeAudioContext();
    };

    const renderContent = () => {
        if (view === 'deck_viewer') {
            return <DeckViewer onClose={() => setView('menu')} />;
        }
        
 if (view === 'howto') {
             return (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 animate-fade-in relative z-50">
                     <div className="w-[1000px] bg-stone-900/95 border border-stone-700 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[680px] backdrop-blur-md">
                        <div className="flex justify-between items-center p-6 border-b border-stone-700 bg-stone-950/50 z-10">
                            <h2 className="font-chivo text-4xl font-bold text-yellow-400 uppercase tracking-wide drop-shadow-md">Game Manual</h2>
                            <button onClick={() => { playSFX('button_click'); setView('menu'); }} className="text-slate-500 hover:text-white text-3xl font-bold px-4 transition-colors">&times;</button>
                        </div>
                        <div className="overflow-y-auto p-8 space-y-8 bg-black/20 flex-grow custom-scrollbar">
                             <div className="grid grid-cols-1 gap-6">
                                
                                {/* 1. GAME ROUND */}
                                <div className="flex gap-6 items-start p-4 bg-white/5 rounded-xl border border-white/5">
                                    <div className="bg-cyan-600 text-white w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl flex-shrink-0 shadow-lg shadow-cyan-900/50">1</div>
                                    <div className="flex-1">
                                        <h3 className="text-white font-bold text-xl mb-2">GAME ROUND</h3>
                                        <p className="text-slate-300 leading-relaxed">In each round, either <strong className="text-white">play a card</strong>, <strong className="text-white">discard a card</strong>, or skip the round to just <strong className="text-lime-400">farm resources</strong>.</p>
                                    </div>
                                </div>

                                {/* 2. HOW TO WIN */}
                                <div className="flex gap-6 items-start p-4 bg-white/5 rounded-xl border border-white/5">
                                    <div className="bg-lime-600 text-white w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl flex-shrink-0 shadow-lg shadow-lime-900/50">2</div>
                                    <div className="flex-1">
                                        <h3 className="text-white font-bold text-xl mb-2">HOW TO WIN</h3>
     <div className="text-slate-300 leading-relaxed">
                                            <p>Win by achieving one of these goals:</p></div>
                                        <ul className="grid grid-cols-2 gap-3 text-slate-300 font-medium mt-3">
                                            <li className="flex items-center gap-3 bg-stone-900/80 p-3 rounded border border-stone-700/50"><span className="text-2xl">👑</span> <span>Build <strong className="text-yellow-400">King</strong> to <strong className="text-yellow-400">100</strong></span></li>
                                            <li className="flex items-center gap-3 bg-stone-900/80 p-3 rounded border border-stone-700/50"><span className="text-2xl">🏰</span> <span>Build <strong className="text-blue-500">Tower</strong> to <strong className="text-blue-500">150</strong></span></li>
                                            <li className="flex items-center gap-3 bg-stone-900/80 p-3 rounded border border-stone-700/50"><span className="text-2xl">🧱</span> <span>Build <strong className="text-red-500">Wall</strong> to <strong className="text-red-500">200</strong></span></li>
                                            <li className="flex items-center gap-3 bg-stone-900/80 p-3 rounded border border-stone-700/50"><span className="text-2xl">💀</span> <span>Destroy Enemy <strong className="text-yellow-400">King</strong> to <strong className="text-red-500">0</strong></span></li>
                                        </ul>
                                    </div>
                                </div>

                                {/* 3. DAMAGE ORDER */}
                                <div className="flex gap-6 items-start p-4 bg-white/5 rounded-xl border border-white/5">
                                    <div className="bg-orange-600 text-white w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl flex-shrink-0 shadow-lg shadow-orange-900/50">3</div>
                                    <div className="flex-1">
                                        <h3 className="text-white font-bold text-xl mb-2">DAMAGE ORDER</h3>
                                        <div className="text-slate-300 leading-relaxed">
                                            <p>Attacks don't hit the King immediately. They must break through defenses first:</p>
                                            <div className="mt-3 font-bold text-sm bg-black/40 p-3 rounded-lg border border-white/10 inline-flex items-center gap-2">
                                                <span className="text-red-500">WALL 🧱</span> 
                                                <span className="text-slate-500">➜</span> 
                                                <span className="text-blue-500">TOWER 🏰</span> 
                                                <span className="text-slate-500">➜</span> 
                                                <span className="text-yellow-400">KING 👑</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 4. RESOURCES & CARDS */}
                                <div className="flex gap-6 items-start p-4 bg-white/5 rounded-xl border border-white/5">
                                    <div className="bg-purple-600 text-white w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl flex-shrink-0 shadow-lg shadow-purple-900/50">4</div>
                                    <div className="flex-1">
                                        <h3 className="text-white font-bold text-xl mb-2">RESOURCES & CARDS</h3>
                                        <div className="text-slate-300 leading-relaxed">
                                            Use resources to play cards:
                                            <div className="grid grid-cols-3 gap-2 mt-3">
                                                <div className="bg-stone-900/80 p-3 rounded text-center border border-stone-700"><span className="text-2xl block mb-1">🧱</span><span className="text-red-500 block font-bold text-[10px] tracking-widest">BRICKS</span></div>
                                                <div className="bg-stone-900/80 p-3 rounded text-center border border-stone-700"><span className="text-2xl block mb-1">⚔️</span><span className="text-green-500 block font-bold text-[10px] tracking-widest">WEAPONS</span></div>
                                                <div className="bg-stone-900/80 p-3 rounded text-center border border-stone-700"><span className="text-2xl block mb-1">💎</span><span className="text-blue-500 block font-bold text-[10px] tracking-widest">CRYSTALS</span></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 5. PRODUCTION LOGIC */}
                                <div className="flex gap-6 items-start p-4 bg-white/5 rounded-xl border border-white/5">
                                    <div className="bg-teal-600 text-white w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl flex-shrink-0 shadow-lg shadow-teal-900/50">5</div>
                                    <div className="flex-1">
                                        <h3 className="text-white font-bold text-xl mb-2 flex items-center gap-2"><span>📊</span> PRODUCTION LOGIC</h3>
                                        <div className="text-slate-300 leading-relaxed space-y-3">
                                            <p><strong className="text-teal-400">Production (PROD)</strong> is the engine of victory. While resources are spent, production determines your future income.</p>
                                            <div className="bg-black/40 p-4 rounded-lg border border-white/10">
                                                <h4 className="text-white font-bold text-sm uppercase tracking-wide mb-2">🔄 How it works</h4>
                                                <p className="text-sm">When you click <strong className="text-white">END TURN</strong>, the game takes your Production stats (the small +numbers) and adds them to your Resource totals.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 6. ARCHER ON THE WALL */}
                                <div className="flex gap-6 items-start p-4 bg-white/5 rounded-xl border border-white/5">
                                    <div className="bg-red-600 text-white w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl flex-shrink-0 shadow-lg shadow-red-900/50">6</div>
                                    <div className="flex-1">
                                        <h3 className="text-white font-bold text-xl mb-2">ARCHER ON THE WALL</h3>
                                        <div className="text-slate-300 leading-relaxed">
                                            <p className="mb-2">When <strong className="text-orange-400">Wall ≥ 50</strong>, an archer appears and <strong className="text-red-400">automatically attacks</strong> at the end of every turn.</p>
                                            <div className="grid grid-cols-1 gap-1 bg-black/40 p-3 rounded-lg border border-white/10 text-sm mt-2">
                                                <div className="flex justify-between border-b border-white/10 pb-1"><span className="text-red-500 font-bold">Wall ≥ 50</span><span className="text-green-400 font-black">1 DAMAGE</span></div>
                                                <div className="flex justify-between border-b border-white/10 pb-1"><span className="text-red-500 font-bold">Wall ≥ 60</span><span className="text-blue-400 font-black">2 DAMAGE</span></div>
                                                <div className="flex justify-between border-b border-white/10 pb-1"><span className="text-red-500 font-bold">Wall ≥ 70</span><span className="text-pink-600 font-black">3 DAMAGE</span></div>
                                                <div className="flex justify-between border-b border-white/10 pb-1"><span className="text-red-500 font-bold">Wall ≥ 80</span><span className="text-orange-500 font-black">4 DAMAGE</span></div>
                                                <div className="flex justify-between"><span className="text-red-500 font-bold">Wall ≥ 90</span><span className="text-red-600 font-black">5 DAMAGE</span></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 7. TOWER PRODUCTION */}
                                <div className="flex gap-6 items-start p-4 bg-white/5 rounded-xl border border-white/5">
                                    <div className="bg-blue-600 text-white w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl flex-shrink-0 shadow-lg shadow-blue-900/50">7</div>
                                    <div className="flex-1">
                                        <h3 className="text-white font-bold text-xl mb-2">TOWER PRODUCTION</h3>
                                        <div className="text-slate-300 leading-relaxed">
                                            <p className="mb-2">When <strong className="text-blue-400">Tower ≥ 50</strong>, it generates <strong className="text-teal-400">automatic production</strong> for ALL resources at the end of every turn.</p>
                                            <div className="grid grid-cols-1 gap-1 bg-black/40 p-3 rounded-lg border border-white/10 text-sm mt-2">
                                                <div className="flex justify-between border-b border-white/10 pb-1"><span className="text-blue-500 font-bold">Tower ≥ 50</span><span className="text-green-400 font-black">+1 PRODUCTION</span></div>
                                                <div className="flex justify-between border-b border-white/10 pb-1"><span className="text-blue-500 font-bold">Tower ≥ 60</span><span className="text-blue-400 font-black">+2 PRODUCTION</span></div>
                                                <div className="flex justify-between border-b border-white/10 pb-1"><span className="text-blue-500 font-bold">Tower ≥ 70</span><span className="text-pink-600 font-black">+3 PRODUCTION</span></div>
                                                <div className="flex justify-between border-b border-white/10 pb-1"><span className="text-blue-500 font-bold">Tower ≥ 80</span><span className="text-orange-400 font-black">+4 PRODUCTION</span></div>
                                                <div className="flex justify-between"><span className="text-blue-500 font-bold">Tower ≥ 90</span><span className="text-red-600 font-black">+5 PRODUCTION</span></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 8. SCHOOL CARD */}
                                <div className="flex gap-6 items-start p-4 bg-white/5 rounded-xl border border-white/5">
                                    <div className="bg-indigo-600 text-white w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl flex-shrink-0 shadow-lg shadow-indigo-900/50">8</div>
                                    <div className="flex-1">
                                        <h3 className="text-white font-bold text-xl mb-2 flex items-center gap-2"><span>🏫</span> THE "SCHOOL" CARD</h3>
                                        <div className="text-slate-300 leading-relaxed">
                                            <p className="mb-3">The <strong className="text-indigo-400">School</strong> is the Queen of Economy. It is critical for early game success.</p>
                                            <div className="flex items-center gap-4 bg-black/40 p-3 rounded-lg border border-indigo-500/30">
                                                <div className="text-4xl">🏫</div>
                                                <div>
                                                    <p className="text-white font-bold">Effect: +1 to ALL Production</p>
                                                    <p className="text-sm text-slate-400">Boosts Bricks, Weapons, and Crystals income simultaneously.</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 9. TIPS */}
                                <div className="flex gap-6 items-start p-4 bg-white/5 rounded-xl border border-white/5">
                                    <div className="bg-yellow-600 text-white w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl flex-shrink-0 shadow-lg shadow-yellow-900/50">9</div>
                                    <div className="flex-1">
                                        <h3 className="text-white font-bold text-xl mb-2 flex items-center gap-2"><span>💡</span> STRATEGIC TIPS</h3>
                                        <ul className="space-y-3 text-slate-300 leading-relaxed">
                                            <li className="flex gap-3"><span className="text-yellow-400 font-bold">➜</span><span><strong className="text-white">Increase Production Early:</strong> Prioritize cards like School. High production means better cards later.</span></li>
                                            <li className="flex gap-3"><span className="text-yellow-400 font-bold">➜</span><span><strong className="text-white">Farm When Stuck:</strong> Can't afford good cards? Discard weak ones or skip turns to farm resources.</span></li>
                                            <li className="flex gap-3"><span className="text-yellow-400 font-bold">➜</span><span><strong className="text-white">Maintain Balance:</strong> Don't neglect any single resource. You need all three to defend effectively.</span></li>
                                        </ul>
                                    </div>
                                </div>

                                {/* 10. KING CARDS (NEW) */}
                                <div className="flex gap-6 items-start p-4 bg-yellow-900/20 rounded-xl border border-yellow-500/30 shadow-[0_0_15px_rgba(234,179,8,0.1)]">
                                    <div className="bg-yellow-600 text-white w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl flex-shrink-0 shadow-lg shadow-yellow-500/50">10</div>
                                    <div className="flex-1">
                                        <h3 className="text-yellow-400 font-bold text-xl mb-2 flex items-center gap-2"><span>👑</span> KING CARDS & LOOT</h3>
                                        <div className="text-slate-300 leading-relaxed space-y-3">
                                            <p>These are powerful <strong className="text-yellow-400">Passive Abilities</strong> that you select at the start of the game. They last for the entire match.</p>
                                            <div className="bg-black/40 p-4 rounded-lg border border-yellow-500/20">
                                                <ul className="space-y-2 text-sm">
                                                    <li className="flex gap-2 items-start"><span className="text-yellow-500 mt-1">▶</span> <span><strong>Start match:</strong> Choose your KING CARD from 3 options to define your strategy.</span></li>
                                                    <li className="flex gap-2 items-start"><span className="text-lime-400 mt-1">▶</span> <span><strong>Looting:</strong> In <strong className="text-white">Tower/Endless</strong> modes, when you defeat an enemy, you can <strong className="text-lime-400">STEAL</strong> their KING CARD!</span></li>
                                                    <li className="flex gap-2 items-start"><span className="text-cyan-400 mt-1">▶</span> <span><strong>Collection:</strong> You can hold up to 5 KING CARDS at once.</span></li>
                                                    <li className="flex gap-2 items-start"><span className="text-amber-500 mt-1">▶</span> <span><strong>King Power Card:</strong> <strong className="text-yellow-400">KING POWER</strong> card is 4x in the main deck. When drawn, BOTH players draw an additional King Card!</span></li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                             </div>
                        </div>
                    </div>
                </div>
            );
        }



        if (view === 'load_game') {
              return (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 animate-fade-in relative z-50">
                    <div className="w-[800px] bg-stone-900/95 border border-stone-700 rounded-3xl shadow-2xl overflow-hidden flex flex-col backdrop-blur-md">
                        <div className="flex justify-between items-center p-6 border-b border-stone-700 bg-stone-950/50 z-10">
                            <h2 className="font-chivo text-4xl font-bold text-cyan-400 uppercase tracking-wide drop-shadow-md">Load Game</h2>
                            <button onClick={() => { playSFX('button_click'); setView('menu'); }} className="text-slate-500 hover:text-white text-3xl font-bold px-4 transition-colors">&times;</button>
                        </div>
                        <div className="p-8 grid grid-cols-2 gap-4">
                            {saveSlots.map((slot) => {
                                const isAuto = slot.isAuto;
                                return (
                                    <button
                                        key={slot.id}
                                        disabled={slot.empty}
                                        onClick={() => !slot.empty && loadGame(slot.id)}
                                        className={`p-6 rounded-xl border-2 transition-all text-left group relative overflow-hidden h-32 flex flex-col justify-center ${
                                            slot.empty
                                                ? (isAuto ? 'border-amber-900/50 bg-amber-950/20 text-amber-700/50 cursor-default' : 'border-slate-800 bg-slate-900/50 text-slate-600 cursor-default')
                                                : (isAuto 
                                                    ? 'border-amber-600 bg-amber-950/40 hover:bg-amber-900/50 hover:border-amber-400 hover:shadow-[0_0_20px_rgba(245,158,11,0.3)] cursor-pointer' 
                                                    : 'border-cyan-700 bg-cyan-950/30 hover:bg-cyan-900/50 hover:border-cyan-400 hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] cursor-pointer')
                                            }`}
                                    >
                                        {slot.empty ? (
                                            <span className="font-chivo text-xl uppercase tracking-widest opacity-50 text-center w-full">{isAuto ? 'No Autosave' : `Empty Slot ${slot.id}`}</span>
                                        ) : (
                                            <>
                                                <div className={`font-chivo text-xl uppercase tracking-wide mb-1 flex justify-between items-center ${isAuto ? 'text-amber-400' : 'text-cyan-400'}`}>
                                                    <span>{isAuto ? '⚠ AUTOSAVE' : `Slot ${slot.id}`}</span>
                                                    <span className={`text-xs border px-2 py-0.5 rounded ${isAuto ? 'text-amber-600 border-amber-800' : 'text-cyan-600 border-cyan-800'}`}>{slot.data.isEndlessMode ? 'ENDLESS' : (slot.data.isTowerMode ? 'ROGUE TOWER' : (slot.data.isMultiplayer ? '2 PLAYERS' : 'SINGLE MATCH'))}</span>
                                                </div>
                                                <div className="text-slate-300 text-sm font-bold uppercase tracking-wider mb-2">
                                                    {slot.data.isEndlessMode ? `Stage ${slot.data.endlessStage}` : (slot.data.isTowerMode ? `Stage ${slot.data.towerStage}` : 'Match In Progress')}
                                                </div>
                                                <div className="text-xs text-slate-500 font-mono">
                                                    {new Date(slot.data.timestamp).toLocaleString()}
                                                </div>
                                                <div className={`absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity text-2xl ${isAuto ? 'text-amber-300' : 'text-cyan-300'}`}>►</div>
                                                {isAuto && <div className="absolute top-2 right-2 text-[10px] text-amber-500 font-bold uppercase tracking-widest opacity-60">System Checkpoint</div>}
                                            </>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            );
        }

        let mainContent = null;

        if (view === 'menu') {
            mainContent = (
                <div className="flex flex-col gap-6 items-center animate-fade-in w-full max-w-md">
                    <Button onClick={() => setView('player_select')} variant="primary">START GAME</Button>
                    <Button onClick={() => setView('load_game')} variant="endless">LOAD GAME</Button>
                    <Button onClick={() => setView('deck_viewer')} variant="deck">DECK</Button>
                    <Button onClick={() => setView('howto')} variant="info">HOW TO PLAY</Button>
                    <a href="https://ko-fi.com/cardstels" target="_blank" rel="noopener noreferrer" className="mt-0 text-amber-500/60 hover:text-amber-400 font-bold text-[16px] tracking-[0.3em] uppercase hover:underline transition-all">Support Development</a>
                </div>
            );
        } else if (view === 'player_select') {
            mainContent = (
                <div className="flex flex-col gap-6 items-center animate-fade-in w-full max-w-md">
                    <div className="text-cyan-400 font-bold tracking-widest text-sm uppercase mb-2 border-b border-cyan-500/30 pb-1 w-full text-center">Select Players</div>
                    <Button onClick={() => setView('color_select_1p')} variant="primary">1 PLAYER</Button>
                    <Button onClick={() => setView('2p_mode_select')} variant="primary">2 PLAYERS</Button>
                    <button onClick={() => { playSFX('button_click'); setView('menu'); }} className="mt-6 text-slate-500 hover:text-white uppercase font-bold text-xl tracking-[0.25em] transition-colors py-2 px-4 hover:bg-white/5 rounded">Back</button>
                </div>
            );
        } else if (view === '2p_mode_select') {
            mainContent = (
                <div className="flex flex-col gap-6 items-center animate-fade-in w-full max-w-md">
                    <div className="text-indigo-400 font-bold tracking-widest text-sm uppercase mb-2 border-b border-indigo-500/30 pb-1 w-full text-center">Connection Type</div>
                    <Button onClick={() => setView('color_select_2p_p1')} variant="primary">LOCAL</Button>
                    <Button onClick={() => setView('online_menu')} variant="multi">ONLINE</Button>
                    <button onClick={() => { playSFX('button_click'); setView('player_select'); }} className="mt-6 text-slate-500 hover:text-white uppercase font-bold text-xl tracking-[0.25em] transition-colors py-2 px-4 hover:bg-white/5 rounded">Back</button>
                </div>
            );
        } else if (view === 'online_menu') {
            mainContent = (
                <div className="flex flex-col gap-6 items-center animate-fade-in w-full max-w-md">
                    <div className="text-indigo-400 font-bold tracking-widest text-sm uppercase mb-2 border-b border-indigo-500/30 pb-1 w-full text-center">Online Lobby</div>
                    <Button onClick={() => startMultiplayer('host')} variant="multi">CREATE ROOM</Button>
                    
                    <div className="w-full flex flex-col gap-2">
                        <input 
                            type="text" 
                            maxLength={4}
                            placeholder="ENTER ROOM CODE"
                            className="w-full py-3 bg-stone-900 border-2 border-slate-700 text-center text-white font-chivo text-xl tracking-widest rounded focus:outline-none focus:border-indigo-500 transition-colors uppercase"
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value.replace(/[^0-9]/g, ''))}
                        />
                        <button 
                            onClick={() => { if(joinCode.length > 0) startMultiplayer('join', joinCode); }}
                            className={`w-full py-3 rounded font-black text-xl uppercase tracking-widest border-2 transition-all ${joinCode.length > 0 ? 'bg-indigo-600 border-indigo-400 text-white hover:bg-indigo-500' : 'bg-transparent border-slate-700 text-slate-600 cursor-not-allowed'}`}
                            disabled={joinCode.length === 0}
                        >
                            JOIN ROOM
                        </button>
                    </div>

                    <button onClick={() => { playSFX('button_click'); setView('2p_mode_select'); }} className="mt-6 text-slate-500 hover:text-white uppercase font-bold text-xl tracking-[0.25em] transition-colors py-2 px-4 hover:bg-white/5 rounded">Back</button>
                </div>
            );
        } else if (view === 'color_select_1p') {
            mainContent = <ColorSelection isMultiplayer={false} onSelect={handleColorSelect} />;
        } else if (view === 'color_select_2p_p1') {
            mainContent = <ColorSelection isMultiplayer={true} onSelect={handleColorSelect} />;
        } else if (view === 'color_select_2p_p2') {
            mainContent = <ColorSelection isMultiplayer={true} onSelect={handleColorSelect} forbiddenColorId={p1Color} />;
        } else if (view === 'mode_select_1p') {
            mainContent = (
                <div className="flex flex-col gap-6 items-center animate-fade-in w-full max-w-md">
                    <div className="text-purple-400 font-bold tracking-widest text-sm uppercase mb-2 border-b border-purple-500/30 pb-1 w-full text-center">Select Mode</div>
                    <Button onClick={() => startGame('1', p1Color!)} variant="primary">SINGLE MATCH</Button>
                    <Button onClick={() => startGame('tower', p1Color!)} variant="tower">ROGUE TOWER</Button>
                    <Button onClick={() => startGame('endless', p1Color!)} variant="endless">ENDLESS MODE</Button>
                    <button onClick={() => { playSFX('button_click'); setView('player_select'); }} className="mt-6 text-slate-500 hover:text-white uppercase font-bold text-xl tracking-[0.25em] transition-colors py-2 px-4 hover:bg-white/5 rounded">Back</button>
                </div>
            );
        }

        return (
            <div className="w-full h-full flex flex-col items-center justify-center relative z-10 p-0">
                <Background />
                <div className="flex-1 flex flex-col items-center justify-center w-full">
                    <Logo />
                    {mainContent}
                </div>
                <Footer />
            </div>
        );
    };

    return (
        <div
            id="game-wrapper"
            ref={menuRef}
            onClick={handleInteraction}
            className="bg-pattern relative bg-[#1c1917] shadow-[0_0_50px_rgba(0,0,0,0.8)] shrink-0 overflow-hidden select-none"
            style={{ width: BASE_WIDTH, height: BASE_HEIGHT, position: 'absolute', transformOrigin: '0 0' }}
        >
            <div className="scanlines"></div>
            {renderContent()}
        </div>
    );
};

export default Menu;
