import { CardType, PlayerStats } from '../types';

export const audioCtxRef: { current: AudioContext | null } = { current: null };
// We add a Master Compressor node ref to handle the dynamics processing
const masterCompressorRef: { current: DynamicsCompressorNode | null } = { current: null };

export let sfxEnabledRef = true;
export let musicEnabledRef = true;
const musicIntervalRef: { current: any } = { current: null };

// Global tempo variable (Seconds per 16th note)
export let musicTempo = 0.22;

export const initAudio = () => {
    if (!audioCtxRef.current) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
            audioCtxRef.current = new AudioContext();
            
            // --- NEW: STUDIO COMPRESSOR SETUP ---
            // This prevents "graininess" (clipping) and "volume jumping"
            const ctx = audioCtxRef.current;
            const compressor = ctx.createDynamicsCompressor();
            
            // Hard knee/High ratio acts as a Limiter to catch loud peaks (Kick + Bass)
            compressor.threshold.setValueAtTime(-12, ctx.currentTime); // Start compressing earlier
            compressor.knee.setValueAtTime(10, ctx.currentTime);
            compressor.ratio.setValueAtTime(12, ctx.currentTime); // High ratio prevents distortion
            compressor.attack.setValueAtTime(0.002, ctx.currentTime); // Very fast attack to catch clicks
            compressor.release.setValueAtTime(0.25, ctx.currentTime); // Smooth release

            compressor.connect(ctx.destination);
            masterCompressorRef.current = compressor;
        }
    }
};

// Helper to get the output node (Compressor) instead of destination directly
const getOutput = () => {
    return masterCompressorRef.current || audioCtxRef.current?.destination;
};

// --- DYNAMIC BPM LOGIC ---
export const updateMusicTempoByHP = (p1Stats: any, p2Stats: any) => {
    const p1Total = (p1Stats?.king || 0) + (p1Stats?.tower || 0) + (p1Stats?.wall || 0);
    const p2Total = (p2Stats?.king || 0) + (p2Stats?.tower || 0) + (p2Stats?.wall || 0);
    const lowestHP = Math.min(p1Total, p2Total);
    const HP_ANCHOR = 50;
    const TEMPO_FASTEST = 0.13; 
    const TEMPO_ANCHOR = 0.22;  
    const TEMPO_SLOWEST = 0.26; 

    if (lowestHP < HP_ANCHOR) {
        const ratio = Math.max(0, lowestHP) / HP_ANCHOR; 
        musicTempo = TEMPO_FASTEST + (ratio * (TEMPO_ANCHOR - TEMPO_FASTEST));
    } else {
        const clampedHP = Math.min(150, lowestHP);
        const ratio = (clampedHP - HP_ANCHOR) / (150 - HP_ANCHOR);
        musicTempo = TEMPO_ANCHOR + (ratio * (TEMPO_SLOWEST - TEMPO_ANCHOR));
    }
};

export const updateMusicTempo = (newTempo: number) => { 
    musicTempo = Math.max(0.13, Math.min(0.26, newTempo));
};

// --- SYNTHESIS ENGINE ---

export const playTone = (freq: number, type: OscillatorType, duration: number, vol: number, time: number, category = 'sfx') => {
    if (!audioCtxRef.current) return;
    if (category === 'music' && !musicEnabledRef) return;
    if (category === 'sfx' && !sfxEnabledRef) return;
    const ctx = audioCtxRef.current;
    const output = getOutput();
    if (!output) return;

    // SFX Logic
    if (category === 'sfx') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, time);
        
        // TUNING: Smoother attack to prevent clicking
        gain.gain.setValueAtTime(0.0001, time); 
        gain.gain.linearRampToValueAtTime(vol, time + 0.01); // 10ms fade in
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration); // Fade out

        osc.connect(gain);
        gain.connect(output);
        osc.start(time);
        osc.stop(time + duration + 0.1);
        return;
    }

    // MUSIC: "Uplifting Dream" Sound (Brightened FM)
    // PRESERVED: Exact sound structure, just cleaner gain staging
    const carrier = ctx.createOscillator();
    const modulator = ctx.createOscillator();
    const modGain = ctx.createGain();
    const masterGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(freq, time);

    modulator.type = 'triangle';
    modulator.frequency.setValueAtTime(freq * 2, time); 

    modGain.gain.setValueAtTime(30, time);
    modGain.gain.linearRampToValueAtTime(5, time + duration);

    filter.type = "lowpass";
    filter.Q.value = 0.6; 
    filter.frequency.setValueAtTime(800, time);
    filter.frequency.linearRampToValueAtTime(4000, time + 0.08); 
    filter.frequency.exponentialRampToValueAtTime(600, time + duration);

    // TUNING: Capped max volume. Your previous * 1.2 pushed it over the limit.
    const finalVol = Math.min(vol * 0.8, 0.5); 
    
    masterGain.gain.setValueAtTime(0.0001, time); // Start at 0 to avoid pop
    masterGain.gain.linearRampToValueAtTime(finalVol, time + 0.05); // Attack
    masterGain.gain.exponentialRampToValueAtTime(0.001, time + duration + 0.5); // Release

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    
    carrier.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(output); // Connect to compressor, not destination

    carrier.start(time); carrier.stop(time + duration + 0.6);
    modulator.start(time); modulator.stop(time + duration + 0.6);
};

