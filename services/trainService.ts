
import { TrainPath } from "../types";

// provide basic typings for import.meta.env so TS doesn't complain
interface ImportMetaEnv {
  VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * HYBRID DATABASE SERVICE
 * Uses MongoDB via API as primary storage, with localStorage as fallback cache.
 * Automatically syncs data when server is available.
 */
class TrainService {
  private dbKey = "ir_central_database_v1";
  private apiUrl = process.env.VITE_API_URL || "http://localhost:3001";
  private serverAvailable = true;
  private memoryCache: TrainPath[] | null = null;

  constructor() {
    this.checkServerAvailability();
    setInterval(() => this.checkServerAvailability(), 30000);
  }

  private async checkServerAvailability(): Promise<void> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.apiUrl}/health`, { signal: controller.signal });
      clearTimeout(id);
      this.serverAvailable = response.ok;
    } catch (error) {
      this.serverAvailable = false;
    }
  }

  async getAllTrains(): Promise<TrainPath[]> {
    if (this.serverAvailable) {
      try {
        const response = await fetch(`${this.apiUrl}/api/trains`);
        if (!response.ok) throw new Error("Failed to fetch trains");
        const trains = await response.json();
        const mapped = trains.map((t: any) => ({
          ...t,
          type: t.type === 'FAST_PASSENGER' ? 'PASSENGER' : t.type,
          points: (t.points || []).map((p: any) => ({
            ...p,
            arrivalTime: new Date(p.arrivalTime),
            departureTime: new Date(p.departureTime),
          })),
        }));
        this.memoryCache = mapped;
        return mapped;
      } catch (error) {
        this.serverAvailable = false;
      }
    }
    return this.getLocalData();
  }

  async saveTrain(train: TrainPath): Promise<void> {
    this.updateLocalStorage(train);

    if (this.serverAvailable) {
      fetch(`${this.apiUrl}/api/trains/${train.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(train),
      }).catch(err => console.warn("Sync failed", err));
    }
  }

  async updateTrain(train: TrainPath): Promise<void> {
    await this.saveTrain(train);
  }

  async deleteTrain(id: string): Promise<void> {
    const current = this.getLocalData();
    const updated = current.filter((t) => t.id !== id);
    this.memoryCache = updated;
    localStorage.setItem(this.dbKey, JSON.stringify(updated));

    if (this.serverAvailable) {
      fetch(`${this.apiUrl}/api/trains/${id}`, { method: "DELETE" }).catch(err => console.warn("Delete sync failed", err));
    }
  }

  async deleteBulk(ids: Set<string>): Promise<void> {
    const current = this.getLocalData();
    const updated = current.filter((t) => !ids.has(t.id));
    this.memoryCache = updated;
    localStorage.setItem(this.dbKey, JSON.stringify(updated));

    if (this.serverAvailable) {
      fetch(`${this.apiUrl}/api/trains/bulk/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(ids) }),
      }).catch(error => console.warn("Bulk delete failed", error));
    }
  }

  async clearDatabase(): Promise<void> {
    localStorage.removeItem(this.dbKey);
    this.memoryCache = [];
    if (this.serverAvailable) {
      fetch(`${this.apiUrl}/api/trains?confirm=true`, { method: "DELETE" }).catch(err => console.warn("Clear failed", err));
    }
  }

  private updateLocalStorage(train: TrainPath): void {
    const current = this.getLocalData();
    const existingIdx = current.findIndex((t) => t.id === train.id);
    const updated = existingIdx !== -1 
      ? current.map((t, idx) => (idx === existingIdx ? train : t))
      : [...current, train];

    this.memoryCache = updated;
    localStorage.setItem(this.dbKey, JSON.stringify(updated));
  }

  saveLocally(train: TrainPath): void {
    this.updateLocalStorage(train);
  }

  getLocalData(): TrainPath[] {
    if (this.memoryCache) return this.memoryCache;

    try {
      const raw = localStorage.getItem(this.dbKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      
      this.memoryCache = parsed.map((t: any) => ({
        ...t,
        type: t.type === 'FAST_PASSENGER' ? 'PASSENGER' : t.type,
        points: (t.points || []).map((p: any) => ({
          ...p,
          arrivalTime: new Date(p.arrivalTime),
          departureTime: new Date(p.departureTime),
        })),
      }));
      return this.memoryCache;
    } catch (e) {
      return [];
    }
  }
}

export const trainService = new TrainService();
