const SocketIO = require('socket.io');
const log = require("metalogger")();

module.exports = (server, app) => {
    const io = SocketIO(server, { path: '/wallet/socket.io' });
    app.set('io', io);

    io.on('connection', (socket) => {
        const req = socket.request;
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        log.info('새로운 클라이언트 접속!', ip, socket.id, req.ip);
        socket.on('disconnect', () => {
            log.info('클라이언트 접속 해제', ip, socket.id);
            clearInterval(socket.interval);
        });
        socket.on('error', (error) => {
            log.error(error);
        });
    });
};