// THE "DEEP HEART" KICK
export const playPunchyKick = (time: number) => {
    if (!audioCtxRef.current || !musicEnabledRef) return;
    const ctx = audioCtxRef.current;
    const output = getOutput();
    if (!output) return;
    
    // 1. The Sub Body
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine'; 
    osc.frequency.setValueAtTime(110, time); 
    osc.frequency.exponentialRampToValueAtTime(10, time + 0.5);
    
    // TUNING: Reduced from 3.0 to 1.2. 
    // 3.0 was causing the "graininess" (digital clipping). 
    // The compressor will makeup the gain so it still punches.
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(1.2, time + 0.005); // Super fast attack, but not instant
    gain.gain.exponentialRampToValueAtTime(0.8, time + 0.15); 
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.8); 
    
    osc.connect(gain); 
    gain.connect(output); 
    osc.start(time); 
    osc.stop(time + 0.85);

    // 2. The Transient (Click)
    const clickOsc = ctx.createOscillator(); 
    const clickGain = ctx.createGain(); 
    
    clickOsc.type = 'square'; 
    clickOsc.frequency.setValueAtTime(1200, time);
    clickOsc.frequency.exponentialRampToValueAtTime(100, time + 0.02);
    
    clickGain.gain.setValueAtTime(0.001, time);
    clickGain.gain.linearRampToValueAtTime(0.3, time + 0.002); // Lowered slightly
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
    
    clickOsc.connect(clickGain); 
    clickGain.connect(output); 
    clickOsc.start(time); 
    clickOsc.stop(time + 0.03);
};

// Deep Drone Bass
export const playPunchyBass = (freq: number, time: number, duration: number) => {
    if (!audioCtxRef.current || !musicEnabledRef) return;
    const ctx = audioCtxRef.current;
    const output = getOutput();
    if (!output) return;
    
    const osc = ctx.createOscillator(); 
    const osc2 = ctx.createOscillator(); 
    const gain = ctx.createGain(); 
    const filter = ctx.createBiquadFilter();
    
    osc.type = 'sawtooth'; 
    osc.frequency.setValueAtTime(freq, time); 

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq / 2, time); 
    
    filter.type = "lowpass"; 
    filter.Q.value = 1.0; 
    filter.frequency.setValueAtTime(200, time); 
    filter.frequency.linearRampToValueAtTime(400, time + 0.1); 
    filter.frequency.exponentialRampToValueAtTime(100, time + duration);
    
    // TUNING: Fixed volume jumping. 
    // Ensured fade-in (attack) exists so it doesn't click against the previous note.
    gain.gain.setValueAtTime(0.0001, time); 
    gain.gain.linearRampToValueAtTime(0.4, time + 0.05); 
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration + 0.1);
    
    osc.connect(filter); 
    osc2.connect(filter);
    filter.connect(gain); 
    gain.connect(output);
    
    osc.start(time); osc.stop(time + duration + 0.2); 
    osc2.start(time); osc2.stop(time + duration + 0.2);
};

