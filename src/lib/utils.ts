import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Il calcolo delle ore vive interamente in `lib/hours.ts`.
 * Questi re-export esistono solo per non spezzare gli import esistenti.
 */
export { calculateDuration, formatDuration, parseRate } from './hours';
