export const parseOrderDate = (createdAt: any): Date => {
  if (!createdAt) return new Date();
  
  // If it is already a Date object
  if (createdAt instanceof Date) {
    if (!isNaN(createdAt.getTime())) return createdAt;
    return new Date();
  }
  
  // If it's a Firestore Timestamp or object with seconds
  if (typeof createdAt === 'object') {
    if (typeof createdAt.toDate === 'function') {
      try {
        const d = createdAt.toDate();
        if (!isNaN(d.getTime())) return d;
      } catch (e) {
        console.error("parseOrderDate toDate error", e);
      }
    }
    if (createdAt.seconds !== undefined) {
      const d = new Date(createdAt.seconds * 1000);
      if (!isNaN(d.getTime())) return d;
    }
  }
  
  // If it's a string (e.g. ISO string) or a number (timestamp)
  const dateObj = new Date(createdAt);
  if (!isNaN(dateObj.getTime())) {
    return dateObj;
  }
  
  return new Date(); // Fallback to current date/time to avoid showing any "Invalid Date"
};

export const formatOrderDate = (createdAt: any): string => {
  const date = parseOrderDate(createdAt);
  return date.toLocaleDateString('pt-BR');
};

export const formatOrderTime = (createdAt: any): string => {
  const date = parseOrderDate(createdAt);
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

export const formatOrderDateTime = (createdAt: any): string => {
  const date = parseOrderDate(createdAt);
  const formattedDate = date.toLocaleDateString('pt-BR');
  const formattedTime = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${formattedDate} às ${formattedTime}`;
};
