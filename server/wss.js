const debug = require('debug')(`${process.env.APPNAME}:wss`);
const WebSocket = require('ws');

// Store connected clients
const clients = new Map();

function init (port) {
    debug('ws init invoked, port:', port)

    const wss = new WebSocket.Server({ port });
    wss.on('connection', (socket) => {
        debug('A client has connected!');

        // Assign a unique ID to the connected client
        const id = Math.random().toString(36).substring(2, 15);
        clients.set(id, socket);
        console.log('A client has connected!, ID:', id);

        socket.on('error', debug);
        socket.on('message', message => onMessage(wss, socket, message));
        socket.on('close', message => onClose(wss, socket, message));
    })
}

function send(wsClient, type, body) {
    debug('ws send', body);
    wsClient.send(JSON.stringify({
        event: type,
        data: body,
    }))
}

const findClientID = (map, val) => {
    for (let [k, v] of map) {
        if (v === val) { 
            return k; 
        }
    }  
    return null;
}

function clearClient(wss, socket) {
    // clear all client
    let socketClientID = findClientID(clients, socket);
    console.log('Client', socketClientID, 'has leave.')
    clients.delete(socketClientID);
}

function onMessage(wss, socket, message) {
    debug(`onMessage ${message}`);
    console.log(`onMessage ${message}`);

    const parsedMessage = JSON.parse(message)
    const type = parsedMessage.event
    const data = parsedMessage.data
    // Logical socket ID
    let socketClientID = findClientID(clients, socket);
    // console.log('Client Socket ID', socketClientID);

    // Requested socket ID
    let socketID;
    if (parsedMessage.socketID) {
        // console.log('SocketID in root');
        socketID = parsedMessage.socketID;
    }
    else {
        // console.log('SocketID in data');
        socketID = data.socketID;
    }

    // console.log('socketID', socketID);
    // console.log('clientsID', clients.keys());
    
    switch (type) {
        case 'webrtc_msg': {
            console.log('Sending webrtc_msg message from', socketClientID, 'to', socketID);
            let wsClient = clients.get(socketID);
            data['socketID'] = socketClientID;

            if (wsClient)
                send(wsClient, 'webrtc_msg', data);
            else
                console.error('Unable to sent, no socket found!')
            break;
            // socket.to(receivee).emit('webrtc_msg', from_id, msg);            
        }
        default:
            break;
    }

    // // Send message back to all clients connected
    // wss.clients.forEach(client => {
    //     if (client !== socket && client.readyState === WebSocket.OPEN) {
    //         client.send(message, { binary: isBinary });
    //     }
    // });
}

function onClose(wss, socket, message) {
    debug('onClose', message);
    clearClient(wss, socket);
}

module.exports = {
    init,
}
