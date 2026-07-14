import React from 'react';
import { User, Check } from 'lucide-react';

export const AVATAR_PRESETS = [
  { key: 'pao_de_queijo', emoji: '🧀', label: 'Pão de Queijo', bgColor: 'bg-[#FFF7ED] border-[#FED7AA]' },
  { key: 'cafezinho', emoji: '☕', label: 'Cafezinho Coado', bgColor: 'bg-[#FAF7F2] border-[#E8DFD0]' },
  { key: 'doce_de_leite', emoji: '🍯', label: 'Doce de Leite', bgColor: 'bg-[#FFFDF5] border-[#FEF08A]' },
  { key: 'broa', emoji: '🌽', label: 'Broa de Milho', bgColor: 'bg-[#FEFCE8] border-[#FEF08A]' },
  { key: 'goiabada', emoji: '🍓', label: 'Goiabada Cascão', bgColor: 'bg-[#FFF1F2] border-[#FECDD3]' },
  { key: 'pastel', emoji: '🥐', label: 'Pastel Frito', bgColor: 'bg-[#FFF7ED] border-[#FDBA74]' },
  { key: 'frango', emoji: '🍛', label: 'Frango com Quiabo', bgColor: 'bg-[#F0FDF4] border-[#BBF7D0]' },
];

export const getAvatarColor = (name: string) => {
  const colors = [
    'bg-[#FFE4E6] text-[#E11D48] border-[#FECDD3]', // Rose
    'bg-[#F0FDF4] text-[#16A34A] border-[#BBF7D0]', // Green
    'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]', // Blue
    'bg-[#FEFCE8] text-[#CA8A04] border-[#FEF08A]', // Yellow
    'bg-[#FAF5FF] text-[#9333EA] border-[#E9D5FF]', // Purple
    'bg-[#FFF7ED] text-[#EA580C] border-[#FFEDD5]', // Orange
    'bg-[#FFF1F2] text-[#E11D48] border-[#FFE4E6]', // Red
    'bg-[#F0FDFA] text-[#0D9488] border-[#CCFBF1]', // Teal
  ];
  if (!name) return colors[0];
  let sum = 0;
  for (let i = 0; i < name.length; i++) {
    sum += name.charCodeAt(i);
  }
  return colors[sum % colors.length];
};

export const getInitials = (name: string) => {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].substring(0, 2).toUpperCase();
};

export const RenderAvatar: React.FC<{
  name: string;
  avatarType?: 'initials' | 'preset';
  avatarKey?: string | null;
  className?: string;
}> = ({ name, avatarType = 'initials', avatarKey, className = 'w-12 h-12' }) => {
  if (avatarType === 'preset' && avatarKey) {
    const preset = AVATAR_PRESETS.find(p => p.key === avatarKey);
    if (preset) {
      return (
        <div className={`${className} rounded-full border flex items-center justify-center text-xl select-none shrink-0 ${preset.bgColor}`}>
          {preset.emoji}
        </div>
      );
    }
  }

  // Fallback to initials
  const initials = getInitials(name);
  const colorClass = getAvatarColor(name);
  return (
    <div className={`${className} rounded-full border flex items-center justify-center font-black text-xs sm:text-sm tracking-tight select-none shrink-0 uppercase ${colorClass}`}>
      {initials}
    </div>
  );
};

interface AvatarSelectorProps {
  name: string;
  avatarType: 'initials' | 'preset';
  avatarKey: string | null;
  onChange: (type: 'initials' | 'preset', key: string | null) => void;
}

export const AvatarSelector: React.FC<AvatarSelectorProps> = ({
  name,
  avatarType,
  avatarKey,
  onChange,
}) => {
  return (
    <div className="bg-[#F7F4EF]/50 p-5 rounded-3xl border border-[#EADFD8] space-y-4">
      <div className="flex items-center gap-4">
        <RenderAvatar name={name} avatarType={avatarType} avatarKey={avatarKey} className="w-16 h-16 text-2xl" />
        <div className="space-y-1">
          <h4 className="text-xs font-black text-[#201A17] uppercase tracking-wider">Foto do Perfil</h4>
          <p className="text-[11px] text-[#756B66] font-semibold leading-relaxed">
            Escolha como prefere ser identificado. Use suas iniciais automáticas ou selecione um dos quitutes mineiros típicos abaixo!
          </p>
        </div>
      </div>

      <div className="h-px bg-[#EADFD8]" />

      <div className="space-y-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange('initials', null)}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all border cursor-pointer ${
              avatarType === 'initials'
                ? 'bg-[#E94F2F] text-white border-[#E94F2F]'
                : 'bg-white text-[#5C534E] border-[#EADFD8] hover:bg-[#F7F4EF]'
            }`}
          >
            Iniciais do Nome
          </button>
          <button
            type="button"
            onClick={() => {
              if (avatarType !== 'preset') {
                onChange('preset', AVATAR_PRESETS[0].key);
              }
            }}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all border cursor-pointer ${
              avatarType === 'preset'
                ? 'bg-[#E94F2F] text-white border-[#E94F2F]'
                : 'bg-white text-[#5C534E] border-[#EADFD8] hover:bg-[#F7F4EF]'
            }`}
          >
            Quitutes Mineiros
          </button>
        </div>

        {avatarType === 'preset' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
            {AVATAR_PRESETS.map((p) => {
              const isSelected = avatarKey === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => onChange('preset', p.key)}
                  className={`p-3 rounded-2xl border transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center relative ${p.bgColor} ${
                    isSelected
                      ? 'ring-2 ring-[#E94F2F] border-transparent scale-[1.02]'
                      : 'hover:scale-[1.01]'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 bg-[#E94F2F] text-white p-0.5 rounded-full">
                      <Check className="w-2.5 h-2.5 stroke-[4px]" />
                    </div>
                  )}
                  <span className="text-2xl select-none">{p.emoji}</span>
                  <span className="text-[10px] font-black text-[#201A17]">{p.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