export const startMusic = () => {
    if (!audioCtxRef.current || !musicEnabledRef || musicIntervalRef.current) return;
    const ctx = audioCtxRef.current;
    
    // Scale: A MINOR (Natural)
    const root = 220.00; // A3
    const scale = [
        root,           // 0: A
        root * 1.122,   // 1: B
        root * 1.189,   // 2: C (Minor 3rd)
        root * 1.335,   // 3: D
        root * 1.498,   // 4: E (5th)
        root * 1.587,   // 5: F (Minor 6th)
        root * 1.782,   // 6: G (Minor 7th)
        root * 2.000    // 7: A (Octave)
    ];

    // CHORD PROGRESSION: Am -> F -> C -> G

    // --- MELODY PATTERNS ---
    
    // Theme A: The "Nostalgia" (Grounding)
    const themeA = [
        0, -1, 2, -1, 4, -1, 2, -1, 
        7, 4, 2, 0, 2, -1, -1, -1,  
        0, 2, 4, 5, 4, 2, 0, -1,    
        2, 0, -1, -1, 0, -1, -1, -1 
    ];

    // Theme B: The "Uplift" (Reaching Higher)
    const themeB = [
        4, 5, 7, 9, 7, 5, 4, 7,     // Ascending line to high B (index 9)
        7, 9, 10, 9, 7, 9, 7, 5,    // Touching High C (index 10) - Victory feel
        4, 5, 7, 5, 4, 2, 0, 2,     // Falling back gracefully
        0, 2, 4, 2, 0, -1, -1, -1   // Resolution
    ];

    // Arp Pattern (Background movement)
    const arpAm = [0, 2, 4, 7, 4, 2, 0, 2];
    const arpF  = [5, 0, 2, 5, 2, 0, 5, 0];
    const arpC  = [2, 4, 6, 2, 6, 4, 2, 4];
    const arpG  = [6, 1, 3, 6, 3, 1, 6, 1];

    // Assemble Full Melody Structure
    const fullMelody = [
        // INTRO
        ...themeA, ...themeA,
        // UPLIFTING SECTION
        ...themeB, ...themeB,
        // BREAKDOWN (Arps)
        ...arpAm, ...arpAm, ...arpF, ...arpF, ...arpC, ...arpC, ...arpG, ...arpG,
        // CLIMAX (High Energy Theme B)
        ...themeB, ...themeA
    ];

    // --- BASS LINES ---
    const bassRoot = (noteIdx: number) => {
        const arr = Array(32).fill(-1);
        arr[0] = noteIdx; 
        arr[3] = noteIdx; 
        arr[8] = noteIdx;
        arr[14] = noteIdx;
        return arr;
    };

    const bassProgression = [
        ...bassRoot(0), ...bassRoot(5), ...bassRoot(2), ...bassRoot(6)
    ];

    const finalBassLine = [
        ...bassProgression,
        ...bassProgression,
        ...bassProgression,
        ...bassProgression
    ];

    const seqLength = fullMelody.length; 
    let step = 0; 
    const scheduleAhead = 0.1; 
    let nextNoteTime = ctx.currentTime;
    
    const scheduler = () => {
        if (!musicEnabledRef) { 
            if (musicIntervalRef.current) { clearInterval(musicIntervalRef.current); musicIntervalRef.current = null; } 
            return; 
        }
        if (ctx.state !== 'running') { nextNoteTime = ctx.currentTime; return; }
        
        while (nextNoteTime < ctx.currentTime + scheduleAhead) {
            const beatDuration = musicTempo; 
            const time = nextNoteTime; 
            const currentStep = step % seqLength;
            
            // 1. KICK
            if (currentStep % 4 === 0) {
                 playPunchyKick(time);
            }

            // 2. BASS
            const bassIdx = finalBassLine[currentStep % finalBassLine.length];
            if (bassIdx !== -1) {
                let bFreq = scale[bassIdx % 8];
                if (bassIdx >= 5) bFreq = bFreq * 0.5; 
                playPunchyBass(bFreq * 0.5, time, beatDuration * 2);
            }

            // 3. MELODY
            const melIdx = fullMelody[currentStep];
            if (melIdx !== -1) {
                // Handle extended range (indices > 7)
                let mFreq = 0;
                if (melIdx < 8) {
                    mFreq = scale[melIdx];
                } else if (melIdx < 16) {
                    mFreq = scale[melIdx - 8] * 2; // +1 Octave
                } else {
                    mFreq = scale[melIdx - 16] * 4; // +2 Octaves (if needed)
                }
                
                // Add expression
                const vel = (currentStep % 16 === 0) ? 0.08 : 0.05;
                const dur = (currentStep % 2 === 0) ? beatDuration * 1.5 : beatDuration * 0.8;

                playTone(mFreq * 2, 'sine', dur, vel, time, 'music');
                playTone(mFreq * 2, 'sine', dur, vel * 0.3, time + 0.2, 'music');
            }

            nextNoteTime += beatDuration; 
            step++;
        }
    };
    musicIntervalRef.current = setInterval(scheduler, 50);
};

export const resumeAudioContext = (setAudioReadyState?: any) => {
    initAudio();
    if (!audioCtxRef.current) return;
    if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().then(() => { 
            if(setAudioReadyState) setAudioReadyState(true); 
            if (musicEnabledRef) startMusic(); 
        }).catch(e => console.error(e));
    } else { 
        if(setAudioReadyState) setAudioReadyState(true); 
        if (musicEnabledRef && !musicIntervalRef.current) startMusic(); 
    }
};

export const toggleSfx = (setSfxState: any) => {
    if (!audioCtxRef.current) initAudio();
    const newState = !sfxEnabledRef; sfxEnabledRef = newState; setSfxState(newState);
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume().then(() => playSFX('button_click')); else playSFX('button_click');
};

