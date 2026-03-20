// Converted from TypeScript to plain JavaScript for simplicity
// Hybrid database service with MongoDB primary and localStorage fallback.

export class TrainService {
    constructor() {
        this.dbKey = "ir_central_database_v1";
        this.apiUrl = (import.meta.env && import.meta.env.VITE_API_URL) || "http://localhost:3001";
        this.serverAvailable = true;

        // Check server availability on init
        this.checkServerAvailability();
        setInterval(() => this.checkServerAvailability(), 30000);
    }

    async checkServerAvailability() {
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(`${this.apiUrl}/health`, { signal: controller.signal });
            clearTimeout(id);
            this.serverAvailable = response.ok;
            if (this.serverAvailable) {
                console.log("✓ MongoDB server available");
            }
        } catch (error) {
            this.serverAvailable = false;
            console.warn("⚠ MongoDB server unavailable, using localStorage fallback");
        }
    }

    async getAllTrains() {
        if (this.serverAvailable) {
            try {
                const response = await fetch(`${this.apiUrl}/api/trains`);
                if (!response.ok) throw new Error("Failed to fetch trains");
                const trains = await response.json();
                return trains.map(t => ({
                    ...t,
                    points: (t.points || []).map(p => ({
                        ...p,
                        arrivalTime: new Date(p.arrivalTime),
                        departureTime: new Date(p.departureTime),
                    })),
                }));
            } catch (error) {
                console.warn("Error fetching from server, falling back to localStorage", error);
                this.serverAvailable = false;
            }
        }

        return new Promise(resolve => {
            const data = localStorage.getItem(this.dbKey);
            if (!data) return resolve([]);
            try {
                const parsed = JSON.parse(data);
                if (!Array.isArray(parsed)) return resolve([]);
                const standardized = parsed.map(t => ({
                    ...t,
                    points: (t.points || []).map(p => ({
                        ...p,
                        arrivalTime: new Date(p.arrivalTime),
                        departureTime: new Date(p.departureTime),
                    })),
                }));
                const uniqueMap = new Map();
                standardized.forEach(t => { if (t.id) uniqueMap.set(t.id, t); });
                resolve(Array.from(uniqueMap.values()));
            } catch (e) {
                console.error("Database corruption detected.", e);
                resolve([]);
            }
        });
    }

    async saveTrain(train) {
        console.debug('trainService.saveTrain called', { id: train.id, serverAvailable: this.serverAvailable });
        if (this.serverAvailable) {
            try {
                const response = await fetch(`${this.apiUrl}/api/trains/${train.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(train),
                });
                if (!response.ok) throw new Error("Failed to save train");
                console.log(`✓ Train "${train.name}" saved to MongoDB`);
                await this.updateLocalStorage(train);
                return;
            } catch (error) {
                console.warn("Error saving to server, falling back to localStorage", error);
                this.serverAvailable = false;
            }
        }
        console.warn('trainService.saveTrain falling back to localStorage', { id: train.id });
        await this.updateLocalStorage(train);
    }

    async updateTrain(train) {
        await this.saveTrain(train);
    }

    async deleteTrain(id) {
        if (this.serverAvailable) {
            try {
                const response = await fetch(`${this.apiUrl}/api/trains/${id}`, { method: "DELETE" });
                if (!response.ok) throw new Error("Failed to delete train");
                console.log("✓ Train deleted from MongoDB");
                const current = await this.getAllTrains();
                const updated = current.filter(t => t.id !== id);
                localStorage.setItem(this.dbKey, JSON.stringify(updated));
                return;
            } catch (error) {
                console.warn("Error deleting from server, falling back to localStorage", error);
                this.serverAvailable = false;
            }
        }
        const current = await this.getAllTrains();
        const updated = current.filter(t => t.id !== id);
        localStorage.setItem(this.dbKey, JSON.stringify(updated));
    }

    async deleteBulk(ids) {
        if (this.serverAvailable) {
            try {
                const response = await fetch(`${this.apiUrl}/api/trains/bulk/delete`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids: Array.from(ids) }),
                });
                if (!response.ok) throw new Error("Failed to bulk delete trains");
                console.log(`✓ ${ids.size} trains deleted from MongoDB`);
                const current = await this.getAllTrains();
                const updated = current.filter(t => !ids.has(t.id));
                localStorage.setItem(this.dbKey, JSON.stringify(updated));
                return;
            } catch (error) {
                console.warn("Error bulk deleting from server, falling back to localStorage", error);
                this.serverAvailable = false;
            }
        }
        const current = await this.getAllTrains();
        const updated = current.filter(t => !ids.has(t.id));
        localStorage.setItem(this.dbKey, JSON.stringify(updated));
    }

    async clearDatabase() {
        if (this.serverAvailable) {
            try {
                const response = await fetch(`${this.apiUrl}/api/trains?confirm=true`, { method: "DELETE" });
                if (!response.ok) throw new Error("Failed to clear database");
                console.log("✓ Database cleared in MongoDB");
                localStorage.removeItem(this.dbKey);
                return;
            } catch (error) {
                console.warn("Error clearing server database, falling back to localStorage", error);
                this.serverAvailable = false;
            }
        }
        localStorage.removeItem(this.dbKey);
    }

    async updateLocalStorage(train) {
        const current = await this.getAllTrains();
        const existingIdx = current.findIndex(t => t.id === train.id);
        let updated;
        if (existingIdx !== -1) {
            updated = current.map((t, idx) => idx === existingIdx ? train : t);
        } else {
            updated = [...current, train];
        }
        localStorage.setItem(this.dbKey, JSON.stringify(updated));
    }

    async saveLocally(train) {
        console.debug('trainService.saveLocally called', { id: train.id });
        await this.updateLocalStorage(train);
    }

    getLocalData() {
        try {
            const raw = localStorage.getItem(this.dbKey);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed;
        } catch (e) {
            console.error('trainService.getLocalData error', e);
            return [];
        }
    }
}

export const trainService = new TrainService();
