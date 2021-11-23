const { createServer } = require('http');
const { Server } = require('socket.io');
const express = require('express');

const app = express();

const port = process.env.PORT || 4000;
const server = createServer(app);
const io = new Server(server);

// Settings

app.set('port', port);
app.set('json spaces', 2);

// Middlewares

app.use(express.json());
app.use(
	express.urlencoded({
		extended: false
	})
);

let botConnections = 0;
let requestClientConnections = 0;

app.get('/', (req, res) => {
    res.status(200).json({ botConnections: botConnections, requestClientConnections: requestClientConnections });
})

setInterval(() => {
    const botClients = io.sockets.adapter.rooms.get('Bots');


    botConnections = botClients ? botClients.size : 0;

    const requestClients = io.sockets.adapter.rooms.get('RequestClients');


    requestClientConnections = requestClients ? requestClients.size : 0;

}, 10)

io.use((socket, next) => {
	if (socket.handshake.auth && socket.handshake.auth.token) {
        if (!socket.handshake.auth.client) return next(new Error('Malformed handshake auth error'));
		if (socket.handshake.auth.token !== process.env.REQUEST_AUTH) {
			return next(new Error('Authentication error'));
		} else {
			next();
		}
        
	} else {
		next(new Error('Authentication error'));
	}
}).on('connection', (socket) => {
    try {
        if (socket.handshake.auth.client == 'Bot') {
            socket.join('Bots');
            console.log(`[WebSocket] (BOT_CLIENT) A connection has been made. (${socket.id}) ${socket.adapter.sids.size} connected clients.`);

            socket.on('error', (err: any) => {
                console.log('Socket error');
                if (err) {
                    socket.disconnect();
                }
            });

            socket.on('ping', (callback: any) => {
                callback();  
            });

            socket.on('requests', (request: any[], callback: any) => {
                callback({ sas: 'fresca'});  
            });

            socket.on('disconnect', (reason: string) => {
                console.log(`[WebSocket] (BOT_CLIENT) Socket ${socket.id} disconnected. (${reason}) ${socket.adapter.sids.size} connected clients.`);
            });
        } else if (socket.handshake.auth.client == 'RequestClient') {
            socket.join('RequestClients');
            console.log(`[WebSocket] (REQUEST_CLIENT) A connection has been made. (${socket.id}) ${socket.adapter.sids.size} connected clients.`);

            socket.on('error', (err: any) => {
                console.log('Socket error');
                if (err) {
                    socket.disconnect();
                }
            });

            socket.on('ping', (callback: any) => {
                callback();  
            });

            socket.on('disconnect', (reason: string) => {
                console.log(`[WebSocket] (REQUEST_CLIENT) Socket ${socket.id} disconnected. (${reason}) ${socket.adapter.sids.size} connected clients.`);
            });
        }

    } catch (e) {
        console.log(e.toString());
    }
});

server.listen(app.get('port'), () => {
	console.log(`[WebServer] App listening on port ${app.get('port')}`);
});