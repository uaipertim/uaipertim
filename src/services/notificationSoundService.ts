
export const NEW_ORDER_SOUND_GAIN = 0.2;
export const NEW_MESSAGE_SOUND_GAIN = 0.15;

let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (!audioContext) {
    const AudioContextClass =
      (window as any).AudioContext ||
      (window as any).webkitAudioContext;
    audioContext = new AudioContextClass();
  }
  return audioContext;
}

export const playNewOrderSound = async () => {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();
  
  // Three ascending notes: 440Hz, 554Hz, 659Hz
  const notes = [440, 554, 659];
  const now = ctx.currentTime;
  
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + i * 0.25);
    
    gain.gain.setValueAtTime(0, now + i * 0.25);
    gain.gain.linearRampToValueAtTime(NEW_ORDER_SOUND_GAIN, now + i * 0.25 + 0.05);
    gain.gain.linearRampToValueAtTime(0, now + i * 0.25 + 0.2);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now + i * 0.25);
    osc.stop(now + i * 0.25 + 0.25);
  });
};

export const ensureAudioContextRunning = async () => {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  return ctx.state;
};

export const playNewMessageSound = async () => {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();
  
  // Two soft notes: 659Hz, 554Hz
  const notes = [659, 554];
  const now = ctx.currentTime;
  
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + i * 0.15);
    
    gain.gain.setValueAtTime(0, now + i * 0.15);
    gain.gain.linearRampToValueAtTime(NEW_MESSAGE_SOUND_GAIN, now + i * 0.15 + 0.05);
    gain.gain.linearRampToValueAtTime(0, now + i * 0.15 + 0.15);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now + i * 0.15);
    osc.stop(now + i * 0.15 + 0.2);
  });
};
