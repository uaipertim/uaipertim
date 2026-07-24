import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';

interface AppSplashScreenProps {
  onAnimationComplete?: () => void;
}

export const AppSplashScreen: React.FC<AppSplashScreenProps> = ({ onAnimationComplete }) => {
  const [reducedMotion, setReducedMotion] = useState(false);

  // Monitor prefers-reduced-motion for accessibility
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);
    
    const listener = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };
    
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  return (
    <motion.div
      id="uaipertim-splash"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      aria-label="Carregando UaiPertim"
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.35, ease: 'easeInOut' } }}
      onAnimationComplete={(definition) => {
        if (definition === 'exit' && onAnimationComplete) {
          onAnimationComplete();
        }
      }}
      className="fixed inset-0 w-full min-h-[100dvh] bg-[#FAF8F5] flex flex-col items-center justify-between py-12 px-6 overflow-hidden select-none"
      style={{
        zIndex: 99999,
        paddingTop: 'calc(3rem + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(3rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {/* Spacer to push content down */}
      <div className="w-full shrink-0 h-4" />

      {/* Main Branding Section */}
      <div className="flex flex-col items-center justify-center text-center max-w-[280px] w-full">
        {/* Official Brand Logo */}
        <motion.img
          initial={reducedMotion ? { scale: 1 } : { scale: 0.8, opacity: 0, y: 15 }}
          animate={reducedMotion ? { scale: 1, opacity: 1, y: 0 } : { 
            scale: [1, 1.03, 1],
            opacity: 1,
            y: 0,
            transition: {
              scale: {
                repeat: Infinity,
                duration: 2.2,
                ease: 'easeInOut'
              },
              opacity: { duration: 0.5 },
              y: { duration: 0.5, ease: 'easeOut' }
            }
          }}
          src="/brand/uaipertim-logo-oficial-v2.png"
          alt="UaiPertim Logo Oficial"
          referrerPolicy="no-referrer"
          className="w-56 h-56 shrink-0 select-none pointer-events-none object-contain"
          loading="eager"
          decoding="async"
          {...{ fetchPriority: "high" }}
        />

        {/* FEITO EM MINAS signature */}
        <motion.div
          initial={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#E94F2F]/15 bg-[#E94F2F]/[0.05] px-3.5 py-1.5 shadow-xs font-sans text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#753326] select-none"
        >
          <span className="w-1.25 h-1.25 rounded-full bg-[#E94F2F]" />
          <span>Feito em Minas</span>
          <span className="w-1.25 h-1.25 rounded-full bg-[#F59E0B]" />
        </motion.div>
      </div>

      {/* Discrete Regional Loading Indicator at bottom */}
      <div className="flex flex-col items-center gap-4 shrink-0">
        <div className="flex items-center justify-center gap-2.5">
          {reducedMotion ? (
            <span className="text-xs font-bold text-[#756B66]/60">Carregando...</span>
          ) : (
            [0, 1, 2].map((i) => (
              <motion.span
                key={i}
                animate={{
                  scale: [1, 1.4, 1],
                  opacity: [0.4, 1, 0.4],
                }}
                transition={{
                  repeat: Infinity,
                  duration: 1.2,
                  delay: i * 0.2,
                  ease: 'easeInOut',
                }}
                className="w-2.5 h-2.5 rounded-full bg-[#E94F2F]"
              />
            ))
          )}
        </div>
        
        {/* Screen Reader Only Loading Text */}
        <span className="sr-only">Carregando o aplicativo UaiPertim</span>
      </div>
    </motion.div>
  );
};
