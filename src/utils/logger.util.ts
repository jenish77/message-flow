export function maskPhoneNumber(phone?: string): string {
  if (!phone) return '';
  if (phone.length <= 4) return '***';
  return phone.slice(0, 3) + '****' + phone.slice(-2);
}

export function sanitizeLogData(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (data instanceof Date) {
    return data.toISOString();
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeLogData);
  }

  const copy: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    if (key === 'text' || key === 'textContent') {
      copy[key] = '[REDACTED_CONTENT]';
    } else if (key === 'to' && typeof value === 'string') {
      copy[key] = maskPhoneNumber(value);
    } else if (value && typeof value === 'object') {
      copy[key] = sanitizeLogData(value);
    } else {
      copy[key] = value;
    }
  }

  return copy;
}

export const logger = {
  info: (message: string, meta?: any) => {
    const timestamp = new Date().toISOString();
    if (meta) {
      console.log(`[${timestamp}] [INFO] ${message}`, JSON.stringify(sanitizeLogData(meta)));
    } else {
      console.log(`[${timestamp}] [INFO] ${message}`);
    }
  },
  warn: (message: string, meta?: any) => {
    const timestamp = new Date().toISOString();
    if (meta) {
      console.warn(`[${timestamp}] [WARN] ${message}`, JSON.stringify(sanitizeLogData(meta)));
    } else {
      console.warn(`[${timestamp}] [WARN] ${message}`);
    }
  },
  error: (message: string, meta?: any) => {
    const timestamp = new Date().toISOString();
    if (meta) {
      console.error(`[${timestamp}] [ERROR] ${message}`, JSON.stringify(sanitizeLogData(meta)));
    } else {
      console.error(`[${timestamp}] [ERROR] ${message}`);
    }
  },
};
