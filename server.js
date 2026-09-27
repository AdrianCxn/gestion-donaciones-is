const app = require('./app');
const db = require('./db');
const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        await db.ensureReady();
        app.listen(PORT, () => {
            console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('No se pudo inicializar la base de datos:', error.message);
        process.exit(1);
    }
}

startServer();