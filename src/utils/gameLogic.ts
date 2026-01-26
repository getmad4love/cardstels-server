
import { PlayerStats, CardType } from "../types";
import { calculateDamage, activeKingBuff } from "../data/cards";
import { MAX_WALL, WIN_TOWER, WIN_KING_MAX, MAX_SHIELD } from "../utils/constants";
import { Logger } from "./Logger";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface ArcherDamageProps {
    source: PlayerStats;
    target: PlayerStats;
    direction: string; // 'RIGHT' (P1->P2) or 'LEFT' (P2->P1)
    setTargetStats: React.Dispatch<React.SetStateAction<PlayerStats>>;
    setSourceStats: React.Dispatch<React.SetStateAction<PlayerStats>>; // To update Shield break effect if reflected?
    addLogFunc: (msg: string, type: string, isRawHtml?: boolean) => void;
    kingCards: CardType[];
    playSFX: (key: string) => void;
    triggerAnimation: (type: string, direction: string) => void;
    spawnParticles: (x: number, y: number, scale: number, type: string) => void;
    updateGameStats: (playerKey: string, category: string, amount: number) => void;
    playDamageSoundIfAny: (prev: PlayerStats, next: PlayerStats) => void;
    labels: { p1: string; p2: string };
}

export const triggerArcherDamage = async (props: ArcherDamageProps) => {
    const { 
        source, target, direction, setTargetStats, addLogFunc, kingCards, 
        playSFX, triggerAnimation, spawnParticles, updateGameStats, 
        playDamageSoundIfAny, labels 
    } = props;

    // Archer fires if Wall >= 50
    if (source.wall < 50) return;

    let damage = Math.min(5, Math.floor((source.wall - 40) / 10));
    if (kingCards && activeKingBuff(kingCards, 'k_wsnip')) damage = 5;

    playSFX('bow');
    
    // Check if target has shield BEFORE animation to decide bounce or lob
    if (target.shield > 0) {
        triggerAnimation('ARROW_BOUNCE', direction);
    } else {
        triggerAnimation('ARROW_LOB', direction);
    }
    
    await delay(800);

    setTargetStats(prev => {
        // FIX: Shield completely blocks archer fire
        if (prev.shield > 0) {
            playSFX('hit_wall'); // Metal bounce sound? 'shield_block' would be better if available
            const targetName = direction === 'RIGHT' ? labels.p2 : labels.p1;
            const logType = direction === 'RIGHT' ? 'OPPONENT' : 'PLAYER';
            addLogFunc(Logger.special(targetName, "SHIELD BLOCKED ARCHER!"), logType, true);
            // Shield does not break from archer fire in this version unless specified
            // Maybe slight degradation? For now, total block as per request "bounce off"
            return prev;
        }

        let newStats = calculateDamage(prev, damage);
        
        // Handle Shield Break if calculateDamage reduced it to 0 (though logic above catches shield > 0)
        // Leaving this here if logic changes later to allow piercing
        const hadShield = prev.shield > 0;
        const hasShield = newStats.shield > 0;

        if (hadShield && !hasShield) {
            // Center of shield spawn
            spawnParticles(direction === 'RIGHT' ? window.innerWidth * 0.8 : window.innerWidth * 0.2, window.innerHeight * 0.5, 1, 'GLASS');
            playSFX('hit_wall'); 
            addLogFunc(Logger.special(direction === 'RIGHT' ? labels.p2 : labels.p1, "SHIELD SHATTERED!"), "WARNING", true);
        }

        playDamageSoundIfAny(prev, newStats);
        
        const diffLog = Logger.diff(prev, newStats, direction === 'LEFT'); 
        const targetName = direction === 'RIGHT' ? labels.p2 : labels.p1;
        const logType = direction === 'RIGHT' ? 'OPPONENT' : 'PLAYER';
        
        if (diffLog) addLogFunc(`${targetName}: ${diffLog}`, logType, true);
        
        let dealt = 0;
        if (newStats.king < prev.king) dealt += (prev.king - newStats.king);
        if (newStats.tower < prev.tower) dealt += (prev.tower - newStats.tower);
        if (newStats.wall < prev.wall) dealt += (prev.wall - newStats.wall);
        
        if (dealt > 0) {
            if (direction === 'RIGHT') { 
                updateGameStats('p1', 'dmg', dealt); 
                updateGameStats('p2', 'taken', dealt); 
            } else { 
                updateGameStats('p2', 'dmg', dealt); 
                updateGameStats('p1', 'taken', dealt); 
            }
        }
        
        return { 
            ...newStats, 
            wall: Math.min(MAX_WALL, newStats.wall), 
            tower: Math.min(WIN_TOWER, newStats.tower), 
            king: Math.min(WIN_KING_MAX, newStats.king) 
        };
    });
    
    await delay(200);
};
