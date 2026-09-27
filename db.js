const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const databaseEnabled = Boolean(process.env.DATABASE_URL);
const pool = databaseEnabled ? new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
}) : null;

const memory = {
    users: [
        { id: 1, username: 'Givera', password: 'admin6776', role: 'administrador' },
        { id: 2, username: 'Universidad Tecmilenio', password: 'tecmi6776', role: 'donante' },
        { id: 3, username: 'Cruz Roja', password: 'cruzroja6776', role: 'organizacion' }
    ],
    donations: [
        {
            id: 1, ownerId: 2, title: 'Lote de Verduras Frescas (50 kg)', category: 'Alimentos', quantity: 50,
            location: 'Centro de acopio norte', donor: 'Universidad Tecmilenio', status: 'Disponible',
            history: [{ status: 'Disponible', changedAt: new Date().toISOString(), changedBy: 'Universidad Tecmilenio' }]
        },
        {
            id: 2, ownerId: 2, title: 'Arroz y Legumbres (100 kg)', category: 'Alimentos', quantity: 100,
            location: 'Centro de acopio centro', donor: 'Universidad Tecmilenio', status: 'En proceso',
            history: [{ status: 'En proceso', changedAt: new Date().toISOString(), changedBy: 'Universidad Tecmilenio' }]
        }
    ],
    contacts: []
};

const donationCategories = ['Alimentos', 'Ropa', 'Enseres', 'Equipamiento médico', 'Otros'];
const donationStatuses = ['Disponible', 'En proceso', 'Completada'];

