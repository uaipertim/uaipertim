import { useState, useEffect } from 'react';

// Patch pushState to emit pushstate-changed event
if (typeof window !== 'undefined') {
  const originalPushState = window.history.pushState;
  window.history.pushState = function (...args) {
    const result = originalPushState.apply(this, args);
    window.dispatchEvent(new Event('pushstate-changed'));
    return result;
  };

  const originalReplaceState = window.history.replaceState;
  window.history.replaceState = function (...args) {
    const result = originalReplaceState.apply(this, args);
    window.dispatchEvent(new Event('pushstate-changed'));
    return result;
  };
}

export function useLocation() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const handleLocationChange = () => {
      setPath(window.location.pathname);
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('pushstate-changed', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('pushstate-changed', handleLocationChange);
    };
  }, []);

  const navigate = (to: string) => {
    window.history.pushState({}, '', to);
  };

  return [path, navigate] as const;
}
