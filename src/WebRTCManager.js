import { ROS2ImageStreamer } from './ROS2ImageStreamer';

const iceConfiguration = {
    iceServers: [
        {
            urls: 'stun:stun.l.google.com:19302'
        }
    ]
}

class KeyError extends Error {
    constructor(message) {
        super(message);
        this.name = "KeyError";
    }
}

export class DroneStreamManager {
    static ongoingStreams = {};
    static socket = null;

    /**
    * Returns the handle to the drone stream, but will throw an exception if the droneID is invalid
    * @param {String} droneID The socket id of the drone which the stream belongs to
    * @returns {DroneStream} A handle to the stream object if one exists
    */
    static getStreamByDroneID(droneID) {
        if (droneID in this.ongoingStreams) {
            return this.ongoingStreams[droneID];
        }
        else {
            throw new KeyError(`DroneID ('${droneID}') not found in dictionary of ongoing streams`);
        }
    }

    static setupSocketEvent(socket, droneID) {
        this.socket = socket;
        console.log('setupSocketEvent set');
        socket.onmessage = (message) => {
            console.log(`onMessage ${message.data}`);
            const data = JSON.parse(message.data);
            if (data.event === 'webrtc_msg') {
                console.log('setupSocketEvent webrtc_msg message');
                const droneStream = this.getStreamByDroneID(droneID);
                droneStream.handleIncomingSocketMsg(data.data);
                console.log("Found drone " + droneStream + " that is receiving a webrtc_msg (" + data.data.socketID + ")");
            }
        };
    }

    static createDroneStream(droneID, videoTagID) {
        // TODO: Prevent streams from getting instantiated if they are already ongoing
        let stream = new DroneStream(droneID, videoTagID);
        this.ongoingStreams[droneID] = stream;
        return stream;
    }

    static closeDroneStream(droneID) {
        // This should trigger the connection state event on DroneStream
        console.log("Closing drone stream for " + droneID);
        let stream = this.getStreamByDroneID(droneID);
        
        // Stop ROS2 streaming if active
        if (stream.ros2Streamer) {
            stream.ros2Streamer.disconnect();
        }
        
        stream.peerConnection.close();
        delete this.ongoingStreams[droneID];
        stream.peerConnection = null;
        stream = null;
    }
}

class DroneStream {
    /**
    * Returns the encapsulated variables and functions used for streaming video from a drone
    * @param {String} droneSocketID The socket id of the drone to establish a P2P connection to
    * @param {String} srcID The id of the HTML Video tag to render the result to
    */
    constructor(droneSocketID, srcID) {
        this.droneSocketID = droneSocketID;
        this.streamObj = document.getElementById(srcID);
        this.ros2Streamer = null;

        this.createPeerConnection();
    }

    sendMessage(message) {
        console.log('Client sending message: ' + message + " to drone ID: " + this.droneSocketID);
        DroneStreamManager.socket.send(JSON.stringify({ event: 'webrtc_msg', socketID: this.droneSocketID, data: message }));
    }

    handleIncomingSocketMsg(message) {
        // This client receives a message
        console.log('Client received message:', message);
        // An 'answer' is the response of another client after making an 'offer'. 
        if (message.type === 'answer') {
            this.peerConnection.setRemoteDescription(new RTCSessionDescription(message));
        }
        else if (message.type === 'candidate') {
            var candidate = new RTCIceCandidate({
                sdpMLineIndex: message.label,
                candidate: message.candidate
            });
            this.peerConnection.addIceCandidate(candidate);
        }
    }

    startDroneStream() {
        this.peerConnection.createOffer()
            .then((offer) => {
                console.log("WebRTC offer created: " + offer);
                return this.peerConnection.setLocalDescription(offer); // IMPORTANT: Remember to return this Promise
            })
            .then(() => {
                console.log("WebRTC local description set: " + this.peerConnection.localDescription);
                this.sendMessage(this.peerConnection.localDescription);
            })
            .catch((reason) => {
                // An error occurred, so handle the failure to connect
                console.log('createOffer() error: ', reason);
            });
    }

    handleOnTrack(event) {
        this.streamObj.srcObject = event.streams[0];
        
        // Initialize ROS2 image streaming when video track is received
        this.initializeROS2Streaming();
        
        return false;
    }

    async initializeROS2Streaming() {
        try {
            // Wait a bit for the video element to be ready
            setTimeout(async () => {
                console.log('Initializing ROS2 image streaming...');
                
                this.ros2Streamer = new ROS2ImageStreamer(this.streamObj);
                
                try {
                    await this.ros2Streamer.connect();
                    console.log('Connected to ROS2 image publisher service');
                    
                    // Start streaming at 10 FPS
                    this.ros2Streamer.startStreaming(10);
                    console.log('Started ROS2 image streaming at 10 FPS');
                    
                } catch (error) {
                    console.error('Failed to connect to ROS2 image publisher service:', error);
                    console.warn('Make sure the ROS2 image publisher service is running (npm run ros2-publisher)');
                }
            }, 1000);
            
        } catch (error) {
            console.error('Error initializing ROS2 streaming:', error);
        }
    }

    handleOnConnectionStateChange(event) {
        switch (this.peerConnection.connectionState) {
            case "new":
            case "checking":
                console.log("Connecting…");
                break;
            case "connected":
                console.log("Online");
                break;
            case "disconnected":
                console.log("Disconnecting…");
                break;
            case "closed":
                console.log("Offline");
                break;
            case "failed":
                console.log("Error");
                break;
            default:
                console.log("Unknown");
                break;
        }
    }

    createPeerConnection() {
        try {
            // NOTE: We will need one RTCPeerConnection for each drone we are connecting to
            this.peerConnection = new RTCPeerConnection(iceConfiguration);  // Our P2P connection with another client (drone)
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendMessage({
                        type: 'candidate',
                        label: event.candidate.sdpMLineIndex,
                        id: event.candidate.sdpMid,
                        candidate: event.candidate.candidate
                    });
                } else {
                    console.log('End of candidates.');
                }
            }

            /* Error handling */
            // This error might just be thrown when one or another peer disconnects
            this.peerConnection.onicecandidateerror = (event) => { throw new Error("[WebRTC](OnIceCandidateError) something went wrong with ice candidates") };

            // When we receive a stream from the other client
            this.peerConnection.ontrack = (event) => { this.handleOnTrack(event); };
            this.peerConnection.onconnectionstatechange = (event) => { this.handleOnConnectionStateChange(event); }

            // Configure transceivers to only receive, not send
            this.peerConnection.addTransceiver('video', { 'direction': 'recvonly' }); // Only accept video, don't send it
            this.peerConnection.addTransceiver('audio', { 'direction': 'recvonly' }); // Only accept audio, don't send it

            console.log("Created RTCPeerConnection: " + this.peerConnection);
        } catch (e) {
            console.log('Failed to create PeerConnection, exception: ' + e.message + e);
        }
    }
}

