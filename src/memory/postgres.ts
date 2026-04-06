import { Pool } from 'pg';
import { config } from '../config';

const pool = new Pool({
    connectionString: config.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

export async function initializePostgres() {
    if (!config.NEON_DATABASE_URL) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS activity_log (
                id SERIAL PRIMARY KEY,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                action VARCHAR(255) NOT NULL,
                details TEXT,
                status VARCHAR(50)
            );
            
            CREATE TABLE IF NOT EXISTS cost_log (
                id SERIAL PRIMARY KEY,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                model VARCHAR(255) NOT NULL,
                estimated_cost_cents FLOAT NOT NULL,
                details TEXT
            );
        `);
        console.log('[Postgres] Tier 3 Dashboard tables successfully initialized.');
    } catch (e) {
        console.error('[Postgres] Initialization failed (Failing gracefully).', e);
    }
}

export async function logActivity(action: string, details: string, status: string = 'success') {
    if (!config.NEON_DATABASE_URL) return;
    try {
        await pool.query(
            'INSERT INTO activity_log (action, details, status) VALUES ($1, $2, $3)',
            [action, details, status]
        );
    } catch (e) {
        console.error('[Postgres] Failed to log activity.', e);
    }
}

export async function queryAnalytics(query: string): Promise<any[]> {
    if (!config.NEON_DATABASE_URL) return [];
    try {
        // Only allow SELECT queries for basic safety.
        if (!query.toLowerCase().trim().startsWith('select')) {
            throw new Error("Only SELECT queries are allowed for analytics.");
        }
        
        const res = await pool.query(query);
        return res.rows;
    } catch (e) {
        console.error('[Postgres] Analytics query failed.', e);
        return [{ error: String(e) }];
    }
}
