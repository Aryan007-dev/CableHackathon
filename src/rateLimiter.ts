/**
 * Callbacks for UI notifications
 */
type RateLimitCallbacks = {
  onWaitStart?: (waitTimeMs: number) => void;
  onWaitEnd?: () => void;
};

/**
 * RateLimiter - Ensures we don't exceed API rate limits
 *
 * How it works:
 * 1. Tracks timestamps of recent requests in a queue
 * 2. Before each request, removes timestamps older than the time window
 * 3. If we're at the limit, waits until the oldest request expires
 * 4. Recursively checks again after waiting
 */
class RateLimiter {
  private callbacks?: RateLimitCallbacks;
  private queue: number[] = [];
  private limit: number;
  private windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;        // e.g., 5 requests
    this.windowMs = windowMs;  // e.g., 60000ms (1 minute)
  }

  /**
   * Set callbacks for UI notifications
   */
  setCallbacks(callbacks: RateLimitCallbacks) {
    this.callbacks = callbacks;
  }

  async throttle(): Promise<void> {
    const now = Date.now();

    this.queue = this.queue.filter(timestamp => now - timestamp < this.windowMs);

    
    if (this.queue.length >= this.limit) {
     

      const oldestTimestamp = this.queue[0];
      const ageOfOldest = now - oldestTimestamp;
      const waitTime = this.windowMs - ageOfOldest + 100; 

      console.log(`[rate-limit] Hit limit of ${this.limit} requests. Waiting ${Math.round(waitTime / 1000)}s before next request...`);

      // Notify UI that waiting is starting
      this.callbacks?.onWaitStart?.(waitTime);

      await new Promise(resolve => setTimeout(resolve, waitTime));

      // Notify UI that waiting is done
      this.callbacks?.onWaitEnd?.();

      return this.throttle();
    }


    this.queue.push(now);
    console.log(`[rate-limit] Request allowed. Used ${this.queue.length}/${this.limit} slots in current window.`);
  }

  
   
  getStats() {
    const now = Date.now();
    this.queue = this.queue.filter(timestamp => now - timestamp < this.windowMs);
    return {
      used: this.queue.length,
      limit: this.limit,
      available: this.limit - this.queue.length,
    };
  }
}


export const geminiLimiter = new RateLimiter(5, 60000);

// Example usage:
// import { geminiLimiter } from './rateLimiter';
//
// async function callAPI() {
//   await geminiLimiter.throttle(); // This will wait if needed
//   const response = await fetch('/api/chat', { ... });
//   return response;
// }
