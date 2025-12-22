import { useEffect } from 'react';

export default function useScrollTrigger(triggerFn, delay = 8000) {
  useEffect(() => {
    const id = setTimeout(triggerFn, delay);
    return () => clearTimeout(id);
  }, [triggerFn, delay]);
}
