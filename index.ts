/* eslint-disable no-mixed-spaces-and-tabs */
const { createServer } = require('http');
const { Server } = require('socket.io');
const express = require('express');

const app = express();

const { port, auth: authorization } = require('./config');

const server = createServer(app);
const io = new Server(server);

const botClientData = new Map();
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

                    const lastRequest: number = botClientData.get(socketID)
                        ? botClientData.get(socketID).timestamp || 0
                        : 0;

                    const latency: number = botClientData.get(socketID)
                        ? botClientData.get(socketID).latency || 0
                        : 0;

                    return {
                        socketID: socketID,
                        client: socket.handshake.auth.client,
                        type: socket.handshake.auth.type,
                        latency: latency,
                        lastRequest: lastRequest
                    };
                }
            )
            : [],
        requestClients: io.sockets.adapter.rooms.get('RequestClients')
            ? Array.from(
                io.sockets.adapter.rooms.get('RequestClients').keys()
            ).map((socketID) => {
                const socket = io.sockets.sockets.get(socketID);

                const lastRequest: number = requestClientData.get(socketID)
                    ? requestClientData.get(socketID).timestamp || 0
                    : 0;

                const latency: number = requestClientData.get(socketID)
                    ? requestClientData.get(socketID).latency || 0
                    : 0;

                return {
                    socketID: socketID,
                    client: socket.handshake.auth.client,
                    type: socket.handshake.auth.type,
                    latency: latency,
                    lastRequest: lastRequest
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

setInterval(async () => {
    const sockets: string[] = io.sockets.adapter.rooms.get('RequestClients')
        ? Array.from(io.sockets.adapter.rooms.get('RequestClients').keys())
        : [];

    const promises = [];

    for (const socketID of sockets) {
        const startTime = new Date().getTime();
        promises.push(
            new Promise((resolve) => {
                io.sockets.sockets.get(socketID).emit('ping', () => {
                    const endTime = new Date().getTime();
                    const ping = endTime - startTime;

                    requestClientData.set(
                        socketID,
                        Object.assign({}, requestClientData.get(socketID), {
                            latency: ping
                        })
                    );
                    resolve(ping);
                });
            })
        );
    }

    await Promise.all(promises);

}, 500);

setInterval(async () => {
    const sockets: string[] = io.sockets.adapter.rooms.get('BotClients')
        ? Array.from(io.sockets.adapter.rooms.get('BotClients').keys())
        : [];

    const promises = [];

    for (const socketID of sockets) {
        const startTime = new Date().getTime();
        promises.push(
            new Promise((resolve) => {
                io.sockets.sockets.get(socketID).emit('ping', () => {
                    const endTime = new Date().getTime();
                    const ping = endTime - startTime;

                    botClientData.set(
                        socketID,
                        Object.assign({}, botClientData.get(socketID), {
                            latency: ping
                        })
                    );
                    resolve(ping);
                });
            })
        );
    }

    await Promise.all(promises);

}, 500);


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
                console.log('[WebSocket] (BOT_CLIENT) Socket error');
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
                        ? requestClientData.get(a).timestamp || 0
                        : 0;
                    const bTimestamp: number = requestClientData.get(b)
                        ? requestClientData.get(b).timestamp || 0
                        : 0;
                    return aTimestamp - bTimestamp;
                })[0];

                botClientData.set(
                    socket.id,
                    Object.assign({}, botClientData.get(socket.id), {
                        timestamp: Date.now()
                    })
                );

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
                            ? requestClientData.get(a).timestamp || 0
                            : 0;
                        const bTimestamp: number = requestClientData.get(b)
                            ? requestClientData.get(b).timestamp || 0
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

                botClientData.set(
                    socket.id,
                    Object.assign({}, botClientData.get(socket.id), {
                        timestamp: Date.now()
                    })
                );
                
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
                console.log('[WebSocket] (REQUEST_CLIENT) Socket error');
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
