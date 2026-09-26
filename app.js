const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const SECRET_KEY = process.env.JWT_SECRET || 'secreto_simulacion_sprint_2026';

// Base de datos simulada en memoria para el Sprint 1
const users = [
    { id: 1, username: 'admin_general', password: 'Password123!', role: 'administrador' }
];

const donations = [
    { id: 1, title: 'Lote de Verduras Frescas (50 kg)', donor: 'Supermercado Central', status: 'Disponible' },
    { id: 2, title: 'Arroz y Legumbres (100 kg)', donor: 'Distribuidora del Norte', status: 'En Proceso' }
];

// Endpoint: Registro de usuarios
app.post('/api/register', (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    const validRoles = ['donante', 'organizacion', 'administrador'];
    if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Rol no autorizado en la plataforma.' });
    }

    const existingUser = users.find(u => u.username === username);
    if (existingUser) {
        return res.status(409).json({ error: 'El nombre de usuario ya se encuentra registrado.' });
    }

    const newUser = { id: users.length + 1, username, password, role };
    users.push(newUser);

    return res.status(201).json({
        message: 'Usuario registrado exitosamente',
        user: { id: newUser.id, username: newUser.username, role: newUser.role }
    });
});

// Endpoint: Inicio de sesión y generación de JWT
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    const user = users.find(u => u.username === username && u.password === password);
    if (!user) {
        return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        SECRET_KEY,
        { expiresIn: '2h' }
    );

    return res.status(200).json({
        message: 'Autenticación exitosa',
        token,
        role: user.role,
        username: user.username
    });
});

// Middleware de verificación de JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(403).json({ error: 'Acceso denegado: Token requerido.' });
    }

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Token inválido o expirado.' });
        }
        req.user = decoded;
        next();
    });
};

// Middleware de control de roles (RBAC)
const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Permisos insuficientes para realizar esta operación.' });
        }
        next();
    };
};

// Endpoint protegido: Panel de administración
app.get('/api/admin/metrics', authenticateToken, authorizeRoles('administrador'), (req, res) => {
    res.status(200).json({
        status: 'Operativo',
        totalUsers: users.length,
        totalDonations: donations.length
    });
});

// Endpoint protegido: Consulta de donaciones
app.get('/api/donations', authenticateToken, (req, res) => {
    res.status(200).json({ donations });
});

module.exports = app;