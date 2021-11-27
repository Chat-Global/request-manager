/* eslint-disable no-mixed-spaces-and-tabs */
const { createServer } = require('http');
const { Server } = require('socket.io');
const express = require('express');

const app = express();

const { port, auth: authorization } = require('./config');

const server = createServer(app);
const io = new Server(server);

const requestClientData = new Map();

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
    res.status(200).json({
        botConnections: botConnections,
        requestClientConnections: requestClientConnections,
        botClients: io.sockets.adapter.rooms.get('BotClients')
            ? Array.from(io.sockets.adapter.rooms.get('BotClients').keys()).map(
                (socketID) => {
                    const socket = io.sockets.sockets.get(socketID);
                    return {
                        socketID: socketID,
                        client: socket.handshake.auth.client,
                        type: socket.handshake.auth.type
                    };
                }
            )
            : [],
        requestClients: io.sockets.adapter.rooms.get('RequestClients')
            ? Array.from(
                io.sockets.adapter.rooms.get('RequestClients').keys()
            ).map((socketID) => {
                const socket = io.sockets.sockets.get(socketID);
                return {
                    socketID: socketID,
                    client: socket.handshake.auth.client,
                    type: socket.handshake.auth.type
                };
            })
            : []
    });
});

setInterval(() => {
    const botClients = io.sockets.adapter.rooms.get('BotClients');

    botConnections = botClients ? botClients.size : 0;

    const requestClients = io.sockets.adapter.rooms.get('RequestClients');

    requestClientConnections = requestClients ? requestClients.size : 0;
}, 50);

io.use((socket, next) => {
    if (socket.handshake.auth && socket.handshake.auth.token) {
        if (!socket.handshake.auth.client)
            return next(new Error('Malformed handshake auth error'));
        if (socket.handshake.auth.token !== authorization) {
            return next(new Error('Authentication error'));
        } else {
            next();
        }
    } else {
        next(new Error('Authentication error'));
    }
}).on('connection', (socket) => {
    try {
        if (socket.handshake.auth.type == 'BotClient') {
            socket.join('BotClients');

            botConnections = io.sockets.adapter.rooms.get('BotClients')
                ? io.sockets.adapter.rooms.get('BotClients').size
                : 0;

            console.log(
                `[WebSocket] (BOT_CLIENT) A connection has been made. (${socket.id}) ${botConnections} connected clients.`
            );

            socket.on('error', (err: any) => {
                console.log('Socket error');
                if (err) {
                    socket.disconnect();
                }
            });

            socket.on('ping', (callback: any) => {
                callback();
            });

            socket.on('request', (request: any, callback: any) => {
                const sockets: string[] = io.sockets.adapter.rooms.get(
                    'RequestClients'
                )
                    ? Array.from(
                        io.sockets.adapter.rooms
                            .get('RequestClients')
                            .keys()
                    )
                    : [];

                if (sockets.length === 0)
                    return callback({
                        result: {
                            status: 'error',
                            text: 'No RequestClients availables.'
                        }
                    });

                const socketID = sockets.sort((a: string, b: string) => {
                    const aTimestamp: number = requestClientData.get(a)
                        ? requestClientData.get(a).timestamp
                        : 0;
                    const bTimestamp: number = requestClientData.get(b)
                        ? requestClientData.get(b).timestamp
                        : 0;
                    return aTimestamp - bTimestamp;
                })[0];

                requestClientData.set(
                    socketID,
                    Object.assign({}, requestClientData.get(socketID), {
                        timestamp: Date.now()
                    })
                );

                io.sockets.sockets
                    .get(socketID)
                    .emit('request', request, (response) => {
                        callback(response);
                    });
            });

            socket.on('requests', async (requests: any[], callback: any) => {
                const sockets: any[] = io.sockets.adapter.rooms.get(
                    'RequestClients'
                )
                    ? Array.from(
                        io.sockets.adapter.rooms
                            .get('RequestClients')
                            .keys()
                    ).sort((a: string, b: string) => {
                        const aTimestamp: number = requestClientData.get(a)
                            ? requestClientData.get(a).timestamp
                            : 0;
                        const bTimestamp: number = requestClientData.get(b)
                            ? requestClientData.get(b).timestamp
                            : 0;
                        return aTimestamp - bTimestamp;
                    })
                    : [];

                const socketsSize = sockets.length;

                if (sockets.length === 0)
                    return callback({
                        result: {
                            status: 'error',
                            text: 'No RequestClients availables.'
                        }
                    });

                let requestIndex = 0;

                const requestsArr = requests.map((request) => {
                    const result = {
                        request: request,
                        index: requestIndex
                    };
                    requestIndex++;
                    return result;
                });

                const chunkedRequests = [];

                const requestsArrLength = requestsArr.length;

                let [...array] = requestsArr;

                for (let i = socketsSize; i > 0; i--) {
                    chunkedRequests.push(
                        array.splice(0, Math.ceil(requestsArrLength / i))
                    );
                }

                const promises = [];

                let socketIndex = 0;

                for (const socketRequests of chunkedRequests) {
                    if (socketRequests.length == 0) continue;

                    const socketID = sockets[socketIndex];

                    requestClientData.set(
                        socketID,
                        Object.assign({}, requestClientData.get(socketID), {
                            timestamp: Date.now()
                        })
                    );

                    promises.push(
                        new Promise((resolve) => {
                            console.log(
                                `Emitiendo request a ${io.sockets.sockets.get(socketID).handshake
                                    .auth.client
                                } ==>`,
                                socketRequests
                            );
                            io.sockets.sockets
                                .get(socketID)
                                .emit(
                                    'requests',
                                    socketRequests,
                                    (response) => {
                                        resolve(response);
                                    }
                                );
                        })
                    );

                    socketIndex++;
                }

                const responses = await Promise.all(promises);


                callback(responses.reduce((acc, val) => acc.concat(val), []).sort((a, b) => a.index - b.index));
            });

            socket.on('disconnect', (reason: string) => {
                botConnections = io.sockets.adapter.rooms.get('BotClients')
                    ? io.sockets.adapter.rooms.get('BotClients').size
                    : 0;
                console.log(
                    `[WebSocket] (BOT_CLIENT) Socket ${socket.id} disconnected. (${reason}) ${botConnections} connected clients.`
                );
            });
        } else if (socket.handshake.auth.type == 'RequestClient') {
            socket.join('RequestClients');

            requestClientConnections = io.sockets.adapter.rooms.get(
                'RequestClients'
            )
                ? io.sockets.adapter.rooms.get('RequestClients').size
                : 0;

            console.log(
                `[WebSocket] (REQUEST_CLIENT) A connection has been made. (${socket.id}) ${requestClientConnections} connected clients.`
            );

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
                requestClientConnections = io.sockets.adapter.rooms.get(
                    'RequestClients'
                )
                    ? io.sockets.adapter.rooms.get('RequestClients').size
                    : 0;
                console.log(
                    `[WebSocket] (REQUEST_CLIENT) Socket ${socket.id} disconnected. (${reason}) ${requestClientConnections} connected clients.`
                );
            });
        }
    } catch (e) {
        console.log('Error:', e.toString());
    }
});

server.listen(app.get('port'), () => {
    console.log(`[WebServer] App listening on port ${app.get('port')}`);
});
