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
  const [url, setUrl] = useState(() => window.location.pathname + window.location.search);

  useEffect(() => {
    const handleLocationChange = () => {
      setUrl(window.location.pathname + window.location.search);
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

  const pathname = url.split('?')[0];

  return [pathname, navigate] as const;
}