export const toggleMusic = (setMusicState: any) => {
    if (!audioCtxRef.current) initAudio();
    const newState = !musicEnabledRef; musicEnabledRef = newState; setMusicState(newState);
    const runMusicLogic = () => { playSFX('button_click'); if (newState) startMusic(); else if (musicIntervalRef.current) { clearInterval(musicIntervalRef.current); musicIntervalRef.current = null; } };
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume().then(runMusicLogic); else runMusicLogic();
};

export const playSFX = (type: string) => {
    if (!audioCtxRef.current || !sfxEnabledRef) return;
    const now = audioCtxRef.current.currentTime;
    const ctx = audioCtxRef.current;
    const output = getOutput();
    if (!output) return;
    
    const createFilteredOsc = (ftype: OscillatorType, freq: number, startTime: number) => {
        const osc = ctx.createOscillator(); 
        const gain = ctx.createGain(); 
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass"; 
        filter.frequency.setValueAtTime(12000, startTime); 
        osc.type = ftype; 
        osc.frequency.setValueAtTime(freq, startTime); 
        osc.connect(gain); 
        gain.connect(filter); 
        filter.connect(output); // Connect to compressor
        return { osc, gain };
    };

    if (type === 'button_click') playTone(800, 'sine', 0.05, 0.4, now, 'sfx');
    else if (type === 'discard_click') playTone(600, 'sine', 0.05, 0.3, now, 'sfx');
    else if (type === 'click') playTone(800, 'sine', 0.04, 1.5, now, 'sfx');
    else if (type === 'play_card') playTone(600, 'sine', 0.1, 1.2, now, 'sfx');
    else if (type === 'projectile_launch') {
        const { osc, gain } = createFilteredOsc('triangle', 200, now); 
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.3);
        gain.gain.setValueAtTime(0.001, now); 
        gain.gain.linearRampToValueAtTime(0.8, now + 0.05); 
        gain.gain.linearRampToValueAtTime(0.001, now + 0.3);
        osc.start(now); osc.stop(now + 0.35);
    } 
    else if (type === 'build_grow') {
        const { osc, gain } = createFilteredOsc('triangle', 200, now); 
        osc.frequency.linearRampToValueAtTime(600, now + 0.4);
        gain.gain.setValueAtTime(0.001, now); 
        gain.gain.linearRampToValueAtTime(0.8, now + 0.1); 
        gain.gain.linearRampToValueAtTime(0.001, now + 0.4);
        osc.start(now); osc.stop(now + 0.45);
    } 
    else if (type === 'magic') { 
        playTone(800, 'sine', 0.3, 1.0, now, 'sfx'); // Slightly lowered gain
        playTone(1200, 'sine', 0.3, 0.7, now + 0.1, 'sfx'); 
        playTone(1500, 'sine', 0.4, 0.35, now + 0.2, 'sfx'); 
    }
    else if (type === 'buff') { 
        playTone(400, 'triangle', 0.15, 0.6, now, 'sfx'); 
        playTone(500, 'triangle', 0.15, 0.6, now + 0.1, 'sfx'); 
    }
    else if (type === 'bow') playTone(1200, 'triangle', 0.05, 0.8, now, 'sfx');
    else if (type === 'hit_wall') { playTone(100, 'sawtooth', 0.25, 0.3, now, 'sfx'); playTone(60, 'square', 0.25, 0.3, now, 'sfx'); }
    else if (type === 'hit_tower') { playTone(180, 'square', 0.2, 0.3, now, 'sfx'); playTone(140, 'sawtooth', 0.2, 0.3, now, 'sfx'); }
    else if (type === 'hit_king') { playTone(500, 'square', 0.1, 0.3, now, 'sfx'); playTone(400, 'sawtooth', 0.4, 0.3, now + 0.1, 'sfx'); playTone(300, 'sine', 0.5, 0.35, now + 0.2, 'sfx'); }
    else if (type === 'victory') { playTone(523.25, 'triangle', 0.2, 0.4, now, 'sfx'); playTone(659.25, 'triangle', 0.2, 0.4, now + 0.15, 'sfx'); playTone(783.99, 'triangle', 0.2, 0.4, now + 0.3, 'sfx'); playTone(1046.50, 'square', 0.8, 0.3, now + 0.45, 'sfx'); }
    else if (type === 'defeat') { playTone(392.00, 'sawtooth', 0.4, 0.4, now, 'sfx'); playTone(369.99, 'sawtooth', 0.4, 0.4, now + 0.3, 'sfx'); playTone(349.23, 'sawtooth', 0.4, 0.4, now + 0.6, 'sfx'); playTone(311.13, 'sawtooth', 0.8, 0.4, now + 0.9, 'sfx'); }
};