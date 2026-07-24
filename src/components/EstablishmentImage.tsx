import React, { useState, useEffect, useRef } from 'react';

export const EstablishmentImage: React.FC<{
  src?: string | null;
  alt: string;
  fallbackType: 'logo' | 'cover';
  className?: string;
  loading?: 'eager' | 'lazy';
}> = ({ src, alt, fallbackType, className, loading }) => {
  const [currentSrc, setCurrentSrc] = useState<string>(src || '');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setCurrentSrc(src || '');
    setHasLoaded(false);
    setHasError(false);
  }, [src]);

  // Use a ref callback to immediately detect if the image has finished loading (cached)
  const setImgRef = (el: HTMLImageElement | null) => {
    (imgRef as any).current = el;
    if (el && el.complete && el.naturalWidth > 0) {
      // Use Promise.resolve().then to avoid updating state during rendering/reconciliation phase
      Promise.resolve().then(() => {
        setHasLoaded(true);
      });
    }
  };

  const handleError = () => {
    setHasError(true);
  };

  const handleLoad = () => {
    setHasLoaded(true);
  };

  if (hasError || !currentSrc) {
    if (fallbackType === 'logo') {
      const initials = alt
        .split(' ')
        .filter(s => s.length > 0)
        .map(s => s[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();
        
      return (
        <div className={`${className || ''} bg-neutral-200 flex items-center justify-center font-black text-neutral-500 text-lg`}>
          {initials}
        </div>
      );
    }
    return (
      <div className={`${className || ''} bg-neutral-100 flex items-center justify-center`} />
    );
  }

  // To prevent Tailwind's opacity utilities from overriding opacity-0 when image hasn't loaded yet,
  // we strip any opacity- classes from the parent className if hasLoaded is false.
  const cleanedClassName = hasLoaded
    ? (className || '')
    : (className || '')
        .split(' ')
        .filter(c => !c.startsWith('opacity-'))
        .join(' ');

  // Check if the original className contains any non-zero opacity classes (e.g. opacity-75 or opacity-50)
  const hasOpacityClass = (className || '').split(' ').some(c => c.startsWith('opacity-') && c !== 'opacity-0');

  // If the image is loaded, we apply opacity-100 ONLY if there was no custom opacity (like opacity-75) passed down.
  // This ensures that closed/paused cards still get their designed faded opacity, while open cards get 100% opacity.
  const finalClassName = `${cleanedClassName} ${hasLoaded ? (hasOpacityClass ? '' : 'opacity-100') : 'opacity-0'} transition-opacity`;

  return (
    <img
      ref={setImgRef}
      src={currentSrc}
      alt={alt}
      onError={handleError}
      onLoad={handleLoad}
      className={finalClassName}
      referrerPolicy="no-referrer"
      loading={loading}
    />
  );
};
