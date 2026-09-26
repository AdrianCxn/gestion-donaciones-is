const request = require('supertest');
const app = require('../app');

describe('Suite de Pruebas Automatizadas - Modulo de Usuarios y Seguridad', () => {
    let adminToken;
    let donorToken;

    // 1. Registro exitoso de un donante
    it('Debe registrar exitosamente a una empresa donante (201 Created)', async () => {
        const res = await request(app)
            .post('/api/register')
            .send({
                username: 'empresa_alimentos_sa',
                password: 'PasswordSegura2026!',
                role: 'donante'
            });
        expect(res.statusCode).toBe(201);
        expect(res.body.user).toHaveProperty('id');
        expect(res.body.user.username).toBe('empresa_alimentos_sa');
    });

    // 2. Falla por campos incompletos
    it('Debe rechazar solicitudes con datos faltantes (400 Bad Request)', async () => {
        const res = await request(app)
            .post('/api/register')
            .send({ username: 'usuario_incompleto' });
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('error');
    });

    // 3. Falla por rol inexistente
    it('Debe denegar el registro si se proporciona un rol no valido', async () => {
        const res = await request(app)
            .post('/api/register')
            .send({
                username: 'usuario_invalido',
                password: 'Password123!',
                role: 'rol_inexistente'
            });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('Rol no autorizado en la plataforma.');
    });

    // 4. Rechazo de usuario duplicado
    it('Debe evitar el registro de nombres de usuario repetidos (409 Conflict)', async () => {
        const res = await request(app)
            .post('/api/register')
            .send({
                username: 'empresa_alimentos_sa',
                password: 'PasswordSegura2026!',
                role: 'donante'
            });
        expect(res.statusCode).toBe(409);
    });

    // 5. Autenticacion exitosa de administrador
    it('Debe autenticar correctamente y retornar el token JWT para administrador', async () => {
        const res = await request(app)
            .post('/api/login')
            .send({
                username: 'admin_general',
                password: 'Password123!'
            });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body.role).toBe('administrador');
        adminToken = res.body.token;
    });

    // 6. Denegacion por credenciales erroneas
    it('Debe denegar acceso ante credenciales invalidas (401 Unauthorized)', async () => {
        const res = await request(app)
            .post('/api/login')
            .send({
                username: 'admin_general',
                password: 'ContrasenaIncorrecta!'
            });
        expect(res.statusCode).toBe(401);
    });

    // 7. Ruta de metricas: Administrador autorizado (200 OK)
    it('Debe permitir acceso al panel de metricas administrativas con rol administrador', async () => {
        const res = await request(app)
            .get('/api/admin/metrics')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('totalUsers');
    });

    // 8. Ruta de metricas: Denegado para donantes (403 Forbidden)
    it('Debe prohibir el acceso a metricas administrativas a usuarios con rol donante', async () => {
        const loginRes = await request(app)
            .post('/api/login')
            .send({
                username: 'empresa_alimentos_sa',
                password: 'PasswordSegura2026!'
            });
        donorToken = loginRes.body.token;

        const res = await request(app)
            .get('/api/admin/metrics')
            .set('Authorization', `Bearer ${donorToken}`);
        expect(res.statusCode).toBe(403);
    });

    // 9. Bloqueo de peticion sin token
    it('Debe denegar acceso a donaciones sin cabecera de autorizacion (403 Forbidden)', async () => {
        const res = await request(app).get('/api/donations');
        expect(res.statusCode).toBe(403);
    });

    // 10. Consulta de donaciones con token valido
    it('Debe permitir listar donaciones con sesion activa verificada', async () => {
        const res = await request(app)
            .get('/api/donations')
            .set('Authorization', `Bearer ${donorToken}`);
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body.donations)).toBe(true);
    });
});