
import React from 'react';
import { GameStats, PlayerColorProfile } from '../types';

interface GameOverProps {
    gameState: 'WON' | 'LOST';
    endGameReason: string;
    stats: GameStats;
    onRestart: () => void;
    onMenu: () => void;
    winner: 'p1' | 'p2';
    p1Profile: PlayerColorProfile;
    p2Profile: PlayerColorProfile;
    runTime: string;
    isTowerMode: boolean;
    isEndlessMode: boolean;
    stageNumber: number;
}

export const GameOverPanel = React.memo(({ gameState, endGameReason, stats, onRestart, onMenu, winner, p1Profile, p2Profile, runTime, isTowerMode, isEndlessMode, stageNumber }: GameOverProps) => {
    if (gameState !== 'WON' && gameState !== 'LOST') return null;

    const isP1Winner = winner === 'p1';
    const isSingleMatch = !isTowerMode && !isEndlessMode;
    
    // Split Screen Styles
    const leftBg = isP1Winner ? `${p1Profile.bg} opacity-20` : 'bg-stone-900 opacity-90';
    const rightBg = !isP1Winner ? `${p2Profile.bg} opacity-20` : 'bg-stone-900 opacity-90';
    
    const DataRow = ({ label, p1Val, p2Val, highlightP1, highlightP2 }: { label: string, p1Val: number | string, p2Val?: number | string, highlightP1?: boolean, highlightP2?: boolean }) => (
        <div className="flex justify-between items-center w-full py-1.5 text-sm font-bold uppercase border-b border-white/5">
            <div className={`w-1/2 pr-4 text-right ${highlightP1 ? 'text-lime-400' : (isP1Winner ? 'text-green-200' : 'text-stone-400')} text-outline-black text-xl`}>{p1Val}</div>
            <div className="text-stone-500 text-[10px] tracking-widest px-2 min-w-[120px] text-center">{label}</div>
            {p2Val !== undefined && <div className={`w-1/2 pl-4 text-left ${highlightP2 ? 'text-lime-400' : (!isP1Winner ? 'text-green-200' : 'text-stone-400')} text-outline-black text-xl`}>{p2Val}</div>}
        </div>
    );

    return (
        <div className="absolute inset-0 z-[9999] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center animate-fade-in pointer-events-auto">
            {/* BACKGROUND SPLIT */}
            <div className="absolute inset-0 flex pointer-events-none">
                <div className={`w-1/2 h-full relative border-r border-white/10`}>
                    <div className={`absolute inset-0 ${leftBg}`}></div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-10">
                        <div className={`w-96 h-96 rounded-full blur-[100px] ${p1Profile.bg}`}></div>
                    </div>
                </div>
                <div className={`w-1/2 h-full relative border-l border-white/10`}>
                    <div className={`absolute inset-0 ${rightBg}`}></div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-10">
                        <div className={`w-96 h-96 rounded-full blur-[100px] ${p2Profile.bg}`}></div>
                    </div>
                </div>
            </div>

            {/* CONTENT CARD */}
            <div className="relative bg-stone-950 border border-stone-700 w-full max-w-4xl shadow-[0_0_100px_rgba(0,0,0,0.8)] rounded-2xl overflow-hidden transform transition-all scale-100 flex flex-col">
                
                {/* HEADER */}
                <div className="flex h-32 border-b border-stone-800">
                    <div className="w-full flex flex-col items-center justify-center bg-black/40 relative overflow-hidden">
                        <div className="absolute inset-0 opacity-20 bg-gradient-to-b from-transparent to-black"></div>
                        <h1 className={`text-7xl font-black font-chivo italic tracking-widest uppercase drop-shadow-[0_5px_5px_rgba(0,0,0,1)] text-outline-black ${isP1Winner ? 'text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 via-amber-500 to-amber-700' : 'text-stone-600'}`}>
                            {gameState}
                        </h1>
                        <div className="text-stone-400 font-bold uppercase tracking-[0.5em] text-xs mt-2 relative z-10">{endGameReason}</div>
                    </div>
                </div>

                {/* STATS BODY */}
                <div className="p-8 bg-black/60 flex flex-col gap-2">
                    <div className="flex justify-between items-end mb-6 border-b-2 border-stone-700 pb-2">
                        <span className={`text-2xl font-black uppercase tracking-widest ${p1Profile.text} drop-shadow-md`}>{p1Profile.name}</span>
                        <div className="flex flex-col items-center">
                            <span className="text-stone-600 font-black text-[10px] tracking-[0.2em] uppercase">TOTAL RUNTIME</span>
                            <span className="text-white font-mono text-xl text-shadow-sm">{runTime}</span>
                        </div>
                        <span className={`text-2xl font-black uppercase tracking-widest ${isSingleMatch ? p2Profile.text : 'text-red-500'} drop-shadow-md`}>{isSingleMatch ? p2Profile.name : (isTowerMode ? 'ROGUE TOWER' : 'THE HORDE')}</span>
                    </div>

                    {!isSingleMatch ? (
                        <>
                            {/* ENDLESS / TOWER STATS */}
                            <DataRow label="STAGE REACHED" p1Val={stageNumber} highlightP1={true} />
                            <DataRow label="ENEMIES DEFEATED" p1Val={stats.cumulative?.totalEnemiesDefeated ?? 0} />
                            <DataRow label="TOTAL DAMAGE DEALT" p1Val={stats.p1.dmg} />
                            <DataRow label="TOTAL BUILT" p1Val={stats.p1.built} />
                            <DataRow label="TOTAL RES SPENT" p1Val={stats.p1.totalCost} />
                            <div className="my-2 border-t border-white/5"></div>
                            <div className="text-center text-xs text-stone-500 font-bold uppercase tracking-widest mb-2">ENEMY AGGREGATE STATS</div>
                            <DataRow label="TOTAL CARDS PLAYED" p1Val={stats.cumulative?.totalCardsPlayedByCpu ?? 0} />
                            <DataRow label="TOTAL RESOURCES USED" p1Val={stats.cumulative?.totalCpuCost ?? 0} />
                        </>
                    ) : (
                        <>
                            {/* SINGLE MATCH STATS */}
                            <DataRow label="TOTAL BUILT" p1Val={stats.p1.built} p2Val={stats.p2.built} />
                            <DataRow label="DAMAGE DEALT" p1Val={stats.p1.dmg} p2Val={stats.p2.dmg} />
                            <DataRow label="CARDS USED" p1Val={stats.p1.cardsUsed} p2Val={stats.p2.cardsUsed} />
                            <DataRow label="RESOURCES SPENT" p1Val={stats.p1.totalCost} p2Val={stats.p2.totalCost} />
                            <DataRow label="DISCARDS" p1Val={stats.p1.cardsDiscarded} p2Val={stats.p2.cardsDiscarded} />
                        </>
                    )}
                </div>

                {/* FOOTER */}
                <div className="p-6 bg-stone-900 flex justify-center gap-6 border-t border-stone-800 z-20">
                    <button onClick={onRestart} className="group relative px-10 py-4 bg-lime-600 hover:bg-lime-500 text-black font-black rounded text-lg uppercase tracking-widest shadow-[0_0_20px_rgba(132,204,22,0.3)] transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(132,204,22,0.6)] overflow-hidden">
                        <span className="relative z-10 flex items-center gap-2"><span>PLAY AGAIN</span></span>
                        <div className="absolute inset-0 bg-white/30 transform -skew-x-12 translate-x-full group-hover:translate-x-0 transition-transform duration-300"></div>
                    </button>
                    <button onClick={onMenu} className="px-8 py-4 bg-transparent border-2 border-stone-600 hover:border-white text-stone-400 hover:text-white font-black rounded text-lg uppercase tracking-widest transition-all hover:scale-105">MAIN MENU</button>
                </div>
            </div>
        </div>
    );
});