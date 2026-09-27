const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();

app.use(express.json());

const viewsPath = path.join(__dirname, 'views');
const pageDefinitions = {
    '/': { file: 'index.html', title: 'Givera', bodyClass: '', page: 'home' },
    '/index.html': { file: 'index.html', title: 'Givera', bodyClass: '', page: 'home' },
    '/login.html': { file: 'login.html', title: 'Inicia Sesión - Givera', bodyClass: 'auth-body', page: 'login' },
    '/registro.html': { file: 'register.html', title: 'Registro - Plataforma de Donaciones', bodyClass: 'auth-body', page: 'register' },
    '/dashboard.html': { file: 'dashboard.html', title: 'Panel de Control - Donaciones', bodyClass: '', page: 'dashboard' }
};

const renderPage = (definition) => {
    const base = fs.readFileSync(path.join(viewsPath, 'base.html'), 'utf8');
    const content = fs.readFileSync(path.join(viewsPath, 'pages', definition.file), 'utf8');
    return base
        .replace('{{title}}', definition.title)
        .replace('{{bodyClass}}', definition.bodyClass)
        .replace('{{page}}', definition.page)
        .replace('{{content}}', content);
};

Object.entries(pageDefinitions).forEach(([route, definition]) => {
    app.get(route, (req, res) => res.type('html').send(renderPage(definition)));
});

app.get('/donations/:id', (req, res) => res.type('html').send(renderPage({
    file: 'donation-detail.html',
    title: 'Detalle de donación - Givera',
    bodyClass: '',
    page: 'donation-detail'
})));

app.use(express.static(path.join(__dirname)));

const SECRET_KEY = process.env.JWT_SECRET || 'secreto-santos-facio';

const { donationCategories, donationStatuses, isAdminRole } = db;

// Endpoint: Registro de usuarios
app.post('/api/register', async (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    const validRoles = ['donante', 'organizacion'];
    if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Rol no autorizado en la plataforma.' });
    }

    const newUser = await db.createUser(username, password, role);
    if (!newUser) {
        return res.status(409).json({ error: 'El nombre de usuario ya se encuentra registrado.' });
    }

    return res.status(201).json({
        message: 'Usuario registrado exitosamente',
        user: { id: newUser.id, username: newUser.username, role: newUser.role }
    });
});

// Endpoint público: recepción de solicitudes de contacto del landing
app.post('/api/contact', async (req, res) => {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
        return res.status(400).json({ error: 'Nombre, correo y mensaje son obligatorios.' });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
    }
    await db.createContact({ name: name.trim(), email: email.trim(), message: message.trim() });
    return res.status(201).json({ message: 'Mensaje recibido. Nuestro equipo se pondrá en contacto contigo.' });
});

// Endpoint: Inicio de sesión y generación de JWT
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    const user = await db.findUser(username, password);
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
        const authorized = isAdminRole(req.user.role)
            ? allowedRoles.some((role) => isAdminRole(role))
            : allowedRoles.includes(req.user.role);
        if (!authorized) {
            return res.status(403).json({ error: 'Permisos insuficientes para realizar esta operación.' });
        }
        next();
    };
};

// Endpoint protegido: Panel de administración
app.get('/api/admin/metrics', authenticateToken, authorizeRoles('administrador'), async (req, res) => {
    res.status(200).json(await db.getMetrics());
});

// Endpoint protegido: listado de donaciones según el rol autenticado
app.get('/api/donations', authenticateToken, async (req, res) => {
    const donations = await db.listDonations(req.user, req.query);
    res.status(200).json({ donations });
});

// Endpoint protegido: detalle de una donación visible para el usuario
app.get('/api/donations/:id', authenticateToken, async (req, res) => {
    const donation = await db.getDonation(Number(req.params.id));
    if (!donation) return res.status(404).json({ error: 'Donación no encontrada.' });

    const canView = isAdminRole(req.user.role)
        || req.user.role === 'organizacion'
        || donation.ownerId === req.user.id;
    if (!canView) return res.status(403).json({ error: 'No tienes permiso para consultar esta donación.' });

    res.status(200).json({ donation });
});

// Endpoint protegido: creación exclusiva para empresas donantes y administradores
app.post('/api/donations', authenticateToken, authorizeRoles('donante', 'administrador'), async (req, res) => {
    const { title, category, quantity, location } = req.body;
    if (!title || !category || quantity === undefined || quantity === '' || !location) {
        return res.status(400).json({ error: 'Título, categoría, cantidad y ubicación son obligatorios.' });
    }
    const numericQuantity = Number(quantity);
    if (!Number.isInteger(numericQuantity) || numericQuantity < 1) {
        return res.status(400).json({ error: 'La cantidad debe ser un número entero positivo.' });
    }
    if (!donationCategories.includes(category)) {
        return res.status(400).json({ error: 'Categoría de donación no válida.' });
    }

    const donation = await db.createDonation({
        userId: req.user.id,
        title: title.trim(),
        category,
        quantity: numericQuantity,
        location: location.trim(),
        username: req.user.username
    });
    res.status(201).json({ donation });
});

// Endpoint protegido: transición de estados con permisos por rol
app.put('/api/donations/:id', authenticateToken, async (req, res) => {
    const donation = await db.getDonation(Number(req.params.id));
    if (!donation) return res.status(404).json({ error: 'Donación no encontrada.' });

    const { status } = req.body;
    const nextStatus = donationStatuses[donationStatuses.indexOf(donation.status) + 1];
    if (status !== nextStatus) {
        return res.status(400).json({ error: `La donación debe avanzar a ${nextStatus || 'un estado válido'}.` });
    }

    const canUpdate = isAdminRole(req.user.role)
        || (req.user.role === 'organizacion' && donation.status !== 'Completada');
    if (!canUpdate) return res.status(403).json({ error: 'No tienes permiso para actualizar esta donación.' });

    const updatedDonation = await db.updateDonation(donation.id, status, req.user.username);
    res.status(200).json({ donation: updatedDonation });
});

module.exports = app;