async function initializeDatabase() {
    if (!databaseEnabled) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(120) UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role VARCHAR(30) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS donations (
            id SERIAL PRIMARY KEY,
            owner_id INTEGER NOT NULL REFERENCES users(id),
            title TEXT NOT NULL,
            category VARCHAR(80) NOT NULL,
            quantity INTEGER NOT NULL CHECK (quantity > 0),
            location TEXT NOT NULL,
            donor TEXT NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'Disponible',
            history JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS contact_requests (
            id SERIAL PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            email VARCHAR(180) NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    const usersResult = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    if (usersResult.rows[0].count === 0) {
        const seeds = [
            ['Givera', 'admin6776', 'administrador'],
            ['Universidad Tecmilenio', 'tecmi6776', 'donante'],
            ['Cruz Roja', 'cruzroja6776', 'organizacion']
        ];
        for (const [username, password, role] of seeds) {
            const passwordHash = await bcrypt.hash(password, 12);
            await pool.query('INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)', [username, passwordHash, role]);
        }
    }

    const donationsResult = await pool.query('SELECT COUNT(*)::int AS count FROM donations');
    if (donationsResult.rows[0].count === 0) {
        const usersResult = await pool.query('SELECT id, username FROM users WHERE username = $1', ['Universidad Tecmilenio']);
        const donor = usersResult.rows[0];
        const seeds = [
            ['Lote de Verduras Frescas (50 kg)', 'Alimentos', 50, 'Centro de acopio norte', 'Disponible'],
            ['Arroz y Legumbres (100 kg)', 'Alimentos', 100, 'Centro de acopio centro', 'En proceso']
        ];
        for (const [title, category, quantity, location, status] of seeds) {
            const history = [{ status, changedAt: new Date().toISOString(), changedBy: donor.username }];
            await pool.query('INSERT INTO donations (owner_id, title, category, quantity, location, donor, status, history) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [donor.id, title, category, quantity, location, donor.username, status, JSON.stringify(history)]);
        }
    }
}

const ready = initializeDatabase();
const ensureReady = () => ready;
const isAdminRole = (role) => role === 'admin' || role === 'administrador';

async function findUser(username, password) {
    await ready;
    if (!databaseEnabled) return memory.users.find((user) => user.username === username && user.password === password) || null;
    const result = await pool.query('SELECT id, username, password_hash, role FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    return user && await bcrypt.compare(password, user.password_hash) ? user : null;
}

async function createUser(username, password, role) {
    await ready;
    if (!databaseEnabled) {
        if (memory.users.some((user) => user.username === username)) return null;
        const user = { id: memory.users.length + 1, username, password, role };
        memory.users.push(user);
        return user;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    try {
        const result = await pool.query('INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role', [username, passwordHash, role]);
        return result.rows[0];
    } catch (error) {
        if (error.code === '23505') return null;
        throw error;
    }
}

function mapDonation(row) {
    if (!row) return null;
    return { id: row.id, ownerId: row.owner_id ?? row.ownerId, title: row.title, category: row.category, quantity: row.quantity, location: row.location, donor: row.donor, status: row.status, history: row.history || [] };
}

async function listDonations(user, filters = {}) {
    await ready;
    if (!databaseEnabled) {
        let result = memory.donations;
        if (user.role === 'donante') result = result.filter((donation) => donation.ownerId === user.id);
        if (user.role === 'organizacion') result = result.filter((donation) => donation.status !== 'Completada');
        if (filters.category) result = result.filter((donation) => donation.category === filters.category);
        if (filters.status) result = result.filter((donation) => donation.status === filters.status);
        return result;
    }
    const values = [];
    const conditions = [];
    if (user.role === 'donante') { values.push(user.id); conditions.push(`owner_id = $${values.length}`); }
    if (user.role === 'organizacion') conditions.push("status <> 'Completada'");
    if (filters.category) { values.push(filters.category); conditions.push(`category = $${values.length}`); }
    if (filters.status) { values.push(filters.status); conditions.push(`status = $${values.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(`SELECT * FROM donations ${where} ORDER BY created_at DESC, id DESC`, values);
    return result.rows.map(mapDonation);
}

async function getDonation(id) {
    await ready;
    if (!databaseEnabled) return memory.donations.find((donation) => donation.id === id) || null;
    const result = await pool.query('SELECT * FROM donations WHERE id = $1', [id]);
    return mapDonation(result.rows[0]);
}

async function createDonation(data) {
    await ready;
    const history = [{ status: 'Disponible', changedAt: new Date().toISOString(), changedBy: data.username }];
    if (!databaseEnabled) {
        const donation = { id: memory.donations.length ? Math.max(...memory.donations.map((item) => item.id)) + 1 : 1, ownerId: data.userId, title: data.title, category: data.category, quantity: data.quantity, location: data.location, donor: data.username, status: 'Disponible', history };
        memory.donations.push(donation);
        return donation;
    }
    const result = await pool.query('INSERT INTO donations (owner_id, title, category, quantity, location, donor, status, history) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *', [data.userId, data.title, data.category, data.quantity, data.username, data.username, 'Disponible', JSON.stringify(history)]);
    return mapDonation(result.rows[0]);
}

async function updateDonation(id, status, username) {
    await ready;
    const donation = await getDonation(id);
    if (!donation) return null;
    const history = [...donation.history, { status, changedAt: new Date().toISOString(), changedBy: username }];
    if (!databaseEnabled) { donation.status = status; donation.history = history; return donation; }
    const result = await pool.query('UPDATE donations SET status = $1, history = $2 WHERE id = $3 RETURNING *', [status, JSON.stringify(history), id]);
    return mapDonation(result.rows[0]);
}

async function getMetrics() {
    await ready;
    if (!databaseEnabled) return { totalUsers: memory.users.length, totalDonations: memory.donations.length, activeDonations: memory.donations.filter((donation) => donation.status !== 'Completada').length };
    const result = await pool.query('SELECT (SELECT COUNT(*) FROM users)::int AS total_users, (SELECT COUNT(*) FROM donations)::int AS total_donations, (SELECT COUNT(*) FROM donations WHERE status <> \'Completada\')::int AS active_donations');
    const row = result.rows[0];
    return { totalUsers: row.total_users, totalDonations: row.total_donations, activeDonations: row.active_donations };
}

async function createContact({ name, email, message }) {
    await ready;
    if (!databaseEnabled) { memory.contacts.push({ name, email, message, createdAt: new Date().toISOString() }); return; }
    await pool.query('INSERT INTO contact_requests (name, email, message) VALUES ($1, $2, $3)', [name, email, message]);
}

module.exports = { databaseEnabled, ensureReady, isAdminRole, donationCategories, donationStatuses, findUser, createUser, listDonations, getDonation, createDonation, updateDonation, getMetrics, createContact };
