
import React from 'react';
import { Volume2, VolumeX, AlertCircle } from 'lucide-react';
import { useMerchantNotificationSounds } from '../../hooks/useMerchantNotificationSounds';

export const NotificationSoundControl: React.FC<{ showLabel?: boolean }> = ({ showLabel }) => {
  const { soundPreferenceEnabled, soundSessionUnlocked, setSoundPreference, enableMerchantSounds } = useMerchantNotificationSounds();

  const toggleSound = () => {
    setSoundPreference(!soundPreferenceEnabled);
  };

  const unlockAudio = async () => {
    await enableMerchantSounds();
  };

  const getStatusText = () => {
    if (!soundPreferenceEnabled) return 'Desligado';
    if (!soundSessionUnlocked) return 'Pendente';
    return 'Ligado';
  };

  const handleCardClick = () => {
    if (!soundPreferenceEnabled) {
      toggleSound();
    } else if (!soundSessionUnlocked) {
      unlockAudio();
    } else {
      toggleSound();
    }
  };

  if (showLabel) {
    return (
      <button 
        onClick={handleCardClick} 
        className="flex items-center justify-between w-full"
      >
        <div className="text-left min-w-0">
          <p className="text-[10px] font-black text-[#756B66] uppercase leading-tight truncate">SOM</p>
          <p className={`text-[14px] font-black leading-tight truncate ${soundPreferenceEnabled && soundSessionUnlocked ? 'text-[#2F9E69]' : 'text-gray-500'}`}>
            {getStatusText()}
          </p>
        </div>
        <div className={`p-1.5 rounded-lg transition-all shrink-0 ${soundPreferenceEnabled && soundSessionUnlocked ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          {soundPreferenceEnabled && soundSessionUnlocked ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </div>
      </button>
    );
  }

  if (!soundPreferenceEnabled) {
    return (
      <button onClick={toggleSound} className="p-2 text-gray-500 hover:text-orange-500" aria-label="Ativar alertas sonoros">
        <VolumeX size={20} />
      </button>
    );
  }

  if (!soundSessionUnlocked) {
    return (
      <button onClick={unlockAudio} className="p-2 text-orange-500 animate-pulse" aria-label="Ativar som nesta sessão">
        <AlertCircle size={20} />
      </button>
    );
  }

  return (
    <button onClick={toggleSound} className="p-2 text-green-500 hover:text-orange-500" aria-label="Silenciar alertas sonoros">
      <Volume2 size={20} />
    </button>
  );
};
